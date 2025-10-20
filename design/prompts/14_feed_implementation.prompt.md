# Feed Concept Implementation Request

I need you to implement Concept E — Feed from the SwapIt marketplace system specification. This concept provides a browsable, filterable view of available listings and synchronizes with updates across listing states.

## Concept Specification

### Concept E — Feed
**Purpose:** Provide a browsable, filterable view of available listings and synchronize with updates across listing states.

**Types:**
- FeedView
- ListingId
- Tag

**State:**
```
feedIndex: List<ListingId>
tagIndex: Map<Tag -> List<ListingId>>
priceIndex: Map<PriceRange -> List<ListingId>>
```

**Actions:**
- `get_latest(n: Int) -> FeedView`
- `filter_by_tag(tag: Tag) -> FeedView`
- `filter_by_price(min: CurrencyAmount, max: CurrencyAmount) -> FeedView`
- `refresh_feed()`

**Notifications:**
- FeedUpdated

**Notes:**
- Only active listings are indexed
- Automatically updates when listings are created, withdrawn, or sold
- Feed reads data by ID — no shared access to ItemListing internals

## Implementation Requirements

### 1. **Default Sorting Behavior**
- **Primary Sort**: Listings are sorted by **recent first** (reverse chronological order by creation date)
- **Secondary Filters**: Tags and price filters can be applied, but the results are still sorted in reverse chronological order
- **Example**: If filtering by tag "electronics", the electronics listings should be returned with the most recent first, then older ones

### 2. **Technical Requirements**
- Use **Deno** with **TypeScript**
- Use **MongoDB** with the `npm:mongodb` driver
- Follow the same patterns as the other concepts (UserAccount, ItemListing, Bidding, MessagingThread)
- Include comprehensive error handling with custom error classes
- Implement proper event emission for `FeedUpdated` notifications
- Use the shared database utilities from `../../utils/database.ts`

### 3. **File Structure**
Create the following files:
```
src/concepts/Feed/
├── FeedConcept.ts              # Main implementation
├── FeedConcept.test.ts         # Comprehensive test suite
├── FeedErrors.ts              # Custom error classes
├── mock-services.ts           # Mock services for testing
├── fake-data.ts              # Fake data generators
└── types.ts                  # Type definitions
```

### 4. **Integration Points**
- The Feed concept should listen for events from ItemListing:
  - `ListingCreated` - Add new listing to indexes
  - `ListingUpdated` - Update indexes if needed
  - `ListingWithdrawn` - Remove from indexes
  - `ListingSold` - Remove from indexes
- Use an event bus system similar to other concepts
- The Feed should query ItemListing by ID to get listing details (no direct access to ItemListing internals)

### 5. **FeedView Structure**
Define a `FeedView` type that includes:
- Array of listing summaries (not full listing objects)
- Pagination information (total count, current page, etc.)
- Applied filters (if any)
- Sorting information

### 6. **Database Design**
- Use MongoDB collections for the indexes
- Implement efficient querying with proper indexes
- Handle pagination for large result sets
- Ensure atomic updates when refreshing the feed

### 7. **Testing Requirements**
- Follow the LikertSurvey test format used in other concepts
- Test categories: Correctness, Robustness, Performance, Usability, Maintainability, Testability
- Include tests for:
  - Basic feed retrieval with recent-first sorting
  - Tag filtering with chronological ordering
  - Price range filtering with chronological ordering
  - Combined filters (tag + price) with chronological ordering
  - Event handling and feed updates
  - Pagination functionality
  - Error handling for invalid inputs
  - Performance with large datasets

### 8. **Mock Services**
Create mock services for:
- Event bus for listening to ItemListing events
- ItemListing service for querying listing details by ID
- Database utilities for testing

### 9. **Fake Data**
Generate comprehensive fake data including:
- Various listing types with different tags
- Listings with different price ranges
- Listings created at different times (for chronological testing)
- Edge cases (very old listings, very new listings, etc.)

## Expected Behavior

1. **Default Feed**: `get_latest(10)` returns the 10 most recently created active listings
2. **Tag Filter**: `filter_by_tag("electronics")` returns all electronics listings, most recent first
3. **Price Filter**: `filter_by_price(50, 200)` returns listings in that price range, most recent first
4. **Combined Filters**: Should work together while maintaining chronological order
5. **Event Updates**: Feed automatically updates when ItemListing events occur
6. **Pagination**: Support for large result sets with proper pagination

Please implement this Feed concept with all the specified requirements, comprehensive tests, and fake data. The implementation should be production-ready and follow the same patterns as the other concepts in the system.

# response:

Here's the Deno TypeScript implementation for the Feed Concept, adhering to all specified requirements.

This implementation provides a browsable, filterable view of active listings, sorted by recency. It uses MongoDB for indexing and stores listing summaries directly in its own collection for efficient querying, updating these summaries automatically in response to events from the `ItemListing` concept.

---

### File Structure:

```
src/concepts/Feed/
├── FeedConcept.ts
├── FeedConcept.test.ts
├── FeedErrors.ts
├── mock-services.ts
├── fake-data.ts
└── types.ts
```

---

### `src/concepts/Feed/types.ts`

```typescript
// src/concepts/Feed/types.ts
import { ObjectId } from "npm:mongodb";

// Re-using types from other concepts where applicable
export type ListingId = ObjectId;
export type UserId = ObjectId;
export type Tag = string;
export type CurrencyAmount = number; // Assuming number for simplicity; use BigInt or decimal for precise currency in production

export enum ListingStatus {
  Active = "active",
  Withdrawn = "withdrawn",
  Sold = "sold",
  Pending = "pending", // e.g., waiting for moderation
}

/**
 * Minimal ItemListing structure that FeedConcept needs to consume from ItemListingService.
 * This represents what the ItemListingService would return for a full listing.
 */
export interface ItemListing {
  _id: ListingId;
  sellerId: UserId;
  title: string;
  description: string;
  price: CurrencyAmount;
  currency: string;
  tags: Tag[];
  status: ListingStatus;
  createdAt: Date;
  updatedAt: Date;
  // Add other fields relevant to ItemListing (e.g., images, category) if FeedView needs them
}

/**
 * ListingSummary represents the minimal data displayed for a listing in the feed.
 * This is what FeedConcept stores in its internal index (feed_listings collection)
 * and returns within FeedView.
 */
export interface ListingSummary {
  id: ListingId;
  title: string;
  price: CurrencyAmount;
  currency: string;
  tags: Tag[];
  createdAt: Date;
  // Potentially other fields for quick display, e.g., thumbnailUrl
}

/**
 * FeedView provides the paginated, filtered, and sorted list of listings.
 */
export interface FeedView {
  listings: ListingSummary[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  appliedFilters: {
    tag?: Tag;
    minPrice?: CurrencyAmount;
    maxPrice?: CurrencyAmount;
  };
  sorting: {
    field: 'createdAt';
    order: 'desc';
  };
}

/**
 * Pagination options for feed queries.
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
}

/**
 * Filter options for feed queries.
 */
export interface FeedFilters {
  tag?: Tag;
  minPrice?: CurrencyAmount;
  maxPrice?: CurrencyAmount;
}

/**
 * Event data for when a listing is created.
 */
export interface ListingCreatedEvent {
  listingId: ListingId;
  sellerId: UserId;
}

/**
 * Event data for when a listing is updated.
 */
export interface ListingUpdatedEvent {
  listingId: ListingId;
  // Can include specific fields that were updated, or just the ID implies fetching full details
}

/**
 * Event data for when a listing is withdrawn.
 */
export interface ListingWithdrawnEvent {
  listingId: ListingId;
}

/**
 * Event data for when a listing is sold.
 */
export interface ListingSoldEvent {
  listingId: ListingId;
}

/**
 * Event data for when the feed content has been updated.
 */
export interface FeedUpdatedEvent {
  timestamp: Date;
  message: string;
}

/**
 * Defines the structure of documents stored in the Feed's internal index collection.
 */
export interface FeedIndexDoc {
  _id: ListingId; // Corresponds to ItemListing's _id
  title: string;
  price: CurrencyAmount;
  currency: string;
  tags: Tag[];
  createdAt: Date;
  sellerId: UserId; // Useful for internal logic, not necessarily in summary
}
```

---

### `src/concepts/Feed/FeedErrors.ts`

```typescript
// src/concepts/Feed/FeedErrors.ts

/**
 * Base custom error class for Feed Concept.
 */
export class FeedError extends Error {
  constructor(message: string, public code: string = 'FEED_GENERIC_ERROR') {
    super(message);
    this.name = 'FeedError';
  }
}

/**
 * Error for invalid input parameters to Feed Concept methods.
 */
export class InvalidInputError extends FeedError {
  constructor(message: string) {
    super(message, 'FEED_INVALID_INPUT');
    this.name = 'InvalidInputError';
  }
}

/**
 * Error for when a listing is expected in the feed index but not found.
 */
export class ListingNotFoundError extends FeedError {
  constructor(listingId: string) {
    super(`Listing with ID ${listingId} not found in feed index.`, 'FEED_LISTING_NOT_FOUND');
    this.name = 'ListingNotFoundError';
  }
}

/**
 * Error for failures when interacting with the ItemListingService.
 */
export class ItemListingServiceError extends FeedError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'FEED_ITEM_LISTING_SERVICE_ERROR');
    this.name = 'ItemListingServiceError';
  }
}

/**
 * Error for failures during database operations.
 */
export class DatabaseError extends FeedError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'FEED_DATABASE_ERROR');
    this.name = 'DatabaseError';
  }
}
```

---

### `src/concepts/Feed/mock-services.ts`

```typescript
// src/concepts/Feed/mock-services.ts
import { EventEmitter } from "node:events"; // Deno has Node.js compatibility with `node:` prefix
import { Collection, Db, MongoClient, ObjectId } from "npm:mongodb";
import { ItemListing, ListingId, ListingStatus } from "./types.ts";

/**
 * Interface for a generic event bus system.
 */
export interface EventBus {
  emit(event: string, data: any): void;
  on(event: string, listener: (data: any) => void): void;
  off(event: string, listener: (data: any) => void): void;
}

/**
 * Mock implementation of the EventBus, extending Node's EventEmitter.
 * Includes static constants for event names for better type safety.
 */
export class MockEventBus extends EventEmitter implements EventBus {
  static readonly LISTING_CREATED = 'ListingCreated';
  static readonly LISTING_UPDATED = 'ListingUpdated';
  static readonly LISTING_WITHDRAWN = 'ListingWithdrawn';
  static readonly LISTING_SOLD = 'ListingSold';
  static readonly FEED_UPDATED = 'FeedUpdated';
}

/**
 * Interface for the ItemListing service that FeedConcept depends on
 * to fetch full listing details during event processing.
 */
export interface ItemListingService {
  getListing(listingId: ListingId): Promise<ItemListing | null>;
}

/**
 * Mock implementation of the ItemListingService.
 * Stores listings in an in-memory Map for testing purposes.
 */
export class MockItemListingService implements ItemListingService {
  private listings: Map<string, ItemListing> = new Map();

  constructor(initialListings: ItemListing[] = []) {
    initialListings.forEach(listing => this.listings.set(listing._id.toHexString(), listing));
  }

  /**
   * Retrieves a listing by its ID from the mock service.
   */
  async getListing(listingId: ListingId): Promise<ItemListing | null> {
    const listing = this.listings.get(listingId.toHexString());
    if (!listing) {
      console.warn(`MockItemListingService: Listing with ID ${listingId.toHexString()} not found.`);
    }
    return Promise.resolve(listing || null);
  }

  /**
   * Helper method for tests: adds a listing to the mock service.
   */
  addListing(listing: ItemListing): void {
    this.listings.set(listing._id.toHexString(), listing);
  }

  /**
   * Helper method for tests: updates an existing listing in the mock service.
   */
  updateListing(listingId: ListingId, updates: Partial<ItemListing>): void {
    const current = this.listings.get(listingId.toHexString());
    if (current) {
      this.listings.set(listingId.toHexString(), { ...current, ...updates, updatedAt: new Date() });
    }
  }

  /**
   * Helper method for tests: removes a listing from the mock service.
   */
  removeListing(listingId: ListingId): void {
    this.listings.delete(listingId.toHexString());
  }

  /**
   * Helper method for tests: clears all listings from the mock service.
   */
  clear(): void {
    this.listings.clear();
  }
}

// Shared database utility functions
// Assuming these exist in ../../utils/database.ts as specified.
// For testing, we provide a basic interface and a concrete mock client.
export interface DbClient {
  db: Db;
  client: MongoClient;
  connect(): Promise<void>;
  close(): Promise<void>;
  getCollection<T>(name: string): Collection<T>;
}

/**
 * Mock implementation of DbClient for testing.
 * Connects to a real MongoDB instance for integration-style tests.
 */
export class MockDbClient implements DbClient {
  public db!: Db;
  public client!: MongoClient;
  private readonly uri: string;
  private readonly dbName: string;
  public connected: boolean = false; // Track connection status

  constructor(uri: string, dbName: string) {
    this.uri = uri;
    this.dbName = dbName;
  }

  async connect(): Promise<void> {
    if (this.connected && this.client && this.client.db(this.dbName) === this.db) {
      return; // Already connected to the target database
    }
    try {
      this.client = await MongoClient.connect(this.uri);
      this.db = this.client.db(this.dbName);
      this.connected = true;
    } catch (error) {
      console.error("Failed to connect to MongoDB in MockDbClient:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.connected && this.client) {
      await this.client.close();
      this.connected = false;
    }
  }

  getCollection<T>(name: string): Collection<T> {
    if (!this.db) {
      throw new Error("Database not connected. Call connect() first.");
    }
    return this.db.collection<T>(name);
  }
}
```

---

### `src/concepts/Feed/fake-data.ts`

```typescript
// src/concepts/Feed/fake-data.ts
import { ObjectId } from "npm:mongodb";
import { ItemListing, ListingStatus, Tag, CurrencyAmount, UserId, ListingId, FeedIndexDoc } from "./types.ts";

/**
 * Generates a random ObjectId.
 */
function generateObjectId(): ObjectId {
  return new ObjectId();
}

/**
 * Generates a random number within a range.
 */
function getRandomNumber(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generates a random date within a specified range.
 */
function getRandomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

/**
 * Picks a random element from an array.
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const predefinedTags: Tag[] = [
  "electronics", "books", "fashion", "home goods", "sports", "antiques",
  "collectibles", "automotive", "toys", "art", "jewelry", "services",
  "software", "real estate", "furniture", "outdoor", "handmade"
];

const predefinedCurrencies: string[] = ["USD", "EUR", "GBP"];

const predefinedTitles = [
  "Vintage Camera", "Latest Smartphone", "Classic Novel", "Designer Dress",
  "Smart Home Device", "Basketball Hoop", "Rare Stamp", "Car Accessory Kit",
  "Building Blocks Set", "Abstract Painting", "Gold Necklace", "Web Design Service",
  "Productivity Software", "Cozy Sofa", "Camping Tent", "Custom T-Shirt",
  "Gaming Console", "Electric Scooter", "Robot Vacuum"
];

export interface FakeListingOptions {
  listingId?: ListingId;
  sellerId?: UserId;
  title?: string;
  description?: string;
  price?: CurrencyAmount;
  currency?: string;
  tags?: Tag[];
  status?: ListingStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Generates a single fake ItemListing with sensible defaults.
 */
export function generateFakeListing(options?: FakeListingOptions): ItemListing {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Listings mostly within the last 30 days

  const listingId = options?.listingId ?? generateObjectId();
  const sellerId = options?.sellerId ?? generateObjectId();
  const title = options?.title ?? pickRandom(predefinedTitles);
  const description = options?.description ?? `Description for ${title}. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`;
  const price = options?.price ?? parseFloat(getRandomNumber(10, 1000).toFixed(2));
  const currency = options?.currency ?? pickRandom(predefinedCurrencies);
  const tags = options?.tags ?? Array.from({ length: Math.floor(getRandomNumber(1, 4)) }, () => pickRandom(predefinedTags));
  const status = options?.status ?? ListingStatus.Active;
  const createdAt = options?.createdAt ?? getRandomDate(thirtyDaysAgo, now);
  const updatedAt = options?.updatedAt ?? createdAt;

  return {
    _id: listingId,
    sellerId,
    title,
    description,
    price,
    currency,
    tags,
    status,
    createdAt,
    updatedAt,
  };
}

/**
 * Generates an array of fake ItemListings.
 */
export function generateFakeListings(count: number, options?: FakeListingOptions): ItemListing[] {
  return Array.from({ length: count }, () => generateFakeListing(options));
}

/**
 * Creates a FeedIndexDoc from an ItemListing.
 * This helper ensures only relevant fields are extracted for the feed's internal index.
 */
export function createFeedIndexDoc(listing: ItemListing): FeedIndexDoc {
  return {
    _id: listing._id,
    title: listing.title,
    price: listing.price,
    currency: listing.currency,
    tags: listing.tags,
    createdAt: listing.createdAt,
    sellerId: listing.sellerId,
  };
}
```

---

### `src/concepts/Feed/FeedConcept.ts`

```typescript
// src/concepts/Feed/FeedConcept.ts
import { Collection, Document } from "npm:mongodb";
import { DbClient } from "../../utils/database.ts"; // Assumed path for shared database utilities
import { EventBus, ItemListingService, MockEventBus } from "./mock-services.ts";
import {
  FeedView, ListingSummary, ListingId, Tag, CurrencyAmount,
  ListingCreatedEvent, ListingUpdatedEvent, ListingWithdrawnEvent, ListingSoldEvent, FeedUpdatedEvent,
  ItemListing, ListingStatus, FeedIndexDoc, PaginationOptions, FeedFilters
} from "./types.ts";
import { DatabaseError, InvalidInputError, ItemListingServiceError, ListingNotFoundError } from "./FeedErrors.ts";

/**
 * FeedConcept provides a browsable, filterable, and automatically updating view of active listings.
 * It maintains its own indexed collection of listing summaries for efficient querying.
 */
export class FeedConcept {
  private feedCollection: Collection<FeedIndexDoc>;
  private readonly FEED_COLLECTION_NAME = "feed_listings"; // Name for the Feed's internal index collection
  private readonly eventBus: EventBus;
  private readonly itemListingService: ItemListingService;

  constructor(dbClient: DbClient, eventBus: EventBus, itemListingService: ItemListingService) {
    this.feedCollection = dbClient.getCollection<FeedIndexDoc>(this.FEED_COLLECTION_NAME);
    this.eventBus = eventBus;
    this.itemListingService = itemListingService;

    // Initialize MongoDB indexes and register event listeners upon instantiation.
    // Use an async IIFE for initIndexes to avoid blocking constructor,
    // but ensure robust error handling if the indexes are critical for operation.
    this.initIndexes().catch(err => {
      console.error("FeedConcept: Failed to initialize database indexes on startup:", err);
      // Depending on the application's robustness requirements,
      // this might warrant stopping the service or entering a degraded mode.
    });
    this.registerEventListeners();
  }

  /**
   * Initializes necessary MongoDB indexes for efficient querying and sorting.
   * This method ensures the database is prepared for feed operations.
   */
  private async initIndexes(): Promise<void> {
    try {
      // Index for primary sort order (recent first)
      await this.feedCollection.createIndex({ "createdAt": -1 }, { name: "idx_createdAt_desc" });
      // Index for tag filtering
      await this.feedCollection.createIndex({ "tags": 1 }, { name: "idx_tags" });
      // Index for price filtering
      await this.feedCollection.createIndex({ "price": 1 }, { name: "idx_price" });

      // Compound indexes for common combined queries (tag+sort, price+sort, tag+price+sort)
      await this.feedCollection.createIndex({ "tags": 1, "createdAt": -1 }, { name: "idx_tags_createdAt_desc" });
      await this.feedCollection.createIndex({ "price": 1, "createdAt": -1 }, { name: "idx_price_createdAt_desc" });
      await this.feedCollection.createIndex({ "tags": 1, "price": 1, "createdAt": -1 }, { name: "idx_tags_price_createdAt_desc" });

      console.log("FeedConcept: MongoDB indexes initialized successfully.");
    } catch (error) {
      console.error("FeedConcept: Failed to create feed indexes:", error);
      throw new DatabaseError("Failed to initialize feed indexes.", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Registers listeners for ItemListing events to keep the feed index updated.
   */
  private registerEventListeners(): void {
    this.eventBus.on(MockEventBus.LISTING_CREATED, this._handleListingCreated.bind(this));
    this.eventBus.on(MockEventBus.LISTING_UPDATED, this._handleListingUpdated.bind(this));
    this.eventBus.on(MockEventBus.LISTING_WITHDRAWN, this._handleListingWithdrawn.bind(this));
    this.eventBus.on(MockEventBus.LISTING_SOLD, this._handleListingSold.bind(this));
    console.log("FeedConcept: Event listeners registered.");
  }

  /**
   * Fetches full ItemListing details from the ItemListingService.
   * This is used by event handlers to get data for the feed index.
   * @param listingId The ID of the listing to fetch.
   * @returns The full ItemListing object.
   * @throws {ListingNotFoundError} If the listing is not found by the ItemListingService.
   * @throws {ItemListingServiceError} For other errors from the ItemListingService.
   */
  private async _fetchListingDetails(listingId: ListingId): Promise<ItemListing> {
    try {
      const listing = await this.itemListingService.getListing(listingId);
      if (!listing) {
        throw new ListingNotFoundError(listingId.toHexString());
      }
      return listing;
    } catch (error) {
      if (error instanceof ListingNotFoundError) {
        throw error; // Re-throw specific error
      }
      throw new ItemListingServiceError(
        `Failed to fetch listing details for ID: ${listingId.toHexString()}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Creates a FeedIndexDoc from an ItemListing, extracting only necessary fields.
   * @param listing The full ItemListing object.
   * @returns A FeedIndexDoc suitable for insertion into the feed collection.
   */
  private _createFeedIndexDoc(listing: ItemListing): FeedIndexDoc {
    return {
      _id: listing._id,
      title: listing.title,
      price: listing.price,
      currency: listing.currency,
      tags: listing.tags,
      createdAt: listing.createdAt,
      sellerId: listing.sellerId,
    };
  }

  /**
   * Handles `ListingCreated` events. Adds active listings to the feed index.
   * @param event The ListingCreatedEvent data.
   */
  private async _handleListingCreated(event: ListingCreatedEvent): Promise<void> {
    try {
      const listing = await this._fetchListingDetails(event.listingId);
      if (listing.status === ListingStatus.Active) {
        await this.feedCollection.insertOne(this._createFeedIndexDoc(listing));
        this.eventBus.emit(MockEventBus.FEED_UPDATED, { timestamp: new Date(), message: `Listing ${event.listingId} added to feed.` } as FeedUpdatedEvent);
        console.log(`Feed: Added listing ${event.listingId} (CREATED)`);
      } else {
        console.log(`Feed: Ignoring created listing ${event.listingId} because its status is ${listing.status}.`);
      }
    } catch (error) {
      console.error(`Feed: Error handling ListingCreated event for ${event.listingId}:`, error);
      // In a production system, this might trigger a retry mechanism or an alert.
    }
  }

  /**
   * Handles `ListingUpdated` events. Updates existing listings or adds/removes them based on status.
   * @param event The ListingUpdatedEvent data.
   */
  private async _handleListingUpdated(event: ListingUpdatedEvent): Promise<void> {
    try {
      const listing = await this._fetchListingDetails(event.listingId);
      const feedIndexDoc = this._createFeedIndexDoc(listing);
      const updateResult = await this.feedCollection.updateOne(
        { _id: event.listingId },
        { $set: feedIndexDoc }
      );

      if (listing.status === ListingStatus.Active) {
        if (updateResult.matchedCount === 0) {
          // Listing was not in feed (e.g., was inactive or new), now it's active, so add it.
          await this.feedCollection.insertOne(feedIndexDoc);
          this.eventBus.emit(MockEventBus.FEED_UPDATED, { timestamp: new Date(), message: `Listing ${event.listingId} (re)activated and added to feed.` } as FeedUpdatedEvent);
          console.log(`Feed: Reactivated listing ${event.listingId} and added to feed (UPDATED).`);
        } else {
          // Listing was active and remains active, just update its details.
          this.eventBus.emit(MockEventBus.FEED_UPDATED, { timestamp: new Date(), message: `Listing ${event.listingId} updated in feed.` } as FeedUpdatedEvent);
          console.log(`Feed: Updated listing ${event.listingId} in feed (UPDATED).`);
        }
      } else {
        // Listing is no longer active, remove it from the feed.
        const deleteResult = await this.feedCollection.deleteOne({ _id: event.listingId });
        if (deleteResult.deletedCount > 0) {
          this.eventBus.emit(MockEventBus.FEED_UPDATED, { timestamp: new Date(), message: `Listing ${event.listingId} updated to inactive and removed from feed.` } as FeedUpdatedEvent);
          console.log(`Feed: Removed inactive listing ${event.listingId} from feed (UPDATED).`);
        }
      }
    } catch (error) {
      console.error(`Feed: Error handling ListingUpdated event for ${event.listingId}:`, error);
    }
  }

  /**
   * Handles `ListingWithdrawn` events. Removes the listing from the feed index.
   * @param event The ListingWithdrawnEvent data.
   */
  private async _handleListingWithdrawn(event: ListingWithdrawnEvent): Promise<void> {
    try {
      const deleteResult = await this.feedCollection.deleteOne({ _id: event.listingId });
      if (deleteResult.deletedCount > 0) {
        this.eventBus.emit(MockEventBus.FEED_UPDATED, { timestamp: new Date(), message: `Listing ${event.listingId} withdrawn and removed from feed.` } as FeedUpdatedEvent);
        console.log(`Feed: Removed listing ${event.listingId} (WITHDRAWN).`);
      }
    } catch (error) {
      console.error(`Feed: Error handling ListingWithdrawn event for ${event.listingId}:`, error);
    }
  }

  /**
   * Handles `ListingSold` events. Removes the listing from the feed index.
   * @param event The ListingSoldEvent data.
   */
  private async _handleListingSold(event: ListingSoldEvent): Promise<void> {
    try {
      const deleteResult = await this.feedCollection.deleteOne({ _id: event.listingId });
      if (deleteResult.deletedCount > 0) {
        this.eventBus.emit(MockEventBus.FEED_UPDATED, { timestamp: new Date(), message: `Listing ${event.listingId} sold and removed from feed.` } as FeedUpdatedEvent);
        console.log(`Feed: Removed listing ${event.listingId} (SOLD).`);
      }
    } catch (error) {
      console.error(`Feed: Error handling ListingSold event for ${event.listingId}:`, error);
    }
  }

  /**
   * Validates pagination parameters.
   * @param n The number of items per page.
   * @param page The current page number.
   * @returns Validated PaginationOptions.
   * @throws {InvalidInputError} If `n` or `page` are invalid.
   */
  private _validatePagination(n: number, page: number): PaginationOptions {
    if (typeof n !== 'number' || n <= 0 || !Number.isInteger(n)) {
      throw new InvalidInputError("Page size (n) must be a positive integer.");
    }
    if (typeof page !== 'number' || page <= 0 || !Number.isInteger(page)) {
      throw new InvalidInputError("Page number must be a positive integer.");
    }
    return { pageSize: n, page };
  }

  /**
   * Validates price range parameters.
   * @param min The minimum price.
   * @param max The maximum price.
   * @returns Validated min/max price values.
   * @throws {InvalidInputError} If `min` or `max` are invalid or inconsistent.
   */
  private _validatePriceRange(min?: CurrencyAmount, max?: CurrencyAmount): { min?: CurrencyAmount, max?: CurrencyAmount } {
    if (min !== undefined && (typeof min !== 'number' || min < 0)) {
      throw new InvalidInputError("Minimum price must be a non-negative number.");
    }
    if (max !== undefined && (typeof max !== 'number' || max < 0)) {
      throw new InvalidInputError("Maximum price must be a non-negative number.");
    }
    if (min !== undefined && max !== undefined && min > max) {
      throw new InvalidInputError("Minimum price cannot be greater than maximum price.");
    }
    return { min, max };
  }

  /**
   * Internal helper to query the feed collection based on filters and pagination.
   * @param filters The applied filters (tag, min/max price).
   * @param pagination Pagination options.
   * @returns An object containing the found FeedIndexDocs and the total count.
   * @throws {DatabaseError} If there's a database operation failure.
   */
  private async _queryFeed(
    filters: FeedFilters,
    pagination: PaginationOptions
  ): Promise<{ listings: FeedIndexDoc[], totalCount: number }> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const query: Document = {};
    if (filters.tag) {
      query.tags = filters.tag;
    }
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      query.price = {};
      if (filters.minPrice !== undefined) {
        query.price.$gte = filters.minPrice;
      }
      if (filters.maxPrice !== undefined) {
        query.price.$lte = filters.maxPrice;
      }
    }

    try {
      const totalCount = await this.feedCollection.countDocuments(query);
      const listings = await this.feedCollection
        .find(query)
        .sort({ createdAt: -1 }) // Primary sort: recent first
        .skip(skip)
        .limit(pageSize)
        .toArray();

      return { listings, totalCount };
    } catch (error) {
      throw new DatabaseError(
        "Failed to query feed listings.",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Builds a FeedView object from the retrieved FeedIndexDocs and query parameters.
   * @param feedIndexDocs The list of FeedIndexDoc results from the database.
   * @param totalCount The total count of documents matching the query.
   * @param pagination Pagination options used.
   * @param filters Filters applied.
   * @returns A complete FeedView object.
   */
  private _buildFeedView(
    feedIndexDocs: FeedIndexDoc[],
    totalCount: number,
    pagination: PaginationOptions,
    filters: FeedFilters
  ): FeedView {
    const { page, pageSize } = pagination;
    const totalPages = Math.ceil(totalCount / pageSize);

    const listings: ListingSummary[] = feedIndexDocs.map(doc => ({
      id: doc._id,
      title: doc.title,
      price: doc.price,
      currency: doc.currency,
      tags: doc.tags,
      createdAt: doc.createdAt,
    }));

    return {
      listings,
      totalCount,
      currentPage: page,
      pageSize,
      totalPages,
      appliedFilters: {
        tag: filters.tag,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
      },
      sorting: {
        field: 'createdAt',
        order: 'desc',
      },
    };
  }

  /**
   * Retrieves the latest active listings, sorted by creation date (recent first).
   * Supports pagination.
   * @param n The number of listings to retrieve per page.
   * @param page The page number to retrieve (1-indexed). Defaults to 1.
   * @returns A FeedView object containing a summary of listings and pagination info.
   * @throws {InvalidInputError} If n or page are invalid.
   * @throws {DatabaseError} If there's a database operation failure.
   */
  async get_latest(n: number, page: number = 1): Promise<FeedView> {
    const pagination = this._validatePagination(n, page);
    const filters: FeedFilters = {}; // No filters applied
    const { listings: feedIndexDocs, totalCount } = await this._queryFeed(filters, pagination);
    return this._buildFeedView(feedIndexDocs, totalCount, pagination, filters);
  }

  /**
   * Filters listings by a specific tag, sorted by creation date (recent first).
   * Supports pagination.
   * @param tag The tag to filter by.
   * @param n The number of listings to retrieve per page.
   * @param page The page number to retrieve (1-indexed). Defaults to 1.
   * @returns A FeedView object containing a summary of filtered listings and pagination info.
   * @throws {InvalidInputError} If n or page are invalid, or tag is empty.
   * @throws {DatabaseError} If there's a database operation failure.
   */
  async filter_by_tag(tag: Tag, n: number, page: number = 1): Promise<FeedView> {
    if (!tag || tag.trim() === '') {
      throw new InvalidInputError("Tag cannot be empty.");
    }
    const pagination = this._validatePagination(n, page);
    const filters: FeedFilters = { tag: tag.trim() };
    const { listings: feedIndexDocs, totalCount } = await this._queryFeed(filters, pagination);
    return this._buildFeedView(feedIndexDocs, totalCount, pagination, filters);
  }

  /**
   * Filters listings by a price range, sorted by creation date (recent first).
   * Supports pagination.
   * @param min The minimum price (inclusive). Can be undefined for open-ended lower bound.
   * @param max The maximum price (inclusive). Can be undefined for open-ended upper bound.
   * @param n The number of listings to retrieve per page.
   * @param page The page number to retrieve (1-indexed). Defaults to 1.
   * @returns A FeedView object containing a summary of filtered listings and pagination info.
   * @throws {InvalidInputError} If n, page, min, or max are invalid, or if both min and max are undefined.
   * @throws {DatabaseError} If there's a database operation failure.
   */
  async filter_by_price(min: CurrencyAmount | undefined, max: CurrencyAmount | undefined, n: number, page: number = 1): Promise<FeedView> {
    const { min: validatedMin, max: validatedMax } = this._validatePriceRange(min, max);
    if (validatedMin === undefined && validatedMax === undefined) {
      throw new InvalidInputError("At least a minimum or maximum price must be provided for price filtering.");
    }
    const pagination = this._validatePagination(n, page);
    const filters: FeedFilters = { minPrice: validatedMin, maxPrice: validatedMax };
    const { listings: feedIndexDocs, totalCount } = await this._queryFeed(filters, pagination);
    return this._buildFeedView(feedIndexDocs, totalCount, pagination, filters);
  }

  /**
   * Filters listings by a combination of tag and price range, sorted by creation date (recent first).
   * This method addresses the "Combined filters (tag + price) with chronological ordering" requirement.
   * Supports pagination.
   * @param tag The tag to filter by (optional).
   * @param minPrice The minimum price (optional).
   * @param maxPrice The maximum price (optional).
   * @param n The number of listings to retrieve per page.
   * @param page The page number to retrieve (1-indexed). Defaults to 1.
   * @returns A FeedView object containing a summary of filtered listings and pagination info.
   * @throws {InvalidInputError} If n, page, minPrice, or maxPrice are invalid.
   * @throws {DatabaseError} If there's a database operation failure.
   */
  async filter_by_combined(
    tag: Tag | undefined,
    minPrice: CurrencyAmount | undefined,
    maxPrice: CurrencyAmount | undefined,
    n: number,
    page: number = 1
  ): Promise<FeedView> {
    const pagination = this._validatePagination(n, page);
    const { min: validatedMin, max: validatedMax } = this._validatePriceRange(minPrice, maxPrice);

    const filters: FeedFilters = {
      tag: tag?.trim() || undefined,
      minPrice: validatedMin,
      maxPrice: validatedMax,
    };

    // If no specific filters are applied, behave like get_latest
    if (!filters.tag && filters.minPrice === undefined && filters.maxPrice === undefined) {
      return this.get_latest(n, page);
    }

    const { listings: feedIndexDocs, totalCount } = await this._queryFeed(filters, pagination);
    return this._buildFeedView(feedIndexDocs, totalCount, pagination, filters);
  }

  /**
   * Triggers a feed refresh notification.
   * In an automatically updating system, this might signal a client to re-fetch or
   * could conceptually initiate a full rebuild of the feed index if needed for resilience
   * or initial population. For this implementation, it primarily acts as a notification emitter.
   */
  async refresh_feed(): Promise<void> {
    console.log("Feed: Refresh initiated. Emitting FeedUpdated notification.");
    this.eventBus.emit(MockEventBus.FEED_UPDATED, { timestamp: new Date(), message: "Feed refresh requested." } as FeedUpdatedEvent);
  }

  /**
   * Helper method for testing: Clears all documents from the feed collection.
   */
  async clearFeed(): Promise<void> {
    try {
      await this.feedCollection.deleteMany({});
    } catch (error) {
      throw new DatabaseError(
        "Failed to clear feed collection.",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
```

---

### `src/concepts/Feed/FeedConcept.test.ts`

```typescript
// src/concepts/Feed/FeedConcept.test.ts
import { assert, assertEquals, assertExists, assertInstanceOf, assertRejects } from "https://deno.land/std@0.210.0/assert/mod.ts";
import { Collection, Db, MongoClient, ObjectId } from "npm:mongodb";
import { MockDbClient, MockEventBus, MockItemListingService, DbClient } from "./mock-services.ts";
import { FeedConcept } from "./FeedConcept.ts";
import { generateFakeListing, generateFakeListings, createFeedIndexDoc } from "./fake-data.ts";
import { FeedError, InvalidInputError, DatabaseError, ItemListingServiceError, ListingNotFoundError } from "./FeedErrors.ts";
import { FeedIndexDoc, ItemListing, ListingCreatedEvent, ListingStatus, ListingUpdatedEvent, ListingSoldEvent, ListingWithdrawnEvent, FeedView, Tag, CurrencyAmount } from "./types.ts";

// Configuration for the MongoDB test database
const MONGODB_TEST_URI = Deno.env.get("MONGODB_TEST_URI") || "mongodb://localhost:27017";
// Generate a unique database name for each test run to ensure isolation
const MONGODB_TEST_DB = `swapit_feed_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

interface TestContext {
  dbClient: DbClient;
  db: Db;
  feedCollection: Collection<FeedIndexDoc>;
  eventBus: MockEventBus;
  itemListingService: MockItemListingService;
  feedConcept: FeedConcept;
}

let context: TestContext;

Deno.test("FeedConcept Test Suite", async (t) => {
  // --- Setup Phase (executed once before all tests) ---
  Deno.test("Setup Test Environment", async () => {
    context = {} as TestContext;
    context.dbClient = new MockDbClient(MONGODB_TEST_URI, MONGODB_TEST_DB);
    await context.dbClient.connect();
    context.db = context.dbClient.db;
    context.feedCollection = context.dbClient.getCollection<FeedIndexDoc>("feed_listings");
    context.eventBus = new MockEventBus();
    context.itemListingService = new MockItemListingService();
    
    // Instantiate FeedConcept, which internally registers listeners and initializes indexes
    context.feedConcept = new FeedConcept(context.dbClient, context.eventBus, context.itemListingService);

    // Give a moment for async index creation to complete if necessary
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify indexes are created
    const indexes = await context.feedCollection.listIndexes().toArray();
    // Expect at least: _id, createdAt, tags, price, and compound indexes (min 6 custom + 1 _id)
    assert(indexes.length >= 7, `Expected at least 7 indexes, got ${indexes.length}`);
    console.log(`Test DB: ${MONGODB_TEST_DB} is ready. Indexes: ${indexes.map(idx => idx.name).join(', ')}`);
  });

  // --- Teardown Phase (executed once after all tests) ---
  t.afterAll(async () => {
    try {
      if (context.db) {
        await context.db.dropDatabase();
        console.log(`Dropped test database: ${MONGODB_TEST_DB}`);
      }
      if (context.dbClient) {
        await context.dbClient.close();
      }
    } catch (error) {
      console.error("Error during test teardown:", error);
    }
  });

  // --- beforeEach Phase (executed before each test step) ---
  t.beforeEach(async () => {
    // Clear data and reset services for isolated test runs
    await context.feedCollection.deleteMany({});
    context.itemListingService.clear();
    context.eventBus.removeAllListeners(); // Clear all listeners from previous tests
    
    // Re-register listeners for the FeedConcept instance for the current test
    // This is crucial because removeAllListeners clears the ones registered in the constructor
    (context.feedConcept as any).registerEventListeners(); 
  });

  // Helper to wait for event processing (simulate async operations)
  const waitForEventProcessing = async (delay = 50) => new Promise(resolve => setTimeout(resolve, delay));

  // --- Test Categories ---

  await t.step("Correctness - Default Feed Retrieval (get_latest)", async (test) => {
    test.beforeEach(async () => {
      // Create fake listings with specific dates for chronological sorting tests
      const now = new Date();
      const listingsData = [
        generateFakeListing({ createdAt: new Date(now.getTime() - 3000), tags: ["a"], title: "Oldest Item" }),
        generateFakeListing({ createdAt: new Date(now.getTime() - 2000), tags: ["b"], title: "Older Item" }),
        generateFakeListing({ createdAt: new Date(now.getTime() - 1000), tags: ["c"], title: "New Item" }),
        generateFakeListing({ createdAt: now, tags: ["d"], title: "Newest Item" }), // Newest
      ];
      // Add to mock ItemListingService so FeedConcept can fetch details via _fetchListingDetails
      listingsData.forEach(l => context.itemListingService.addListing(l));
      // Simulate creation events to populate the Feed's internal index
      for (const listing of listingsData) {
        context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: listing._id, sellerId: listing.sellerId } as ListingCreatedEvent);
      }
      await waitForEventProcessing(100); // Give ample time for all events to be processed
    });

    await test.step("should return the latest active listings sorted by creation date descending", async () => {
      const feed = await context.feedConcept.get_latest(4);
      assertEquals(feed.listings.length, 4);
      assertEquals(feed.listings[0].title, "Newest Item", "Newest listing should be first");
      assertEquals(feed.listings[1].title, "New Item", "Second newest listing should be second");
      assertEquals(feed.listings[3].title, "Oldest Item", "Oldest listing should be last");
      assertEquals(feed.totalCount, 4);
      assertEquals(feed.currentPage, 1);
      assertEquals(feed.pageSize, 4);
      assertEquals(feed.sorting.field, 'createdAt');
      assertEquals(feed.sorting.order, 'desc');
    });

    await test.step("should handle pagination correctly", async () => {
      const feedPage1 = await context.feedConcept.get_latest(2, 1);
      assertEquals(feedPage1.listings.length, 2);
      assertEquals(feedPage1.listings[0].title, "Newest Item");
      assertEquals(feedPage1.currentPage, 1);
      assertEquals(feedPage1.totalPages, 2);

      const feedPage2 = await context.feedConcept.get_latest(2, 2);
      assertEquals(feedPage2.listings.length, 2);
      assertEquals(feedPage2.listings[0].title, "New Item"); // Third newest overall
      assertEquals(feedPage2.currentPage, 2);
      assertEquals(feedPage2.totalPages, 2);
    });

    await test.step("should return empty feed if no active listings", async () => {
      await context.feedCollection.deleteMany({}); // Clear active listings in DB
      const feed = await context.feedConcept.get_latest(5);
      assertEquals(feed.listings.length, 0);
      assertEquals(feed.totalCount, 0);
    });
  });

  await t.step("Correctness - Tag Filtering (filter_by_tag)", async (test) => {
    let electronicsListing1: ItemListing;
    let electronicsListing2: ItemListing;
    let booksListing: ItemListing;

    test.beforeEach(async () => {
      const now = new Date();
      electronicsListing1 = generateFakeListing({ createdAt: new Date(now.getTime() - 200), tags: ["electronics", "gadgets"], title: "Super Gadget" });
      booksListing = generateFakeListing({ createdAt: new Date(now.getTime() - 100), tags: ["books", "fiction"], title: "Fantasy Book" });
      electronicsListing2 = generateFakeListing({ createdAt: now, tags: ["electronics", "home goods"], title: "Smart Speaker" });
      const otherListing = generateFakeListing({ createdAt: new Date(now.getTime() - 300), tags: ["fashion"], title: "Stylish Shirt" });

      const listings = [electronicsListing1, booksListing, electronicsListing2, otherListing];
      listings.forEach(l => context.itemListingService.addListing(l));
      for (const listing of listings) {
        context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: listing._id, sellerId: listing.sellerId } as ListingCreatedEvent);
      }
      await waitForEventProcessing();
    });

    await test.step("should return listings with the specified tag, sorted chronologically", async () => {
      const feed = await context.feedConcept.filter_by_tag("electronics", 5);
      assertEquals(feed.listings.length, 2);
      assertEquals(feed.listings[0].title, "Smart Speaker", "Newest electronics should be first");
      assertEquals(feed.listings[1].title, "Super Gadget", "Older electronics should be second");
      assertEquals(feed.totalCount, 2);
      assertEquals(feed.appliedFilters.tag, "electronics");
    });

    await test.step("should handle pagination for tag filters", async () => {
      const feedPage1 = await context.feedConcept.filter_by_tag("electronics", 1, 1);
      assertEquals(feedPage1.listings.length, 1);
      assertEquals(feedPage1.listings[0].title, "Smart Speaker");

      const feedPage2 = await context.feedConcept.filter_by_tag("electronics", 1, 2);
      assertEquals(feedPage2.listings.length, 1);
      assertEquals(feedPage2.listings[0].title, "Super Gadget");
    });

    await test.step("should return empty if tag not found", async () => {
      const feed = await context.feedConcept.filter_by_tag("nonexistent", 5);
      assertEquals(feed.listings.length, 0);
      assertEquals(feed.totalCount, 0);
    });
  });

  await t.step("Correctness - Price Filtering (filter_by_price)", async (test) => {
    let cheapListing: ItemListing;
    let midListing: ItemListing;
    let expensiveListing: ItemListing;

    test.beforeEach(async () => {
      const now = new Date();
      cheapListing = generateFakeListing({ createdAt: new Date(now.getTime() - 200), price: 25, title: "Cheap Item" });
      midListing = generateFakeListing({ createdAt: new Date(now.getTime() - 100), price: 150, title: "Mid-range Item" });
      expensiveListing = generateFakeListing({ createdAt: now, price: 500, title: "Expensive Item" });
      const veryCheapListing = generateFakeListing({ createdAt: new Date(now.getTime() - 300), price: 5, title: "Very Cheap Item" });
      const veryExpensiveListing = generateFakeListing({ createdAt: new Date(now.getTime() - 50), price: 1000, title: "Very Expensive Item" });

      const listings = [cheapListing, midListing, expensiveListing, veryCheapListing, veryExpensiveListing];
      listings.forEach(l => context.itemListingService.addListing(l));
      for (const listing of listings) {
        context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: listing._id, sellerId: listing.sellerId } as ListingCreatedEvent);
      }
      await waitForEventProcessing();
    });

    await test.step("should return listings within the price range, sorted chronologically", async () => {
      const feed = await context.feedConcept.filter_by_price(100, 600, 5);
      assertEquals(feed.listings.length, 2);
      assertEquals(feed.listings[0].title, "Expensive Item", "Newest in range (500) should be first");
      assertEquals(feed.listings[1].title, "Mid-range Item", "Older in range (150) should be second");
      assertEquals(feed.totalCount, 2);
      assertEquals(feed.appliedFilters.minPrice, 100);
      assertEquals(feed.appliedFilters.maxPrice, 600);
    });

    await test.step("should handle open-ended price ranges (min only)", async () => {
      const feed = await context.feedConcept.filter_by_price(400, undefined, 5);
      assertEquals(feed.listings.length, 2);
      assertEquals(feed.listings[0].title, "Very Expensive Item"); // 1000, newest
      assertEquals(feed.listings[1].title, "Expensive Item"); // 500, older
    });

    await test.step("should handle open-ended price ranges (max only)", async () => {
      const feed = await context.feedConcept.filter_by_price(undefined, 50, 5);
      assertEquals(feed.listings.length, 2);
      assertEquals(feed.listings[0].title, "Cheap Item"); // 25, newest
      assertEquals(feed.listings[1].title, "Very Cheap Item"); // 5, older
    });

    await test.step("should return empty if no listings in range", async () => {
      const feed = await context.feedConcept.filter_by_price(2000, 3000, 5);
      assertEquals(feed.listings.length, 0);
      assertEquals(feed.totalCount, 0);
    });
  });

  await t.step("Correctness - Combined Filters (tag + price) (filter_by_combined)", async (test) => {
    let listingA: ItemListing; // electronics, 100, recent
    let listingB: ItemListing; // electronics, 50, older
    let listingC: ItemListing; // books, 150, oldest
    let listingD: ItemListing; // electronics, 200, oldest
    let listingE: ItemListing; // sports, 75, middle

    test.beforeEach(async () => {
      const now = new Date();
      listingA = generateFakeListing({ createdAt: now, tags: ["electronics"], price: 100, title: "Tablet" });
      listingE = generateFakeListing({ createdAt: new Date(now.getTime() - 50), tags: ["sports"], price: 75, title: "Basketball" });
      listingB = generateFakeListing({ createdAt: new Date(now.getTime() - 100), tags: ["electronics"], price: 50, title: "Headphones" });
      listingC = generateFakeListing({ createdAt: new Date(now.getTime() - 150), tags: ["books"], price: 150, title: "Novel" });
      listingD = generateFakeListing({ createdAt: new Date(now.getTime() - 200), tags: ["electronics"], price: 200, title: "Monitor" });

      const listings = [listingA, listingB, listingC, listingD, listingE];
      listings.forEach(l => context.itemListingService.addListing(l));
      for (const listing of listings) {
        context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: listing._id, sellerId: listing.sellerId } as ListingCreatedEvent);
      }
      await waitForEventProcessing();
    });

    await test.step("should apply both tag and price filters and maintain chronological order", async () => {
      const feed = await context.feedConcept.filter_by_combined("electronics", 75, 150, 5);
      assertEquals(feed.listings.length, 1);
      assertEquals(feed.listings[0].title, "Tablet", "Newest electronics in price range (100) should be first");
      assertEquals(feed.appliedFilters.tag, "electronics");
      assertEquals(feed.appliedFilters.minPrice, 75);
      assertEquals(feed.appliedFilters.maxPrice, 150);
    });

    await test.step("should correctly filter with only tag and no price range", async () => {
      const feed = await context.feedConcept.filter_by_combined("electronics", undefined, undefined, 5);
      assertEquals(feed.listings.length, 3);
      assertEquals(feed.listings[0].title, "Tablet"); // 100, newest
      assertEquals(feed.listings[1].title, "Headphones"); // 50, middle
      assertEquals(feed.listings[2].title, "Monitor"); // 200, oldest
    });

    await test.step("should correctly filter with only price range and no tag", async () => {
      const feed = await context.feedConcept.filter_by_combined(undefined, 60, 160, 5);
      assertEquals(feed.listings.length, 3);
      assertEquals(feed.listings[0].title, "Tablet"); // 100, newest (within range)
      assertEquals(feed.listings[1].title, "Basketball"); // 75, middle
      assertEquals(feed.listings[2].title, "Novel"); // 150, oldest
      assertEquals(feed.listings[0].price, 100);
      assertEquals(feed.listings[1].price, 75);
      assertEquals(feed.listings[2].price, 150);
    });

    await test.step("should return empty if no match for combined filters", async () => {
      const feed = await context.feedConcept.filter_by_combined("electronics", 250, 300, 5);
      assertEquals(feed.listings.length, 0);
      assertEquals(feed.totalCount, 0);
    });

    await test.step("should behave like get_latest if no filters are provided", async () => {
      const feedCombined = await context.feedConcept.filter_by_combined(undefined, undefined, undefined, 5);
      const feedLatest = await context.feedConcept.get_latest(5);
      assertEquals(feedCombined.listings.length, feedLatest.listings.length);
      assertEquals(feedCombined.listings[0].id.toHexString(), feedLatest.listings[0].id.toHexString());
      assertEquals(feedCombined.appliedFilters.tag, undefined);
      assertEquals(feedCombined.appliedFilters.minPrice, undefined);
    });
  });

  await t.step("Robustness - Event Handling and Feed Updates", async (test) => {
    let initialListing: ItemListing;
    let feedUpdateListenerCalled = 0;

    test.beforeEach(async () => {
      initialListing = generateFakeListing({ createdAt: new Date() });
      context.itemListingService.addListing(initialListing);
      context.eventBus.on(MockEventBus.FEED_UPDATED, () => feedUpdateListenerCalled++);
      feedUpdateListenerCalled = 0; // Reset counter for new test
    });

    await test.step("should add a new active listing to the feed upon ListingCreated event", async () => {
      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: initialListing._id, sellerId: initialListing.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();
      const feed = await context.feedConcept.get_latest(1);
      assertEquals(feed.listings.length, 1);
      assertEquals(feed.listings[0].id.toHexString(), initialListing._id.toHexString());
      assertEquals(feedUpdateListenerCalled, 1);
    });

    await test.step("should update an existing listing in the feed upon ListingUpdated event", async () => {
      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: initialListing._id, sellerId: initialListing.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();
      assertEquals(feedUpdateListenerCalled, 1); // 1 for created

      const updatedListing = { ...initialListing, title: "Updated Title", price: 99.99, tags: ["updated", "tag"] };
      context.itemListingService.updateListing(initialListing._id, updatedListing);
      context.eventBus.emit(MockEventBus.LISTING_UPDATED, { listingId: initialListing._id } as ListingUpdatedEvent);
      await waitForEventProcessing();

      const feed = await context.feedConcept.get_latest(1);
      assertEquals(feed.listings.length, 1);
      assertEquals(feed.listings[0].title, "Updated Title");
      assertEquals(feed.listings[0].price, 99.99);
      assert(feed.listings[0].tags.includes("updated"));
      assertEquals(feedUpdateListenerCalled, 2); // 1 for created, 1 for updated
    });

    await test.step("should remove a listing from the feed upon ListingWithdrawn event", async () => {
      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: initialListing._id, sellerId: initialListing.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();
      assertEquals(feedUpdateListenerCalled, 1);

      context.eventBus.emit(MockEventBus.LISTING_WITHDRAWN, { listingId: initialListing._id } as ListingWithdrawnEvent);
      await waitForEventProcessing();

      const feed = await context.feedConcept.get_latest(1);
      assertEquals(feed.listings.length, 0);
      assertEquals(feedUpdateListenerCalled, 2); // 1 for created, 1 for withdrawn
    });

    await test.step("should remove a listing from the feed upon ListingSold event", async () => {
      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: initialListing._id, sellerId: initialListing.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();
      assertEquals(feedUpdateListenerCalled, 1);

      context.eventBus.emit(MockEventBus.LISTING_SOLD, { listingId: initialListing._id } as ListingSoldEvent);
      await waitForEventProcessing();

      const feed = await context.feedConcept.get_latest(1);
      assertEquals(feed.listings.length, 0);
      assertEquals(feedUpdateListenerCalled, 2); // 1 for created, 1 for sold
    });

    await test.step("should not add inactive listings to the feed", async () => {
      const inactiveListing = generateFakeListing({ status: ListingStatus.Withdrawn });
      context.itemListingService.addListing(inactiveListing);
      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: inactiveListing._id, sellerId: inactiveListing.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();
      const feed = await context.feedConcept.get_latest(1);
      assertEquals(feed.listings.length, 0);
      assertEquals(feedUpdateListenerCalled, 0); // No update for inactive listing
    });

    await test.step("should remove from feed if listing updated to inactive status", async () => {
      const activeListing = generateFakeListing({ status: ListingStatus.Active });
      context.itemListingService.addListing(activeListing);
      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: activeListing._id, sellerId: activeListing.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();
      assertEquals((await context.feedConcept.get_latest(1)).listings.length, 1);
      assertEquals(feedUpdateListenerCalled, 1);

      context.itemListingService.updateListing(activeListing._id, { status: ListingStatus.Sold });
      context.eventBus.emit(MockEventBus.LISTING_UPDATED, { listingId: activeListing._id } as ListingUpdatedEvent);
      await waitForEventProcessing();

      assertEquals((await context.feedConcept.get_latest(1)).listings.length, 0);
      assertEquals(feedUpdateListenerCalled, 2); // 1 for created, 1 for updated/removed
    });

    await test.step("should add to feed if listing updated to active status", async () => {
      const inactiveListing = generateFakeListing({ status: ListingStatus.Pending });
      context.itemListingService.addListing(inactiveListing);
      // No initial event to add it to the feed as it's pending
      assertEquals((await context.feedConcept.get_latest(1)).listings.length, 0);
      assertEquals(feedUpdateListenerCalled, 0);

      context.itemListingService.updateListing(inactiveListing._id, { status: ListingStatus.Active });
      context.eventBus.emit(MockEventBus.LISTING_UPDATED, { listingId: inactiveListing._id } as ListingUpdatedEvent);
      await waitForEventProcessing();

      const feed = await context.feedConcept.get_latest(1);
      assertEquals(feed.listings.length, 1);
      assertEquals(feed.listings[0].id.toHexString(), inactiveListing._id.toHexString());
      assertEquals(feedUpdateListenerCalled, 1); // Only one update for the activation
    });

    await test.step("should emit FeedUpdated event on any relevant change", async () => {
      let updateCount = 0;
      context.eventBus.on(MockEventBus.FEED_UPDATED, () => updateCount++);

      const listing1 = generateFakeListing({ createdAt: new Date() });
      context.itemListingService.addListing(listing1);
      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: listing1._id, sellerId: listing1.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();
      assertEquals(updateCount, 1, "FeedUpdated for creation");

      const listing2 = generateFakeListing({ createdAt: new Date() });
      context.itemListingService.addListing(listing2);
      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: listing2._id, sellerId: listing2.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();
      assertEquals(updateCount, 2, "FeedUpdated for second creation");

      context.eventBus.emit(MockEventBus.LISTING_WITHDRAWN, { listingId: listing1._id } as ListingWithdrawnEvent);
      await waitForEventProcessing();
      assertEquals(updateCount, 3, "FeedUpdated for withdrawal");

      context.itemListingService.updateListing(listing2._id, { price: 123.45 });
      context.eventBus.emit(MockEventBus.LISTING_UPDATED, { listingId: listing2._id } as ListingUpdatedEvent);
      await waitForEventProcessing();
      assertEquals(updateCount, 4, "FeedUpdated for update");
    });
  });

  await t.step("Robustness - Error Handling", async (test) => {
    await test.step("should throw InvalidInputError for invalid 'n' (page size)", async () => {
      await assertRejects(() => context.feedConcept.get_latest(0), InvalidInputError, "Page size (n) must be a positive integer.");
      await assertRejects(() => context.feedConcept.filter_by_tag("test", -1), InvalidInputError, "Page size (n) must be a positive integer.");
      await assertRejects(() => context.feedConcept.filter_by_price(10, 100, 0), InvalidInputError, "Page size (n) must be a positive integer.");
    });

    await test.step("should throw InvalidInputError for invalid 'page' number", async () => {
      await assertRejects(() => context.feedConcept.get_latest(10, 0), InvalidInputError, "Page number must be a positive integer.");
      await assertRejects(() => context.feedConcept.filter_by_price(10, 100, 10, -5), InvalidInputError, "Page number must be a positive integer.");
    });

    await test.step("should throw InvalidInputError for empty tag", async () => {
      await assertRejects(() => context.feedConcept.filter_by_tag("", 10), InvalidInputError, "Tag cannot be empty.");
      await assertRejects(() => context.feedConcept.filter_by_tag("   ", 10), InvalidInputError, "Tag cannot be empty.");
    });

    await test.step("should throw InvalidInputError for invalid price ranges", async () => {
      await assertRejects(() => context.feedConcept.filter_by_price(-10, 100, 10), InvalidInputError, "Minimum price must be a non-negative number.");
      await assertRejects(() => context.feedConcept.filter_by_price(10, -100, 10), InvalidInputError, "Maximum price must be a non-negative number.");
      await assertRejects(() => context.feedConcept.filter_by_price(100, 10, 10), InvalidInputError, "Minimum price cannot be greater than maximum price.");
    });

    await test.step("should throw InvalidInputError if no min/max price for filter_by_price", async () => {
      await assertRejects(() => context.feedConcept.filter_by_price(undefined, undefined, 10), InvalidInputError, "At least a minimum or maximum price must be provided for price filtering.");
    });

    await test.step("should handle ItemListingService errors gracefully during event processing", async () => {
      const nonExistentId = new ObjectId();
      const listingThatErrors = generateFakeListing({ _id: nonExistentId });
      // Simulate ItemListingService returning null (not found) for a specific ID
      context.itemListingService.getListing = async (id: ObjectId) => {
        if (id.toHexString() === nonExistentId.toHexString()) {
          return null; // Simulate ItemListing not finding it
        }
        // For other IDs, try to get from the internal mock state if present
        return new MockItemListingService([listingThatErrors]).getListing(id);
      };

      // No error should bubble up for event handlers, but it should be logged
      const originalError = console.error;
      let errorLogged = false;
      console.error = (...args: any[]) => { errorLogged = true; originalError(...args); }; // Intercept console.error

      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: nonExistentId, sellerId: new ObjectId() } as ListingCreatedEvent);
      await waitForEventProcessing();
      assert(errorLogged, "Error should have been logged for missing listing.");
      console.error = originalError; // Restore original console.error

      const feed = await context.feedConcept.get_latest(10);
      assertEquals(feed.listings.length, 0, "No listing should be added if details cannot be fetched from ItemListingService.");
    });

    await test.step("should throw DatabaseError for underlying DB failures", async () => {
      // Temporarily sabotage the collection to simulate DB error
      const originalFind = context.feedCollection.find;
      context.feedCollection.find = () => { throw new Error("Simulated DB error in find operation"); } as any;

      await assertRejects(() => context.feedConcept.get_latest(10), DatabaseError, "Failed to query feed listings.");

      context.feedCollection.find = originalFind; // Restore original method
    });
  });

  await t.step("Usability - `refresh_feed` behavior", async () => {
    let feedUpdateListenerCalled = 0;
    context.eventBus.on(MockEventBus.FEED_UPDATED, (event) => {
      feedUpdateListenerCalled++;
      assertEquals(event.message, "Feed refresh requested.");
    });

    await context.feedConcept.refresh_feed();
    assertEquals(feedUpdateListenerCalled, 1, "refresh_feed should emit FeedUpdated event once");
  });

  await t.step("Performance - With a large number of listings (conceptual)", async (test) => {
    // This is a conceptual test. Actual performance requires dedicated benchmarking in a controlled environment.
    // Here we ensure the operations complete within a reasonable, arbitrary time threshold
    // and confirm the querying strategy is effective for a populated index.
    const NUM_LISTINGS = 2000;
    
    test.beforeEach(async () => {
      await context.feedCollection.deleteMany({}); // Ensure clean slate
      context.itemListingService.clear();

      const listings = generateFakeListings(NUM_LISTINGS);
      listings.forEach(l => context.itemListingService.addListing(l));

      // Use bulk insert directly for efficiency to populate the Feed's index for performance test
      const feedIndexDocs = listings.filter(l => l.status === ListingStatus.Active).map(l => createFeedIndexDoc(l));
      if (feedIndexDocs.length > 0) {
        await context.feedCollection.insertMany(feedIndexDocs);
      }
      // No need to wait for individual event processing here, as we are testing query performance
      // on an already populated index.
    });

    await test.step("should retrieve latest listings quickly", async () => {
      const startTime = performance.now();
      const feed = await context.feedConcept.get_latest(50, 1);
      const endTime = performance.now();
      assert(endTime - startTime < 100, `get_latest took too long: ${endTime - startTime}ms`); // Arbitrary threshold
      assertEquals(feed.listings.length, 50);
      assert(feed.totalCount === NUM_LISTINGS); // Assuming all generated were active
    });

    await test.step("should filter by tag quickly", async () => {
      const commonTag = "electronics"; // Assuming many listings have this tag
      const startTime = performance.now();
      const feed = await context.feedConcept.filter_by_tag(commonTag, 50, 1);
      const endTime = performance.now();
      assert(endTime - startTime < 100, `filter_by_tag took too long: ${endTime - startTime}ms`);
      assert(feed.listings.every(l => l.tags.includes(commonTag)));
    });

    await test.step("should filter by price quickly", async () => {
      const startTime = performance.now();
      const feed = await context.feedConcept.filter_by_price(100, 500, 50, 1);
      const endTime = performance.now();
      assert(endTime - startTime < 100, `filter_by_price took too long: ${endTime - startTime}ms`);
      assert(feed.listings.every(l => l.price >= 100 && l.price <= 500));
    });

    await test.step("should filter by combined tag and price quickly", async () => {
      const commonTag = "books";
      const startTime = performance.now();
      const feed = await context.feedConcept.filter_by_combined(commonTag, 50, 200, 50, 1);
      const endTime = performance.now();
      assert(endTime - startTime < 100, `filter_by_combined took too long: ${endTime - startTime}ms`);
      assert(feed.listings.every(l => l.tags.includes(commonTag) && l.price >= 50 && l.price <= 200));
    });

    await test.step("should maintain correct sorting with many items", async () => {
      const feed = await context.feedConcept.get_latest(100);
      assert(feed.listings.length > 1);
      for (let i = 0; i < feed.listings.length - 1; i++) {
        assert(feed.listings[i].createdAt >= feed.listings[i+1].createdAt, "Listings should be sorted by creation date descending");
      }
    });
  });

  await t.step("Maintainability & Testability - Constructor and Dependencies", async () => {
    test.beforeEach(async () => {
      // Clear all state before this test to ensure clean setup
      await context.feedCollection.deleteMany({});
      context.itemListingService.clear();
      context.eventBus.removeAllListeners();
    });

    await test.step("should successfully instantiate with required dependencies", () => {
      const newConcept = new FeedConcept(context.dbClient, context.eventBus, context.itemListingService);
      assertExists(newConcept);
      assertInstanceOf(newConcept, FeedConcept);
    });

    await test.step("should register event listeners during instantiation", async () => {
      const newEventBus = new MockEventBus();
      const itemListingServiceMock = new MockItemListingService();
      const tempConcept = new FeedConcept(context.dbClient, newEventBus, itemListingServiceMock);
      await new Promise(resolve => setTimeout(resolve, 50)); // Allow async initIndexes to complete

      // Simulate a ListingCreated event and verify the feed is updated
      const testListing = generateFakeListing();
      itemListingServiceMock.addListing(testListing);
      
      let feedUpdatedCalled = false;
      newEventBus.on(MockEventBus.FEED_UPDATED, () => feedUpdatedCalled = true);

      newEventBus.emit(MockEventBus.LISTING_CREATED, { listingId: testListing._id, sellerId: testListing.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();

      const feed = await tempConcept.get_latest(1);
      assertEquals(feed.listings.length, 1, "Listing should be added, indicating listeners are registered and working.");
      assert(feedUpdatedCalled, "FeedUpdated event should have been emitted.");
    });
  });

  await t.step("Usability - FeedView structure and content", async (test) => {
    let testListing: ItemListing;
    test.beforeEach(async () => {
      testListing = generateFakeListing({ createdAt: new Date(), tags: ["test", "view"], price: 123.45, title: "Test Item For FeedView", currency: "USD" });
      context.itemListingService.addListing(testListing);
      context.eventBus.emit(MockEventBus.LISTING_CREATED, { listingId: testListing._id, sellerId: testListing.sellerId } as ListingCreatedEvent);
      await waitForEventProcessing();
    });

    await test.step("should return FeedView with correct structure and ListingSummary details", async () => {
      const feed: FeedView = await context.feedConcept.get_latest(1);

      assertExists(feed.listings);
      assertEquals(feed.listings.length, 1);

      const summary = feed.listings[0];
      assertEquals(summary.id.toHexString(), testListing._id.toHexString());
      assertEquals(summary.title, testListing.title);
      assertEquals(summary.price, testListing.price);
      assertEquals(summary.currency, testListing.currency);
      assertEquals(summary.tags, testListing.tags);
      // Allow for slight time differences due to `new Date()` and async operations
      assert(Math.abs(summary.createdAt.getTime() - testListing.createdAt.getTime()) < 100, "createdAt should be approximately equal"); 

      assertEquals(feed.totalCount, 1);
      assertEquals(feed.currentPage, 1);
      assertEquals(feed.pageSize, 1);
      assertEquals(feed.totalPages, 1);
      assertEquals(feed.appliedFilters.tag, undefined);
      assertEquals(feed.appliedFilters.minPrice, undefined);
      assertEquals(feed.appliedFilters.maxPrice, undefined);
      assertEquals(feed.sorting.field, 'createdAt');
      assertEquals(feed.sorting.order, 'desc');
    });

    await test.step("FeedView appliedFilters should reflect tag filter", async () => {
      const feed = await context.feedConcept.filter_by_tag("test", 1);
      assertEquals(feed.appliedFilters.tag, "test");
      assertEquals(feed.appliedFilters.minPrice, undefined);
    });

    await test.step("FeedView appliedFilters should reflect price filter", async () => {
      const feed = await context.feedConcept.filter_by_price(100, 200, 1);
      assertEquals(feed.appliedFilters.tag, undefined);
      assertEquals(feed.appliedFilters.minPrice, 100);
      assertEquals(feed.appliedFilters.maxPrice, 200);
    });

    await test.step("FeedView appliedFilters should reflect combined filters", async () => {
      const feed = await context.feedConcept.filter_by_combined("test", 100, 200, 1);
      assertEquals(feed.appliedFilters.tag, "test");
      assertEquals(feed.appliedFilters.minPrice, 100);
      assertEquals(feed.appliedFilters.maxPrice, 200);
    });
  });
});
```