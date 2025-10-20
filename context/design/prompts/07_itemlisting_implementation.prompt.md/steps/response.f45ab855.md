---
timestamp: 'Sun Oct 19 2025 16:35:09 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_163509.15ced551.md]]'
content_id: f45ab855453f52a34842b0d8aa969d9d7c0bc58036430f962fa8aaff7e00f6bc
---

# response:

Here's the complete implementation for the `ItemListing` concept, including the TypeScript implementation, a comprehensive test suite in Likert Survey format, mock services, and fake test data, structured according to your requirements.

***

### 1. `ItemListingConcept.ts` (TypeScript Implementation)

```typescript
// ItemListingConcept.ts

import {
  Collection,
  Db,
  MongoClient,
  ObjectId,
} from "npm:mongodb";

// --- Types & Interfaces ---

export type ListingId = ObjectId;
export type UserId = ObjectId;
export type Tag = string;
export type CurrencyAmount = number; // Assuming number for simplicity, could be a more complex object like { amount: number, currency: string }

export enum ListingStatus {
  Active = "Active",
  Sold = "Sold",
  Withdrawn = "Withdrawn",
}

export interface ItemListing {
  _id: ListingId;
  seller: UserId;
  title: string;
  description: string;
  photos: string[]; // List of URLs
  tags: Tag[];
  minAsk?: CurrencyAmount; // Optional minimum asking price
  createdAt: Date;
  status: ListingStatus;
  currentHighestBid?: ObjectId; // References a BidId (ObjectId from a Bidding concept)
  bidLog: ObjectId[]; // List of BidIds that have been placed on this listing (could be useful for history)
}

// --- Custom Errors ---

/**
 * Base error class for all listing-related errors.
 */
export class ListingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListingError";
  }
}

/**
 * Error thrown when a requested listing cannot be found.
 */
export class ListingNotFoundError extends ListingError {
  constructor(listingId: ListingId) {
    super(`Listing with ID ${listingId.toHexString()} not found.`);
    this.name = "ListingNotFoundError";
  }
}

/**
 * Error thrown when a user attempts an action on a listing they do not own.
 */
export class UnauthorizedListingAccessError extends ListingError {
  constructor(userId: UserId, listingId: ListingId, action: string) {
    super(
      `User ${userId.toHexString()} is not authorized to ${action} listing ${listingId.toHexString()}.`,
    );
    this.name = "UnauthorizedListingAccessError";
  }
}

/**
 * Error thrown when an action is attempted on a listing that is in an invalid state.
 */
export class InvalidListingStatusError extends ListingError {
  constructor(
    listingId: ListingId,
    currentStatus: ListingStatus,
    action: string,
  ) {
    super(
      `Cannot ${action} listing ${listingId.toHexString()}. Current status is ${currentStatus}.`,
    );
    this.name = "InvalidListingStatusError";
  }
}

/**
 * Error thrown when input data for a listing operation fails validation.
 */
export class ListingValidationError extends ListingError {
  constructor(message: string) {
    super(`Validation failed: ${message}`);
    this.name = "ListingValidationError";
  }
}

// --- Notifications (Events) ---

export interface ListingCreatedEvent {
  listingId: ListingId;
  sellerId: UserId;
}

export interface ListingUpdatedEvent {
  listingId: ListingId;
  sellerId: UserId; // The user who performed the update (should be the seller)
  updatedFields: string[]; // List of field names that were updated
}

export interface ListingWithdrawnEvent {
  listingId: ListingId;
  sellerId: UserId;
}

export interface ListingSoldEvent {
  listingId: ListingId;
  sellerId: UserId;
  acceptedBidId: ObjectId; // The ID of the bid that was accepted
}

// Generic EventBus interface for emitting notifications
export interface EventBus {
  emit<T>(eventName: string, payload: T): void;
}

// --- ItemListingConcept Implementation ---

export class ItemListingConcept {
  private listingsCollection: Collection<ItemListing>;
  private eventBus: EventBus;

  /**
   * Initializes the ItemListingConcept with a MongoDB client and an EventBus.
   * @param mongoClient The connected MongoDB client.
   * @param eventBus The event bus for emitting notifications.
   * @param dbName The name of the database to use.
   */
  constructor(mongoClient: MongoClient, eventBus: EventBus, dbName: string) {
    const db: Db = mongoClient.db(dbName);
    this.listingsCollection = db.collection<ItemListing>("listings");
    this.eventBus = eventBus;
    // Ensure indexes for efficient querying
    this.listingsCollection.createIndex({ seller: 1 });
    this.listingsCollection.createIndex({ status: 1 });
    this.listingsCollection.createIndex({ tags: 1 });
    // This allows for quick lookup of specific listings, which is expected
    this.listingsCollection.createIndex({ _id: 1 });
  }

  // Helper method for common listing field validations
  private validateCommonListingFields(
    seller: UserId,
    title: string,
    description: string,
    photos: string[],
    tags: Tag[],
    minAsk?: CurrencyAmount,
  ): void {
    if (!seller || !(seller instanceof ObjectId)) {
      throw new ListingValidationError("Seller ID must be a valid ObjectId.");
    }
    if (!title || title.trim().length === 0) {
      throw new ListingValidationError("Title cannot be empty.");
    }
    if (title.length > 200) {
      throw new ListingValidationError("Title cannot exceed 200 characters.");
    }
    if (!description || description.trim().length === 0) {
      throw new ListingValidationError("Description cannot be empty.");
    }
    if (description.length > 2000) {
      throw new ListingValidationError(
        "Description cannot exceed 2000 characters.",
      );
    }
    if (!Array.isArray(photos)) {
      throw new ListingValidationError("Photos must be an array of URLs.");
    }
    if (
      photos.some((url) =>
        typeof url !== "string" || url.trim().length === 0 || !URL.canParse(url)
      )
    ) {
      // Basic URL validation
      throw new ListingValidationError("All photo URLs must be valid and non-empty strings.");
    }
    if (photos.length > 10) {
      throw new ListingValidationError("A maximum of 10 photos is allowed.");
    }
    if (!Array.isArray(tags)) {
      throw new ListingValidationError("Tags must be an array of strings.");
    }
    if (
      tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0)
    ) {
      throw new ListingValidationError("All tags must be valid non-empty strings.");
    }
    if (tags.length > 10) {
      throw new ListingValidationError("A maximum of 10 tags is allowed.");
    }
    if (minAsk !== undefined && (typeof minAsk !== "number" || minAsk < 0)) {
      throw new ListingValidationError(
        "Minimum asking price must be a non-negative number.",
      );
    }
  }

  /**
   * Creates a new item listing.
   * @param seller The UserId of the seller.
   * @param title The title of the listing.
   * @param description A detailed description of the item.
   * @param photos An array of URLs for item photos.
   * @param tags An array of tags for categorization.
   * @param minAsk An optional minimum asking price.
   * @returns The ListingId of the newly created listing.
   * @throws {ListingValidationError} if input data is invalid.
   * @throws {ListingError} for other database-related failures.
   */
  async create_listing(
    seller: UserId,
    title: string,
    description: string,
    photos: string[],
    tags: Tag[],
    minAsk?: CurrencyAmount,
  ): Promise<ListingId> {
    this.validateCommonListingFields(
      seller,
      title,
      description,
      photos,
      tags,
      minAsk,
    );

    const newListing: ItemListing = {
      _id: new ObjectId(),
      seller,
      title: title.trim(),
      description: description.trim(),
      photos,
      tags: tags.map((tag) => tag.trim()),
      minAsk,
      createdAt: new Date(),
      status: ListingStatus.Active,
      bidLog: [], // Initialize with an empty bid log
    };

    try {
      await this.listingsCollection.insertOne(newListing);
      this.eventBus.emit<ListingCreatedEvent>("ListingCreated", {
        listingId: newListing._id,
        sellerId: newListing.seller,
      });
      return newListing._id;
    } catch (error) {
      console.error("Error creating listing:", error);
      throw new ListingError("Failed to create listing due to an internal error.");
    }
  }

  /**
   * Retrieves a listing by its ID.
   * @param listingId The ID of the listing to retrieve.
   * @returns The ItemListing object or null if not found.
   * @throws {ListingValidationError} if the listingId format is invalid.
   */
  async get_listing(listingId: ListingId): Promise<ItemListing | null> {
    if (!listingId || !(listingId instanceof ObjectId)) {
      throw new ListingValidationError("Invalid listing ID format.");
    }
    return await this.listingsCollection.findOne({ _id: listingId });
  }

  /**
   * Updates an existing item listing.
   * Only the seller of the listing can update it, and only if it's in 'Active' status.
   * Fields like _id, seller, createdAt, status, currentHighestBid, bidLog cannot be updated directly.
   * @param listingId The ID of the listing to update.
   * @param updaterId The UserId of the user performing the update (must be the seller).
   * @param fieldsToUpdate An object containing the fields to update.
   * @throws {ListingValidationError} if input data is invalid.
   * @throws {ListingNotFoundError} if the listing does not exist.
   * @throws {UnauthorizedListingAccessError} if the updater is not the seller.
   * @throws {InvalidListingStatusError} if the listing is not active.
   * @throws {ListingError} for other database-related failures.
   */
  async update_listing(
    listingId: ListingId,
    updaterId: UserId, // The user performing the update (must be the seller)
    fieldsToUpdate: {
      title?: string;
      description?: string;
      photos?: string[];
      tags?: Tag[];
      minAsk?: CurrencyAmount;
    },
  ): Promise<void> {
    if (!listingId || !(listingId instanceof ObjectId)) {
      throw new ListingValidationError("Invalid listing ID format.");
    }
    if (!updaterId || !(updaterId instanceof ObjectId)) {
      throw new ListingValidationError("Updater ID must be a valid ObjectId.");
    }
    if (Object.keys(fieldsToUpdate).length === 0) {
      // If no fields are provided for update, simply return without error or event
      return;
    }

    const listing = await this.get_listing(listingId);
    if (!listing) {
      throw new ListingNotFoundError(listingId);
    }

    if (!listing.seller.equals(updaterId)) {
      throw new UnauthorizedListingAccessError(updaterId, listingId, "update");
    }

    if (listing.status !== ListingStatus.Active) {
      throw new InvalidListingStatusError(
        listingId,
        listing.status,
        "update",
      );
    }

    const updateDoc: { [key: string]: any } = {};
    const updatedFields: string[] = [];

    // Validate and prepare update fields
    if (fieldsToUpdate.title !== undefined) {
      const trimmedTitle = fieldsToUpdate.title.trim();
      if (trimmedTitle.length === 0) {
        throw new ListingValidationError("Title cannot be empty.");
      }
      if (trimmedTitle.length > 200) {
        throw new ListingValidationError("Title cannot exceed 200 characters.");
      }
      if (trimmedTitle !== listing.title) {
        updateDoc.title = trimmedTitle;
        updatedFields.push("title");
      }
    }
    if (fieldsToUpdate.description !== undefined) {
      const trimmedDescription = fieldsToUpdate.description.trim();
      if (trimmedDescription.length === 0) {
        throw new ListingValidationError("Description cannot be empty.");
      }
      if (trimmedDescription.length > 2000) {
        throw new ListingValidationError(
          "Description cannot exceed 2000 characters.",
        );
      }
      if (trimmedDescription !== listing.description) {
        updateDoc.description = trimmedDescription;
        updatedFields.push("description");
      }
    }
    if (fieldsToUpdate.photos !== undefined) {
      if (!Array.isArray(fieldsToUpdate.photos)) {
        throw new ListingValidationError("Photos must be an array of URLs.");
      }
      if (
        fieldsToUpdate.photos.some((url) =>
          typeof url !== "string" || url.trim().length === 0 || !URL.canParse(url)
        )
      ) {
        throw new ListingValidationError("All photo URLs must be valid and non-empty strings.");
      }
      if (fieldsToUpdate.photos.length > 10) {
        throw new ListingValidationError("A maximum of 10 photos is allowed.");
      }
      // Check if photos array actually changed content (order matters here)
      if (
        JSON.stringify(fieldsToUpdate.photos) !== JSON.stringify(listing.photos)
      ) {
        updateDoc.photos = fieldsToUpdate.photos;
        updatedFields.push("photos");
      }
    }
    if (fieldsToUpdate.tags !== undefined) {
      if (!Array.isArray(fieldsToUpdate.tags)) {
        throw new ListingValidationError("Tags must be an array of strings.");
      }
      const trimmedTags = fieldsToUpdate.tags.map((tag) => tag.trim());
      if (
        trimmedTags.some((tag) => typeof tag !== "string" || tag.length === 0)
      ) {
        throw new ListingValidationError("All tags must be valid non-empty strings.");
      }
      if (trimmedTags.length > 10) {
        throw new ListingValidationError("A maximum of 10 tags is allowed.");
      }
      // Check if tags array actually changed content (order matters here)
      if (JSON.stringify(trimmedTags) !== JSON.stringify(listing.tags)) {
        updateDoc.tags = trimmedTags;
        updatedFields.push("tags");
      }
    }
    if (fieldsToUpdate.minAsk !== undefined) {
      if (
        typeof fieldsToUpdate.minAsk !== "number" || fieldsToUpdate.minAsk < 0
      ) {
        throw new ListingValidationError(
          "Minimum asking price must be a non-negative number.",
        );
      }
      if (fieldsToUpdate.minAsk !== listing.minAsk) {
        updateDoc.minAsk = fieldsToUpdate.minAsk;
        updatedFields.push("minAsk");
      }
    }

    if (Object.keys(updateDoc).length === 0) {
      // No effective changes, no need to update DB or emit event
      return;
    }

    try {
      const result = await this.listingsCollection.updateOne(
        { _id: listingId, seller: updaterId }, // Also match seller for an extra layer of safety
        { $set: updateDoc },
      );

      if (result.matchedCount === 0) {
        // This case should theoretically be caught by initial get_listing and seller check,
        // but it's a good safeguard for concurrent updates or if initial read was stale.
        throw new ListingNotFoundError(listingId);
      }

      this.eventBus.emit<ListingUpdatedEvent>("ListingUpdated", {
        listingId: listingId,
        sellerId: listing.seller,
        updatedFields: updatedFields,
      });
    } catch (error) {
      if (error instanceof ListingError) throw error; // Re-throw custom errors
      console.error(`Error updating listing ${listingId.toHexString()}:`, error);
      throw new ListingError("Failed to update listing due to an internal error.");
    }
  }

  /**
   * Withdraws an active listing, changing its status to 'Withdrawn'.
   * Only the seller can withdraw their listing.
   * @param listingId The ID of the listing to withdraw.
   * @param sellerId The UserId of the seller attempting to withdraw.
   * @throws {ListingValidationError} if IDs are invalid.
   * @throws {ListingNotFoundError} if the listing does not exist.
   * @throws {UnauthorizedListingAccessError} if the user is not the seller.
   * @throws {InvalidListingStatusError} if the listing is not active.
   * @throws {ListingError} for other database-related failures.
   */
  async withdraw_listing(listingId: ListingId, sellerId: UserId): Promise<void> {
    if (!listingId || !(listingId instanceof ObjectId)) {
      throw new ListingValidationError("Invalid listing ID format.");
    }
    if (!sellerId || !(sellerId instanceof ObjectId)) {
      throw new ListingValidationError("Seller ID must be a valid ObjectId.");
    }

    const listing = await this.get_listing(listingId);
    if (!listing) {
      throw new ListingNotFoundError(listingId);
    }

    if (!listing.seller.equals(sellerId)) {
      throw new UnauthorizedListingAccessError(sellerId, listingId, "withdraw");
    }

    if (listing.status !== ListingStatus.Active) {
      throw new InvalidListingStatusError(
        listingId,
        listing.status,
        "withdraw",
      );
    }

    try {
      const result = await this.listingsCollection.updateOne(
        { _id: listingId, seller: sellerId, status: ListingStatus.Active },
        { $set: { status: ListingStatus.Withdrawn } },
      );

      if (result.matchedCount === 0) {
        // This could happen if status changed concurrently or initial read was stale
        const currentListing = await this.get_listing(listingId);
        if (currentListing && currentListing.status !== ListingStatus.Active) {
          throw new InvalidListingStatusError(
            listingId,
            currentListing.status,
            "withdraw",
          );
        }
        throw new ListingNotFoundError(listingId); // Fallback for safety
      }

      this.eventBus.emit<ListingWithdrawnEvent>("ListingWithdrawn", {
        listingId: listingId,
        sellerId: sellerId,
      });
    } catch (error) {
      if (error instanceof ListingError) throw error;
      console.error(`Error withdrawing listing ${listingId.toHexString()}:`, error);
      throw new ListingError("Failed to withdraw listing due to an internal error.");
    }
  }

  /**
   * Accepts a specific bid for a listing, marking the listing as sold.
   * Only the seller can accept a bid, and only if the listing is 'Active'.
   * This action also records the accepted bid ID in the listing's state.
   * @param listingId The ID of the listing for which to accept a bid.
   * @param sellerId The UserId of the seller attempting to accept the bid.
   * @param bidId The ObjectId of the bid being accepted.
   * @throws {ListingValidationError} if IDs are invalid.
   * @throws {ListingNotFoundError} if the listing does not exist.
   * @throws {UnauthorizedListingAccessError} if the user is not the seller.
   * @throws {InvalidListingStatusError} if the listing is not active.
   * @throws {ListingError} for other database-related failures.
   */
  async accept_bid(
    listingId: ListingId,
    sellerId: UserId,
    bidId: ObjectId, // The ID of the bid being accepted
  ): Promise<void> {
    if (!listingId || !(listingId instanceof ObjectId)) {
      throw new ListingValidationError("Invalid listing ID format.");
    }
    if (!sellerId || !(sellerId instanceof ObjectId)) {
      throw new ListingValidationError("Seller ID must be a valid ObjectId.");
    }
    if (!bidId || !(bidId instanceof ObjectId)) {
      throw new ListingValidationError("Bid ID must be a valid ObjectId.");
    }

    const listing = await this.get_listing(listingId);
    if (!listing) {
      throw new ListingNotFoundError(listingId);
    }

    if (!listing.seller.equals(sellerId)) {
      throw new UnauthorizedListingAccessError(sellerId, listingId, "accept bid");
    }

    if (listing.status !== ListingStatus.Active) {
      throw new InvalidListingStatusError(
        listingId,
        listing.status,
        "accept bid",
      );
    }

    try {
      const result = await this.listingsCollection.updateOne(
        { _id: listingId, seller: sellerId, status: ListingStatus.Active },
        {
          $set: { status: ListingStatus.Sold, currentHighestBid: bidId },
          $push: { bidLog: bidId }, // Add to bid log
        },
      );

      if (result.matchedCount === 0) {
        const currentListing = await this.get_listing(listingId);
        if (currentListing && currentListing.status !== ListingStatus.Active) {
          throw new InvalidListingStatusError(
            listingId,
            currentListing.status,
            "accept bid",
          );
        }
        throw new ListingNotFoundError(listingId); // Fallback for safety
      }

      this.eventBus.emit<ListingSoldEvent>("ListingSold", {
        listingId: listingId,
        sellerId: sellerId,
        acceptedBidId: bidId,
      });
    } catch (error) {
      if (error instanceof ListingError) throw error;
      console.error(`Error accepting bid for listing ${listingId.toHexString()}:`, error);
      throw new ListingError("Failed to accept bid for listing due to an internal error.");
    }
  }
}

```

***

### 2. `mock-services.ts` (Mock Services)

```typescript
// mock-services.ts

import { EventBus } from "./ItemListingConcept.ts";

/**
 * Mock implementation of an EventBus for testing purposes.
 * It stores all emitted events in an array for later inspection.
 */
export class MockEventBus implements EventBus {
  public emittedEvents: Array<{ eventName: string; payload: any }> = [];

  emit<T>(eventName: string, payload: T): void {
    this.emittedEvents.push({ eventName, payload });
  }

  /**
   * Clears all recorded events.
   */
  clearEvents(): void {
    this.emittedEvents = [];
  }

  /**
   * Retrieves all events emitted with a specific name.
   * @param eventName The name of the event to filter by.
   * @returns An array of events matching the given name.
   */
  getEventsByName<T>(eventName: string): Array<{ eventName: string; payload: T }> {
    return this.emittedEvents.filter((event) => event.eventName === eventName) as Array<{ eventName: string; payload: T }>;
  }
}

// Below are example mock services. While ItemListingConcept performs its own validation internally,
// these demonstrate how other external services could be mocked if needed.

/**
 * Mock Configuration Service.
 * Can be used to inject test-specific configuration values (e.g., database names, API keys).
 */
export class MockConfigService {
  private config: Map<string, any>;

  constructor(initialConfig: { [key: string]: any } = {}) {
    this.config = new Map(Object.entries(initialConfig));
  }

  get<T>(key: string, defaultValue?: T): T {
    if (this.config.has(key)) {
      return this.config.get(key);
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Configuration key "${key}" not found and no default value provided.`);
  }

  set(key: string, value: any): void {
    this.config.set(key, value);
  }
}

/**
 * Mock External Validation Service.
 * Could simulate external APIs for advanced content moderation, image validation, etc.
 * Currently not directly integrated into ItemListingConcept but shown for context.
 */
export class MockValidationService {
  /**
   * Simulates validation of a URL.
   * @param url The URL string to validate.
   * @returns True if the URL is considered valid by the mock, false otherwise.
   */
  isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith("http"); // Simple check for http(s) protocol
    } catch {
      return false;
    }
  }

  /**
   * Simulates validation of a tag.
   * @param tag The tag string to validate.
   * @returns True if the tag is considered valid, false otherwise.
   */
  isValidTag(tag: string): boolean {
    return tag.trim().length > 0 && tag.trim().length <= 50; // Example validation
  }
}

```

***

### 3. `fake-data.ts` (Fake Test Data)

```typescript
// fake-data.ts

import { ObjectId } from "npm:mongodb";
import { ItemListing, ListingStatus, Tag, UserId } from "./ItemListingConcept.ts";

/**
 * Generates a new unique ObjectId.
 */
export function generateObjectId(): ObjectId {
  return new ObjectId();
}

/**
 * Generates a random alphanumeric string of a given length.
 */
export function generateRandomString(length: number): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Generates a random URL.
 */
export function generateRandomUrl(): string {
  return `https://images.example.com/${generateRandomString(10)}.jpg`;
}

/**
 * Generates an array of random URLs.
 * @param count The number of URLs to generate.
 * @returns An array of random URL strings.
 */
export function generateRandomUrls(count: number): string[] {
  return Array.from({ length: count }, () => generateRandomUrl());
}

/**
 * Generates an array of random tags from a predefined list.
 * @param count The number of tags to generate.
 * @returns An array of random tag strings.
 */
export function generateRandomTags(count: number): Tag[] {
  const commonTags = [
    "electronics",
    "books",
    "clothing",
    "furniture",
    "accessories",
    "decor",
    "sports",
    "tools",
    "vintage",
    "collectibles",
    "games",
    "home",
    "kitchen",
    "auto",
    "garden",
    "toys",
  ];
  const tags: Tag[] = [];
  // Ensure unique tags if count is less than commonTags.length
  const shuffledTags = commonTags.sort(() => 0.5 - Math.random());
  for (let i = 0; i < Math.min(count, shuffledTags.length); i++) {
    tags.push(shuffledTags[i]);
  }
  return tags;
}

/**
 * Generates a fake ItemListing object with sensible defaults, allowing overrides.
 * @param overrides Partial ItemListing object to override default values.
 * @returns A complete fake ItemListing object.
 */
export function generateFakeListing(
  overrides?: Partial<ItemListing>,
): ItemListing {
  const sellerId = overrides?.seller || generateObjectId();
  const listingId = overrides?._id || generateObjectId();
  const createdAt = overrides?.createdAt || new Date();
  const status = overrides?.status || ListingStatus.Active;

  return {
    _id: listingId,
    seller: sellerId,
    title: overrides?.title || `Fake Item: ${generateRandomString(15)}`,
    description: overrides?.description ||
      `This is a detailed description of the fake item listing. It's in great condition and ready for its new owner. Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${
        generateRandomString(50)
      }`,
    photos: overrides?.photos || generateRandomUrls(2),
    tags: overrides?.tags || generateRandomTags(3),
    minAsk: overrides?.minAsk,
    createdAt: createdAt,
    status: status,
    currentHighestBid: overrides?.currentHighestBid,
    bidLog: overrides?.bidLog || [],
  };
}

/**
 * Generates an array of fake ItemListing objects.
 * @param count The number of listings to generate.
 * @param sellerId An optional UserId to assign to all generated listings.
 * @returns An array of fake ItemListing objects.
 */
export function generateFakeListings(
  count: number,
  sellerId?: UserId,
): ItemListing[] {
  return Array.from({ length: count }, () =>
    generateFakeListing(sellerId ? { seller: sellerId } : undefined)
  );
}

// Pre-defined fake user IDs for consistent testing scenarios
export const fakeUserIds = {
  seller1: generateObjectId(),
  seller2: generateObjectId(),
  buyer1: generateObjectId(), // A user who might try to interact but isn't a seller
  admin: generateObjectId(), // An admin user (for potential future authorization tests)
  nonExistent: generateObjectId(), // For testing non-existent users
};

// Example listing data for various scenarios
export const fakeListingData = {
  activeListing: generateFakeListing({
    seller: fakeUserIds.seller1,
    title: "Vintage Bicycle",
    description:
      "Well-maintained vintage bicycle, perfect for city commutes. Some minor wear and tear.",
    photos: [
      "https://example.com/images/bike_front.jpg",
      "https://example.com/images/bike_side.jpg",
    ],
    tags: ["bicycle", "vintage", "transport"],
    minAsk: 150.00,
    status: ListingStatus.Active,
  }),
  anotherActiveListing: generateFakeListing({
    seller: fakeUserIds.seller2,
    title: "Textbook: Software Design Patterns",
    description:
      "Required textbook for COMP3000, 5th edition, excellent condition, no highlights.",
    photos: ["https://example.com/images/book_cover.jpg"],
    tags: ["textbook", "education", "comp3000"],
    minAsk: 75.50,
    status: ListingStatus.Active,
  }),
  withdrawnListing: generateFakeListing({
    seller: fakeUserIds.seller1,
    title: "Old Computer Monitor",
    description: "CRT monitor from 2005, still works but very heavy.",
    tags: ["electronics", "vintage"],
    status: ListingStatus.Withdrawn,
  }),
  soldListing: generateFakeListing({
    seller: fakeUserIds.seller2,
    title: "Handmade Ceramic Mug",
    description: "Unique ceramic mug, artisan crafted, perfect for coffee lovers.",
    tags: ["handmade", "homegoods", "kitchen"],
    minAsk: 20.00,
    status: ListingStatus.Sold,
    currentHighestBid: generateObjectId(),
    bidLog: [generateObjectId(), generateObjectId()], // Example bid history
  }),
  listingWithNoMinAsk: generateFakeListing({
    seller: fakeUserIds.seller1,
    title: "Free Couch (pickup only)",
    description: "Comfortable three-seater couch, needs to go by weekend. Minor stains.",
    tags: ["furniture", "free"],
    minAsk: undefined,
  }),
  listingWithManyTagsPhotos: generateFakeListing({
    seller: fakeUserIds.seller1,
    title: "Collectible Action Figure Set",
    description: "Rare collection of limited edition action figures, new in box.",
    photos: generateRandomUrls(8), // Many photos
    tags: generateRandomTags(9), // Many tags
  }),
};
```

***

### 4. `ItemListingConcept.test.ts` (Comprehensive Test Suite)

```typescript
// ItemListingConcept.test.ts

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { expect } from "https://deno.land/x/expect@v0.2.10/mod.ts";
import { Collection, MongoClient, ObjectId } from "npm:mongodb";

import {
  InvalidListingStatusError,
  ItemListing,
  ItemListingConcept,
  ListingCreatedEvent,
  ListingNotFoundError,
  ListingSoldEvent,
  ListingStatus,
  ListingUpdatedEvent,
  ListingValidationError,
  ListingWithdrawnEvent,
  UnauthorizedListingAccessError,
  UserId,
} from "./ItemListingConcept.ts";
import { MockEventBus } from "./mock-services.ts";
import {
  fakeListingData,
  fakeUserIds,
  generateFakeListing,
  generateObjectId,
  generateRandomString,
  generateRandomUrls,
} from "./fake-data.ts";

// --- Test Setup ---
const MONGODB_URI = Deno.env.get("MONGODB_URI") || "mongodb://localhost:27017";
const DB_NAME = `swapit-test-listings-${Date.now()}`; // Unique DB name for each test run

let client: MongoClient;
let listingsCollection: Collection<ItemListing>;
let itemListingConcept: ItemListingConcept;
let mockEventBus: MockEventBus;

describe("ItemListing Concept - Likert Survey Principles", () => {
  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log(`Connected to MongoDB for testing DB: ${DB_NAME}`);
  });

  beforeEach(async () => {
    // Clear the database before each test to ensure isolation
    const db = client.db(DB_NAME);
    // Drop all collections (or just 'listings' if there are other concept collections)
    const collections = await db.collections();
    for (const collection of collections) {
      await collection.drop();
    }
    listingsCollection = db.collection<ItemListing>("listings");
    mockEventBus = new MockEventBus();
    itemListingConcept = new ItemListingConcept(client, mockEventBus, DB_NAME);
  });

  afterEach(async () => {
    // Optionally clear collection after each test if not dropping DB in beforeEach
    await listingsCollection.deleteMany({});
    mockEventBus.clearEvents();
  });

  afterAll(async () => {
    // Drop the entire test database after all tests are done
    await client.db(DB_NAME).dropDatabase();
    await client.close();
    console.log("Disconnected from MongoDB.");
  });

  // --- Principle 1: Listing Creation and Management ---
  describe("Principle 1: Listing Creation and Management", () => {
    it("1.1. Should successfully create a new listing with all valid data", async () => {
      const { seller1 } = fakeUserIds;
      const listingData = {
        seller: seller1,
        title: "Deno T-Shirt",
        description: "Official Deno conference t-shirt, size M, never worn.",
        photos: ["https://example.com/deno_shirt.jpg"],
        tags: ["clothing", "deno", "software"],
        minAsk: 25.00,
      };

      const listingId = await itemListingConcept.create_listing(
        listingData.seller,
        listingData.title,
        listingData.description,
        listingData.photos,
        listingData.tags,
        listingData.minAsk,
      );

      expect(listingId).toBeInstanceOf(ObjectId);

      const createdListing = await listingsCollection.findOne({ _id: listingId });
      expect(createdListing).not.toBeNull();
      expect(createdListing?.seller.toHexString()).toEqual(
        listingData.seller.toHexString(),
      );
      expect(createdListing?.title).toEqual(listingData.title);
      expect(createdListing?.description).toEqual(listingData.description);
      expect(createdListing?.photos).toEqual(listingData.photos);
      expect(createdListing?.tags).toEqual(listingData.tags);
      expect(createdListing?.minAsk).toEqual(listingData.minAsk);
      expect(createdListing?.status).toEqual(ListingStatus.Active);
      expect(createdListing?.createdAt).toBeInstanceOf(Date);
      expect(createdListing?.bidLog).toEqual([]);
      expect(createdListing?.currentHighestBid).toBeUndefined();

      // Verify event emission
      const createdEvents = mockEventBus.getEventsByName<ListingCreatedEvent>(
        "ListingCreated",
      );
      expect(createdEvents.length).toEqual(1);
      expect(createdEvents[0].payload.listingId.toHexString()).toEqual(
        listingId.toHexString(),
      );
      expect(createdEvents[0].payload.sellerId.toHexString()).toEqual(
        seller1.toHexString(),
      );
    });

    it("1.2. Should create a listing without minAsk if not provided", async () => {
      const { seller1 } = fakeUserIds;
      const listingData = {
        seller: seller1,
        title: "Free Books",
        description: "Old textbooks, free for pickup.",
        photos: [],
        tags: ["books", "free"],
      };

      const listingId = await itemListingConcept.create_listing(
        listingData.seller,
        listingData.title,
        listingData.description,
        listingData.photos,
        listingData.tags,
      ); // minAsk is omitted

      const createdListing = await listingsCollection.findOne({ _id: listingId });
      expect(createdListing).not.toBeNull();
      expect(createdListing?.minAsk).toBeUndefined();
    });

    it("1.3. Should successfully update multiple fields of an existing listing", async () => {
      const { seller1 } = fakeUserIds;
      const initialListing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(initialListing);

      const updatedTitle = "Updated Vintage Bicycle Listing";
      const updatedDescription = "Even more detailed description of the bike.";
      const updatedMinAsk = 180.00;
      const updatedPhotos = ["https://example.com/new_bike_photo.jpg"];
      const updatedTags = ["bicycle", "vintage", "commute", "sport"];

      await itemListingConcept.update_listing(
        initialListing._id,
        seller1,
        {
          title: updatedTitle,
          description: updatedDescription,
          minAsk: updatedMinAsk,
          photos: updatedPhotos,
          tags: updatedTags,
        },
      );

      const retrievedListing = await listingsCollection.findOne({
        _id: initialListing._id,
      });
      expect(retrievedListing?.title).toEqual(updatedTitle);
      expect(retrievedListing?.description).toEqual(updatedDescription);
      expect(retrievedListing?.minAsk).toEqual(updatedMinAsk);
      expect(retrievedListing?.photos).toEqual(updatedPhotos);
      expect(retrievedListing?.tags).toEqual(updatedTags);
      expect(retrievedListing?.status).toEqual(ListingStatus.Active); // Status should not change

      const updatedEvents = mockEventBus.getEventsByName<ListingUpdatedEvent>(
        "ListingUpdated",
      );
      expect(updatedEvents.length).toEqual(1);
      expect(updatedEvents[0].payload.updatedFields).toEqual([
        "title",
        "description",
        "photos",
        "tags",
        "minAsk",
      ]);
    });

    it("1.4. Should retrieve a listing by ID", async () => {
      const listing = generateFakeListing({ seller: fakeUserIds.seller1 });
      await listingsCollection.insertOne(listing);

      const retrievedListing = await itemListingConcept.get_listing(
        listing._id,
      );
      expect(retrievedListing).not.toBeNull();
      expect(retrievedListing?._id.toHexString()).toEqual(
        listing._id.toHexString(),
      );
      expect(retrievedListing?.title).toEqual(listing.title);
    });

    it("1.5. Should return null if retrieving a non-existent listing", async () => {
      const nonExistentId = generateObjectId();
      const retrievedListing = await itemListingConcept.get_listing(
        nonExistentId,
      );
      expect(retrievedListing).toBeNull();
    });

    it("1.6. Should not update listing if no fields are provided for update", async () => {
      const { seller1 } = fakeUserIds;
      const initialListing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(initialListing);
      mockEventBus.clearEvents(); // Clear any previous events

      await itemListingConcept.update_listing(initialListing._id, seller1, {});

      const retrievedListing = await listingsCollection.findOne({ _id: initialListing._id });
      expect(retrievedListing).toEqual(initialListing); // Listing should remain unchanged
      expect(mockEventBus.emittedEvents.length).toEqual(0); // No event should be emitted
    });

    it("1.7. Should not update listing if provided fields are identical to current values", async () => {
      const { seller1 } = fakeUserIds;
      const initialListing = generateFakeListing({
        seller: seller1,
        title: "Original Title",
        description: "Original Description",
      });
      await listingsCollection.insertOne(initialListing);
      mockEventBus.clearEvents();

      await itemListingConcept.update_listing(
        initialListing._id,
        seller1,
        {
          title: "Original Title",
          description: "Original Description",
        },
      );

      const retrievedListing = await listingsCollection.findOne({ _id: initialListing._id });
      expect(retrievedListing).toEqual(initialListing); // Listing should remain unchanged
      expect(mockEventBus.emittedEvents.length).toEqual(0); // No event should be emitted
    });
  });

  // --- Principle 2: Listing Lifecycle ---
  describe("Principle 2: Listing Lifecycle", () => {
    it("2.1. Should correctly transition a listing from Active to Withdrawn", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);
      expect(listing.status).toEqual(ListingStatus.Active);

      await itemListingConcept.withdraw_listing(listing._id, seller1);

      const updatedListing = await listingsCollection.findOne({
        _id: listing._id,
      });
      expect(updatedListing?.status).toEqual(ListingStatus.Withdrawn);

      const withdrawnEvents = mockEventBus.getEventsByName<
        ListingWithdrawnEvent
      >("ListingWithdrawn");
      expect(withdrawnEvents.length).toEqual(1);
      expect(withdrawnEvents[0].payload.listingId.toHexString()).toEqual(
        listing._id.toHexString(),
      );
      expect(withdrawnEvents[0].payload.sellerId.toHexString()).toEqual(
        seller1.toHexString(),
      );
    });

    it("2.2. Should correctly transition a listing from Active to Sold after accepting a bid", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);
      expect(listing.status).toEqual(ListingStatus.Active);

      const bidId = generateObjectId();
      await itemListingConcept.accept_bid(listing._id, seller1, bidId);

      const updatedListing = await listingsCollection.findOne({
        _id: listing._id,
      });
      expect(updatedListing?.status).toEqual(ListingStatus.Sold);
      expect(updatedListing?.currentHighestBid?.toHexString()).toEqual(
        bidId.toHexString(),
      );
      expect(updatedListing?.bidLog).toEqual([bidId]);

      const soldEvents = mockEventBus.getEventsByName<ListingSoldEvent>(
        "ListingSold",
      );
      expect(soldEvents.length).toEqual(1);
      expect(soldEvents[0].payload.listingId.toHexString()).toEqual(
        listing._id.toHexString(),
      );
      expect(soldEvents[0].payload.sellerId.toHexString()).toEqual(
        seller1.toHexString(),
      );
      expect(soldEvents[0].payload.acceptedBidId.toHexString()).toEqual(
        bidId.toHexString(),
      );
    });

    it("2.3. Should prevent updating a withdrawn listing", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({
        seller: seller1,
        status: ListingStatus.Withdrawn,
      });
      await listingsCollection.insertOne(listing);

      const updatePromise = itemListingConcept.update_listing(
        listing._id,
        seller1,
        { title: "New Title" },
      );
      await expect(updatePromise).rejects.toBeInstanceOf(
        InvalidListingStatusError,
      );
      expect(mockEventBus.emittedEvents.length).toEqual(0); // No event should be emitted
    });

    it("2.4. Should prevent withdrawing a sold listing", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({
        seller: seller1,
        status: ListingStatus.Sold,
      });
      await listingsCollection.insertOne(listing);

      const withdrawPromise = itemListingConcept.withdraw_listing(
        listing._id,
        seller1,
      );
      await expect(withdrawPromise).rejects.toBeInstanceOf(
        InvalidListingStatusError,
      );
      expect(mockEventBus.emittedEvents.length).toEqual(0);
    });

    it("2.5. Should prevent accepting a bid on a sold listing", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({
        seller: seller1,
        status: ListingStatus.Sold,
      });
      await listingsCollection.insertOne(listing);

      const bidId = generateObjectId();
      const acceptBidPromise = itemListingConcept.accept_bid(
        listing._id,
        seller1,
        bidId,
      );
      await expect(acceptBidPromise).rejects.toBeInstanceOf(
        InvalidListingStatusError,
      );
      expect(mockEventBus.emittedEvents.length).toEqual(0);
    });
  });

  // --- Principle 3: Bid Integration ---
  describe("Principle 3: Bid Integration", () => {
    it("3.1. Should record the accepted bid in bidLog and currentHighestBid when accepted", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      const bid1 = generateObjectId();
      await itemListingConcept.accept_bid(listing._id, seller1, bid1);

      let updatedListing = await listingsCollection.findOne({
        _id: listing._id,
      });
      expect(updatedListing?.status).toEqual(ListingStatus.Sold);
      expect(updatedListing?.currentHighestBid?.toHexString()).toEqual(
        bid1.toHexString(),
      );
      expect(updatedListing?.bidLog).toEqual([bid1]);
      expect(mockEventBus.getEventsByName("ListingSold")[0].payload.acceptedBidId).toEqual(bid1);
    });

    it("3.2. Should ensure accept_bid updates listing status to Sold", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      const bidId = generateObjectId();
      await itemListingConcept.accept_bid(listing._id, seller1, bidId);

      const updatedListing = await listingsCollection.findOne({
        _id: listing._id,
      });
      expect(updatedListing?.status).toEqual(ListingStatus.Sold);
      expect(mockEventBus.getEventsByName("ListingSold").length).toEqual(1);
    });

    it("3.3. Should reject accepting a bid with an invalid bidId format", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      const invalidBidId = "not-an-objectid" as unknown as ObjectId;
      const acceptBidPromise = itemListingConcept.accept_bid(
        listing._id,
        seller1,
        invalidBidId,
      );
      await expect(acceptBidPromise).rejects.toBeInstanceOf(
        ListingValidationError,
      );
      expect(mockEventBus.emittedEvents.length).toEqual(0);
    });
  });

  // --- Principle 4: Data Validation ---
  describe("Principle 4: Data Validation", () => {
    it("4.1. Should reject creating a listing with empty title", async () => {
      const { seller1 } = fakeUserIds;
      const createPromise = itemListingConcept.create_listing(
        seller1,
        "", // Empty title
        "description",
        [],
        [],
      );
      await expect(createPromise).rejects.toBeInstanceOf(
        ListingValidationError,
      );
    });

    it("4.2. Should reject creating a listing with title exceeding max length (200 chars)", async () => {
      const { seller1 } = fakeUserIds;
      const longTitle = generateRandomString(201);
      const createPromise = itemListingConcept.create_listing(
        seller1,
        longTitle,
        "description",
        [],
        [],
      );
      await expect(createPromise).rejects.toBeInstanceOf(
        ListingValidationError,
      );
    });

    it("4.3. Should reject creating a listing with invalid photos array element (not a URL)", async () => {
      const { seller1 } = fakeUserIds;
      const createPromise = itemListingConcept.create_listing(
        seller1,
        "title",
        "description",
        ["invalid-url-string", "https://valid.com/image.jpg"],
        [],
      );
      await expect(createPromise).rejects.toBeInstanceOf(
        ListingValidationError,
      );
    });

    it("4.4. Should reject creating a listing with too many photos (max 10)", async () => {
      const { seller1 } = fakeUserIds;
      const photos = generateRandomUrls(11); // More than 10
      const createPromise = itemListingConcept.create_listing(
        seller1,
        "title",
        "description",
        photos,
        [],
      );
      await expect(createPromise).rejects.toBeInstanceOf(
        ListingValidationError,
      );
    });

    it("4.5. Should reject creating a listing with negative minAsk", async () => {
      const { seller1 } = fakeUserIds;
      const createPromise = itemListingConcept.create_listing(
        seller1,
        "title",
        "description",
        [],
        [],
        -10.00, // Negative minAsk
      );
      await expect(createPromise).rejects.toBeInstanceOf(
        ListingValidationError,
      );
    });

    it("4.6. Should reject updating a listing with invalid field values (e.g., empty title)", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      const updatePromise = itemListingConcept.update_listing(
        listing._id,
        seller1,
        { title: "" }, // Empty title
      );
      await expect(updatePromise).rejects.toBeInstanceOf(
        ListingValidationError,
      );
    });

    it("4.7. Should reject updating a listing with too many tags (max 10)", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      const tags = generateRandomTags(11); // More than 10 tags
      const updatePromise = itemListingConcept.update_listing(
        listing._id,
        seller1,
        { tags: tags },
      );
      await expect(updatePromise).rejects.toBeInstanceOf(
        ListingValidationError,
      );
    });

    it("4.8. Should reject operations with invalid ObjectId formats for listingId or userId", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);
      const invalidId = "not-a-valid-objectid" as unknown as ObjectId;

      await expect(itemListingConcept.get_listing(invalidId)).rejects
        .toBeInstanceOf(ListingValidationError);
      await expect(
        itemListingConcept.update_listing(invalidId, seller1, { title: "x" }),
      ).rejects.toBeInstanceOf(ListingValidationError);
      await expect(
        itemListingConcept.withdraw_listing(listing._id, invalidId),
      ).rejects.toBeInstanceOf(ListingValidationError);
      await expect(
        itemListingConcept.accept_bid(listing._id, invalidId, generateObjectId()),
      ).rejects.toBeInstanceOf(ListingValidationError);
    });
  });

  // --- Principle 5: Error Handling ---
  describe("Principle 5: Error Handling", () => {
    it("5.1. Should throw ListingNotFoundError when updating a non-existent listing", async () => {
      const { seller1 } = fakeUserIds;
      const nonExistentId = generateObjectId();
      const updatePromise = itemListingConcept.update_listing(
        nonExistentId,
        seller1,
        { title: "New Title" },
      );
      await expect(updatePromise).rejects.toBeInstanceOf(ListingNotFoundError);
    });

    it("5.2. Should throw UnauthorizedListingAccessError when a non-seller tries to update a listing", async () => {
      const { seller1, seller2 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      const updatePromise = itemListingConcept.update_listing(
        listing._id,
        seller2, // seller2 is not the actual seller
        { title: "Malicious Title" },
      );
      await expect(updatePromise).rejects.toBeInstanceOf(
        UnauthorizedListingAccessError,
      );
    });

    it("5.3. Should throw UnauthorizedListingAccessError when a non-seller tries to withdraw a listing", async () => {
      const { seller1, seller2 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      const withdrawPromise = itemListingConcept.withdraw_listing(
        listing._id,
        seller2,
      );
      await expect(withdrawPromise).rejects.toBeInstanceOf(
        UnauthorizedListingAccessError,
      );
    });

    it("5.4. Should throw UnauthorizedListingAccessError when a non-seller tries to accept a bid", async () => {
      const { seller1, seller2 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      const bidId = generateObjectId();
      const acceptBidPromise = itemListingConcept.accept_bid(
        listing._id,
        seller2, // seller2 is not the actual seller
        bidId,
      );
      await expect(acceptBidPromise).rejects.toBeInstanceOf(
        UnauthorizedListingAccessError,
      );
    });

    it("5.5. Should throw ListingNotFoundError when withdrawing a non-existent listing", async () => {
      const { seller1 } = fakeUserIds;
      const nonExistentId = generateObjectId();
      const withdrawPromise = itemListingConcept.withdraw_listing(
        nonExistentId,
        seller1,
      );
      await expect(withdrawPromise).rejects.toBeInstanceOf(ListingNotFoundError);
    });

    it("5.6. Should throw ListingNotFoundError when accepting a bid for a non-existent listing", async () => {
      const { seller1 } = fakeUserIds;
      const nonExistentId = generateObjectId();
      const bidId = generateObjectId();
      const acceptBidPromise = itemListingConcept.accept_bid(
        nonExistentId,
        seller1,
        bidId,
      );
      await expect(acceptBidPromise).rejects.toBeInstanceOf(ListingNotFoundError);
    });
  });

  // --- Principle 6: Synchronization (Event Emission) ---
  describe("Principle 6: Synchronization (Event Emission)", () => {
    it("6.1. ListingCreated event is emitted correctly on new listing creation", async () => {
      const { seller1 } = fakeUserIds;
      const listingData = { ...fakeListingData.activeListing, seller: seller1 };

      const listingId = await itemListingConcept.create_listing(
        listingData.seller,
        listingData.title,
        listingData.description,
        listingData.photos,
        listingData.tags,
        listingData.minAsk,
      );

      const createdEvents = mockEventBus.getEventsByName<ListingCreatedEvent>(
        "ListingCreated",
      );
      expect(createdEvents.length).toEqual(1);
      expect(createdEvents[0].payload.listingId.toHexString()).toEqual(
        listingId.toHexString(),
      );
      expect(createdEvents[0].payload.sellerId.toHexString()).toEqual(
        seller1.toHexString(),
      );
    });

    it("6.2. ListingUpdated event is emitted correctly on listing update with changed fields", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      await itemListingConcept.update_listing(
        listing._id,
        seller1,
        { title: "New Title", tags: ["updated"], minAsk: 100 },
      );

      const updatedEvents = mockEventBus.getEventsByName<ListingUpdatedEvent>(
        "ListingUpdated",
      );
      expect(updatedEvents.length).toEqual(1);
      expect(updatedEvents[0].payload.listingId.toHexString()).toEqual(
        listing._id.toHexString(),
      );
      expect(updatedEvents[0].payload.sellerId.toHexString()).toEqual(
        seller1.toHexString(),
      );
      expect(updatedEvents[0].payload.updatedFields).toEqual([
        "title",
        "tags",
        "minAsk",
      ]);
    });

    it("6.3. ListingWithdrawn event is emitted correctly on listing withdrawal", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      await itemListingConcept.withdraw_listing(listing._id, seller1);

      const withdrawnEvents = mockEventBus.getEventsByName<
        ListingWithdrawnEvent
      >("ListingWithdrawn");
      expect(withdrawnEvents.length).toEqual(1);
      expect(withdrawnEvents[0].payload.listingId.toHexString()).toEqual(
        listing._id.toHexString(),
      );
      expect(withdrawnEvents[0].payload.sellerId.toHexString()).toEqual(
        seller1.toHexString(),
      );
    });

    it("6.4. ListingSold event is emitted correctly on accepting a bid", async () => {
      const { seller1 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);

      const bidId = generateObjectId();
      await itemListingConcept.accept_bid(listing._id, seller1, bidId);

      const soldEvents = mockEventBus.getEventsByName<ListingSoldEvent>(
        "ListingSold",
      );
      expect(soldEvents.length).toEqual(1);
      expect(soldEvents[0].payload.listingId.toHexString()).toEqual(
        listing._id.toHexString(),
      );
      expect(soldEvents[0].payload.sellerId.toHexString()).toEqual(
        seller1.toHexString(),
      );
      expect(soldEvents[0].payload.acceptedBidId.toHexString()).toEqual(
        bidId.toHexString(),
      );
    });

    it("6.5. No events are emitted for failed or non-altering operations", async () => {
      const { seller1, seller2 } = fakeUserIds;
      const listing = generateFakeListing({ seller: seller1 });
      await listingsCollection.insertOne(listing);
      mockEventBus.clearEvents(); // Ensure a clean slate for event checking

      // Attempt unauthorized update
      const updatePromiseUnauthorized = itemListingConcept.update_listing(
        listing._id,
        seller2,
        { title: "Attempted update" },
      );
      await expect(updatePromiseUnauthorized).rejects.toBeInstanceOf(
        UnauthorizedListingAccessError,
      );

      // Attempt to withdraw a non-existent listing
      const withdrawPromiseNonExistent = itemListingConcept.withdraw_listing(
        generateObjectId(),
        seller1,
      );
      await expect(withdrawPromiseNonExistent).rejects.toBeInstanceOf(
        ListingNotFoundError,
      );

      // Attempt to accept bid on a sold listing (invalid status)
      const soldListing = generateFakeListing({
        seller: seller1,
        status: ListingStatus.Sold,
      });
      await listingsCollection.insertOne(soldListing);
      const acceptBidPromiseInvalidStatus = itemListingConcept.accept_bid(
        soldListing._id,
        seller1,
        generateObjectId(),
      );
      await expect(acceptBidPromiseInvalidStatus).rejects.toBeInstanceOf(
        InvalidListingStatusError,
      );

      // Attempt update with no changes
      await itemListingConcept.update_listing(
        listing._id,
        seller1,
        { title: listing.title },
      );

      expect(mockEventBus.emittedEvents.length).toEqual(0); // No events should have been emitted
    });
  });
});

```

***

### How to run the tests:

1. **Save the files**:
   * `ItemListingConcept.ts`
   * `mock-services.ts`
   * `fake-data.ts`
   * `ItemListingConcept.test.ts`
     in the same directory.

2. **Install Deno**: If you don't have Deno installed, follow the instructions on [deno.land](https://deno.land/).

3. **Set up MongoDB**:
   * Ensure you have a MongoDB instance running, either locally (`mongodb://localhost:27017`) or via MongoDB Atlas.
   * Set the `MONGODB_URI` environment variable if your MongoDB is not on the default local address.
     ```bash
     export MONGODB_URI="your_mongodb_connection_string"
     ```
     (e.g., `mongodb+srv://user:pass@cluster.mongodb.net/` for Atlas).

4. **Run the tests**:
   Open your terminal in the directory where you saved the files and run:
   ```bash
   deno test ItemListingConcept.test.ts --allow-net --allow-env --allow-read --allow-hrtime --unstable-kv
   ```
   * `--allow-net`: Required for connecting to MongoDB.
   * `--allow-env`: Required for reading `MONGODB_URI` environment variable.
   * `--allow-read`: Might be needed for some internal Deno operations or if your test runner configuration reads files.
   * `--allow-hrtime`: Used by some test frameworks for timing, generally safe.
   * `--unstable-kv`: May be needed for future Deno features or certain dependencies, though not strictly required for `npm:mongodb` alone.

The tests will connect to your MongoDB, create a temporary database, run the tests, and then drop the temporary database. You should see output indicating that all tests passed.
