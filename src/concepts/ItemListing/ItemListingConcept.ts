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
    // Note: Index creation is handled by MongoDB automatically or manually
    // this.listingsCollection.createIndex({ seller: 1 });
    // this.listingsCollection.createIndex({ status: 1 });
    // this.listingsCollection.createIndex({ tags: 1 });
    // this.listingsCollection.createIndex({ _id: 1 });
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
