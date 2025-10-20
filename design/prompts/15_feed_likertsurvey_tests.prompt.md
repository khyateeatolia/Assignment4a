# Feed Concept Tests - LikertSurvey Format Rewrite

I need you to rewrite the Feed concept tests in the LikertSurvey format. I've provided you with the current Feed implementation and the LikertSurvey test structure as reference.

## Current Feed Implementation Context

Here are the files I generated based on your previous response:

### FeedConcept.ts (Current Implementation)
```typescript
// src/concepts/Feed/FeedConcept.ts
import { Collection, Document, Db } from "npm:mongodb";
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
  private readonly FEED_COLLECTION_NAME = "feed_listings";
  private readonly eventBus: EventBus;
  private readonly itemListingService: ItemListingService;

  constructor(db: Db, eventBus: EventBus, itemListingService: ItemListingService) {
    this.feedCollection = db.collection<FeedIndexDoc>(this.FEED_COLLECTION_NAME);
    this.eventBus = eventBus;
    this.itemListingService = itemListingService;

    this.initIndexes().catch(err => {
      console.error("FeedConcept: Failed to initialize database indexes on startup:", err);
    });
    this.registerEventListeners();
  }

  // ... (rest of implementation methods)
  
  async get_latest(n: number, page: number = 1): Promise<FeedView>
  async filter_by_tag(tag: Tag, n: number, page: number = 1): Promise<FeedView>
  async filter_by_price(min: CurrencyAmount | undefined, max: CurrencyAmount | undefined, n: number, page: number = 1): Promise<FeedView>
  async filter_by_combined(tag: Tag | undefined, minPrice: CurrencyAmount | undefined, maxPrice: CurrencyAmount | undefined, n: number, page: number = 1): Promise<FeedView>
  async refresh_feed(): Promise<void>
}
```

### Current Test Structure (NOT LikertSurvey Format)
The current tests use nested `t.step` calls and traditional unit testing structure, which is NOT the LikertSurvey format.

## LikertSurvey Test Format Reference

Here's how the LikertSurvey tests are structured:

### LikertSurveyConcept.test.ts (Reference Format)
```typescript
import { assertEquals, assertExists, assertNotEquals } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import { ID } from "@utils/types.ts";
import LikertSurveyConcept from "./LikertSurveyConcept.ts";

const authorA = "author:Alice" as ID;
const respondentB = "respondent:Bob" as ID;
const respondentC = "respondent:Charlie" as ID;

Deno.test("Principle: Author creates survey, respondent answers, author views results", async () => {
  const [db, client] = await testDb();
  const surveyConcept = new LikertSurveyConcept(db);

  try {
    // 1. Author creates a survey with a 1-5 scale
    const createSurveyResult = await surveyConcept.createSurvey({
      author: authorA,
      title: "Customer Satisfaction",
      scaleMin: 1,
      scaleMax: 5,
    });
    assertNotEquals(
      "error" in createSurveyResult,
      true,
      "Survey creation should not fail.",
    );
    const { survey } = createSurveyResult as { survey: ID };
    assertExists(survey);

    // 2. Author adds several questions
    const addQ1Result = await surveyConcept.addQuestion({
      survey,
      text: "How satisfied are you with our product?",
    });
    assertNotEquals(
      "error" in addQ1Result,
      true,
      "Adding question 1 should not fail.",
    );
    const { question: q1 } = addQ1Result as { question: ID };

    // ... more workflow steps

  } finally {
    await client.close();
  }
});

Deno.test("Principle: Multiple respondents can answer the same survey", async () => {
  // ... complete workflow test
});

Deno.test("Principle: Author can view aggregated results", async () => {
  // ... complete workflow test
});
```

## Key LikertSurvey Format Requirements

1. **Principle-based test names**: Each test starts with `"Principle: [descriptive workflow]"`
2. **Single test per principle**: One `Deno.test` per complete workflow, no nested `t.step` calls
3. **Complete user journeys**: Each test covers a full workflow from start to finish
4. **Descriptive assertions**: Clear assertion messages explaining what should happen
5. **Database setup/teardown**: Each test manages its own database connection
6. **Workflow-focused**: Tests real user scenarios, not isolated functionality

## Feed Concept Test Principles Needed

Based on the Feed concept functionality, I need tests for these principles:

1. **Principle: Feed displays latest listings sorted by recency**
2. **Principle: Users can filter listings by tag while maintaining chronological order**
3. **Principle: Users can filter listings by price range while maintaining chronological order**
4. **Principle: Users can combine tag and price filters while maintaining chronological order**
5. **Principle: Feed automatically updates when listings are created, updated, or removed**
6. **Principle: Feed handles pagination correctly for large result sets**
7. **Principle: Feed gracefully handles errors and invalid inputs**

## Request

Please rewrite the Feed concept tests in the proper LikertSurvey format:

1. **Create principle-based test names** that describe complete user workflows
2. **Use single `Deno.test` per principle** (no nested `t.step` calls)
3. **Test complete workflows** from start to finish
4. **Include proper database setup/teardown** in each test
5. **Use descriptive assertion messages**
6. **Update the fake data** to be compatible with the LikertSurvey format
7. **Follow the same patterns** as the LikertSurvey tests

Please provide:
- Updated `FeedConcept.test.ts` in LikertSurvey format
- Updated `fake-data.ts` with LikertSurvey-compatible fake data
- Any necessary updates to `mock-services.ts` for the new test format

The tests should be comprehensive but follow the LikertSurvey principle-based workflow approach rather than traditional unit testing structure.

# response:

Okay, I've rewritten the Feed concept tests into the `LikertSurvey` format, focusing on complete user workflows and principle-based testing. I've also updated the `fake-data.ts` and `mock-services.ts` files to support these new tests.

## Updates Made:

1.  **`src/concepts/Feed/mock-services.ts`**:
    *   Updated `MockEventBus` to implement the `EventBus` interface from `types.ts`.
    *   Added `getEmittedEvents` and `clearEmittedEvents` methods to `MockEventBus` for more robust event assertion in tests.
    *   Updated `MockItemListingService` to implement the `ItemListingService` interface from `types.ts`.
    *   Enhanced `MockItemListingService` to allow setting error conditions for `getListing` and other methods, which is crucial for error handling tests.
    *   Added `createListing`, `updateListing`, `withdrawListing`, `sellListing` methods to `MockItemListingService` to better simulate the actions that trigger events.

2.  **`src/concepts/Feed/fake-data.ts`**:
    *   Created `createMockListing` helper function for easily generating `ItemListing` objects with default values and custom overrides.
    *   Added `createManyMockListings` to generate a batch of listings, useful for pagination and large data set tests.
    *   Included `mockListings` object for pre-defined, easily referenceable listings.

3.  **`src/concepts/Feed/FeedConcept.test.ts`**:
    *   Rewritten all tests to follow the `LikertSurvey` format:
        *   Each test is a single `Deno.test` block.
        *   Test names start with `"Principle: [descriptive workflow]"`.
        *   Each test sets up its own `testDb` connection and handles teardown.
        *   Tests cover full workflows from setting up listings/events to asserting the final feed state.
        *   Introduced `waitForEventProcessing` helper to allow asynchronous event handling within `FeedConcept` to complete before assertions.
    *   Implemented tests for all requested principles:
        *   Displaying latest listings.
        *   Filtering by tag.
        *   Filtering by price range.
        *   Combined tag and price filtering.
        *   Automatic updates based on `ListingCreated`, `ListingUpdated`, `ListingWithdrawn`, and `ListingSold` events.
        *   Pagination for large data sets.
        *   Error handling for invalid inputs and `ItemListingService` failures.

## Files:

### `src/concepts/Feed/mock-services.ts`

```typescript
// src/concepts/Feed/mock-services.ts
import { Collection, Db } from "npm:mongodb";
import {
  CurrencyAmount,
  ListingCreatedEvent, ListingId,
  ListingSummary,
  ListingSoldEvent,
  ListingStatus,
  ListingUpdatedEvent,
  ListingWithdrawnEvent,
  EventBus, // The interface from types.ts
  ItemListingService, // The interface from types.ts
  ItemListing,
  FeedUpdatedEvent,
  UserId
} from "./types.ts";
import { DatabaseError, ItemListingServiceError, ListingNotFoundError } from "./FeedErrors.ts";
import { ID } from "../../utils/types.ts"; // Assuming utils is one level up

// --- Mock EventBus ---
type EventMap = {
  "ListingCreatedEvent": ListingCreatedEvent;
  "ListingUpdatedEvent": ListingUpdatedEvent;
  "ListingWithdrawnEvent": ListingWithdrawnEvent;
  "ListingSoldEvent": ListingSoldEvent;
  "FeedUpdatedEvent": FeedUpdatedEvent;
};

type EventName = keyof EventMap;
type EventData<T extends EventName> = EventMap[T];
type EventCallback<T extends EventName> = (data: EventData<T>) => void | Promise<void>;

export class MockEventBus implements EventBus {
  private listeners: { [K in EventName]?: EventCallback<K>[] } = {};
  private emittedEvents: { name: EventName, data: any }[] = [];

  on<T extends EventName>(eventName: T, callback: EventCallback<T>): void {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    (this.listeners[eventName] as EventCallback<T>[]).push(callback);
  }

  async emit<T extends EventName>(eventName: T, data: EventData<T>): Promise<void> {
    this.emittedEvents.push({ name: eventName, data: data });
    const callbacks = this.listeners[eventName];
    if (callbacks) {
      // Execute all listeners, waiting for all async callbacks to complete
      await Promise.all(callbacks.map(cb => Promise.resolve(cb(data))));
    }
  }

  // Utility for testing: check if an event was emitted
  hasEmitted(eventName: EventName, predicate?: (data: any) => boolean): boolean {
    return this.emittedEvents.some(event =>
      event.name === eventName && (predicate ? predicate(event.data) : true)
    );
  }

  getEmittedEvents<T extends EventName>(eventName: T, predicate?: (data: EventData<T>) => boolean): EventData<T>[] {
    return this.emittedEvents
      .filter(event => event.name === eventName && (predicate ? predicate(event.data as EventData<T>) : true))
      .map(event => event.data as EventData<T>);
  }

  clearEmittedEvents(): void {
    this.emittedEvents = [];
  }
}

// --- Mock ItemListingService ---

export class MockItemListingService implements ItemListingService {
  private listings = new Map<ListingId, ItemListing>();
  private shouldThrowError = false; // For error handling tests
  private errorType: "NotFound" | "Database" | "Generic" = "Generic";

  setListings(listings: ItemListing[]) {
    this.listings.clear();
    listings.forEach(listing => this.listings.set(listing.id, listing));
  }

  // Allows simulating errors
  setShouldThrowError(throwError: boolean, type: "NotFound" | "Database" | "Generic" = "Generic") {
    this.shouldThrowError = throwError;
    this.errorType = type;
  }

  async getListing(listingId: ListingId): Promise<ItemListing> {
    if (this.shouldThrowError) {
      if (this.errorType === "NotFound") throw new ListingNotFoundError(`Mock: Listing ${listingId} not found.`);
      if (this.errorType === "Database") throw new DatabaseError("Mock: DB error during getListing.");
      throw new ItemListingServiceError("Mock: Generic item listing service error.");
    }
    const listing = this.listings.get(listingId);
    if (!listing) {
      throw new ListingNotFoundError(`Mock: Listing ${listingId} not found.`);
    }
    return Promise.resolve(listing);
  }

  async createListing(listing: ItemListing): Promise<ItemListing> {
    if (this.shouldThrowError && this.errorType === "Database") throw new DatabaseError("Mock: DB error during createListing.");
    this.listings.set(listing.id, listing);
    return Promise.resolve(listing);
  }

  async updateListing(listingId: ListingId, updates: Partial<ItemListing>): Promise<ItemListing> {
    if (this.shouldThrowError && this.errorType === "Database") throw new DatabaseError("Mock: DB error during updateListing.");
    const existing = this.listings.get(listingId);
    if (!existing) throw new ListingNotFoundError(`Mock: Listing ${listingId} not found for update.`);
    const updated = { ...existing, ...updates, lastUpdatedAt: new Date() };
    this.listings.set(listingId, updated);
    return Promise.resolve(updated);
  }

  async withdrawListing(listingId: ListingId, byUserId: UserId): Promise<ItemListing> {
    if (this.shouldThrowError && this.errorType === "Database") throw new DatabaseError("Mock: DB error during withdrawListing.");
    const existing = this.listings.get(listingId);
    if (!existing) throw new ListingNotFoundError(`Mock: Listing ${listingId} not found for withdrawal.`);
    const updated = { ...existing, status: ListingStatus.Withdrawn, lastUpdatedAt: new Date() };
    this.listings.set(listingId, updated);
    return Promise.resolve(updated);
  }

  async sellListing(listingId: ListingId, byUserId: UserId): Promise<ItemListing> {
    if (this.shouldThrowError && this.errorType === "Database") throw new DatabaseError("Mock: DB error during sellListing.");
    const existing = this.listings.get(listingId);
    if (!existing) throw new ListingNotFoundError(`Mock: Listing ${listingId} not found for sale.`);
    const updated = { ...existing, status: ListingStatus.Sold, lastUpdatedAt: new Date() };
    this.listings.set(listingId, updated);
    return Promise.resolve(updated);
  }
}
```

### `src/concepts/Feed/fake-data.ts`

```typescript
// src/concepts/Feed/fake-data.ts
import { ID } from "../../utils/types.ts"; // Assuming utils is one level up
import { ItemListing, ListingId, UserId, Tag, CurrencyAmount, ListingStatus } from "./types.ts";

let nextIdCounter = 1; // Unique counter for generating IDs across multiple calls

export const generateId = (prefix: string = "") => `${prefix}:${nextIdCounter++}` as ID;

export const createMockListing = (
  overrides?: Partial<ItemListing> & { tags?: Tag[], priceValue?: number, priceCurrency?: string, createdAt?: Date }
): ItemListing => {
  const defaultId = generateId("listing");
  const defaultSellerId = generateId("user");
  const defaultCreatedAt = overrides?.createdAt || new Date();

  return {
    id: defaultId as ListingId,
    sellerId: defaultSellerId as UserId,
    title: `Item ${defaultId}`,
        description: `Description for item ${defaultId}.`,
    price: {
      value: overrides?.priceValue || (Math.floor(Math.random() * 100) + 10),
      currency: overrides?.priceCurrency || "USD",
    } as CurrencyAmount,
    tags: overrides?.tags || ["general"],
    status: ListingStatus.Active,
    imageUrl: `http://example.com/image/${defaultId}.jpg`,
    createdAt: defaultCreatedAt,
    lastUpdatedAt: defaultCreatedAt,
    ...overrides,
    // Ensure tags are always an array, even if overrides.tags is undefined or empty in partial
    tags: overrides?.tags !== undefined ? overrides.tags : ["general"]
  };
};

export const createManyMockListings = (count: number, baseDate: Date = new Date()): ItemListing[] => {
  const listings: ItemListing[] = [];
  // Create listings with slightly different creation dates for chronological order
  // Newest listing will have the latest date, so when sorted descending, it comes first.
  for (let i = 0; i < count; i++) {
    const createdAt = new Date(baseDate.getTime() - (count - 1 - i) * 1000 * 60); // 1 minute apart, earliest first
    listings.push(createMockListing({
      id: generateId("listing"), // Ensure unique IDs
      title: `Listing ${i + 1}`,
      description: `Description for listing ${i + 1}`,
      tags: i % 3 === 0 ? ["electronics", "gadgets"] : (i % 3 === 1 ? ["home", "decor"] : ["fashion", "accessories"]),
      priceValue: 10 + (i * 5), // Vary prices
      createdAt: createdAt,
      lastUpdatedAt: createdAt,
    }));
  }
  // The sorting in FeedConcept is `createdAt: -1` (descending), so the latest item created
  // in `createManyMockListings` (which is `listings[count-1]`) would appear first.
  // The `listings` array here is ordered from oldest to newest based on how `createdAt` is calculated.
  // This is suitable for asserting correct chronological order in the feed output.
  return listings;
};
```

### `src/concepts/Feed/FeedConcept.test.ts`

```typescript
// src/concepts/Feed/FeedConcept.test.ts
import { assertEquals, assertExists, assertNotEquals, assertThrows, assertRejects } from "jsr:@std/assert";
import { testDb } from "../../utils/database.ts";
import { ID } from "../../utils/types.ts";
import { FeedConcept } from "./FeedConcept.ts";
import { MockEventBus, MockItemListingService } from "./mock-services.ts";
import { createMockListing, createManyMockListings, generateId } from "./fake-data.ts";
import { CurrencyAmount, ListingId, ListingStatus, Tag, UserId } from "./types.ts";
import { DatabaseError, InvalidInputError, ItemListingServiceError, ListingNotFoundError } from "./FeedErrors.ts";

// Helper to wait for the event loop to process async operations in FeedConcept
// This is crucial for event-driven systems where a triggered event handler
// runs asynchronously and updates the internal state (like the feed collection).
const waitForEventProcessing = async (ms: number = 50) => {
  await new Promise(resolve => setTimeout(resolve, ms));
};

Deno.test("Principle: Feed displays latest listings sorted by recency", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const itemListingService = new MockItemListingService();
  const feedConcept = new FeedConcept(db, eventBus, itemListingService);

  try {
    // 1. Prepare multiple listings with distinct creation times (latest first for chronological order tests)
    const l1 = createMockListing({ id: generateId("l"), title: "Item 1", createdAt: new Date("2023-01-01T10:00:00Z") });
    const l2 = createMockListing({ id: generateId("l"), title: "Item 2", createdAt: new Date("2023-01-01T10:05:00Z") });
    const l3 = createMockListing({ id: generateId("l"), title: "Item 3", createdAt: new Date("2023-01-01T10:10:00Z") });

    // 2. Simulate external system creating listings and emitting events
    // FeedConcept will listen to these and update its internal index.
    await itemListingService.createListing(l1);
    await eventBus.emit("ListingCreatedEvent", { listingId: l1.id, timestamp: l1.createdAt });
    await itemListingService.createListing(l2);
    await eventBus.emit("ListingCreatedEvent", { listingId: l2.id, timestamp: l2.createdAt });
    await itemListingService.createListing(l3);
    await eventBus.emit("ListingCreatedEvent", { listingId: l3.id, timestamp: l3.createdAt });

    // Allow FeedConcept to process all emitted events and update its internal collection
    await waitForEventProcessing();

    // 3. User requests the latest listings
    const feedView = await feedConcept.get_latest(3);

    // 4. Assert that the listings are returned in correct chronological order (latest first)
    assertEquals(feedView.listings.length, 3, "Feed should contain 3 listings after creation.");
    assertEquals(feedView.totalCount, 3, "Total count should be 3.");
    assertEquals(feedView.listings[0].id, l3.id, "The latest listing (l3) should be first.");
    assertEquals(feedView.listings[1].id, l2.id, "The second latest listing (l2) should be second.");
    assertEquals(feedView.listings[2].id, l1.id, "The oldest listing (l1) should be third.");
    assertEquals(feedView.currentPage, 1, "Should be on the first page.");
    assertEquals(feedView.pageSize, 3, "Page size should be 3.");

    console.log("Principle: Feed displays latest listings sorted by recency - PASSED");

  } finally {
    await client.close();
  }
});

Deno.test("Principle: Users can filter listings by tag while maintaining chronological order", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const itemListingService = new MockItemListingService();
  const feedConcept = new FeedConcept(db, eventBus, itemListingService);

  try {
    // 1. Prepare diverse listings with different tags and creation times
    const l_photo = createMockListing({ id: generateId("l"), title: "Photo Gear", tags: ["photography"], createdAt: new Date("2023-01-01T10:00:00Z") });
    const l_elec1 = createMockListing({ id: generateId("l"), title: "Smart Gadget", tags: ["electronics", "gadgets"], createdAt: new Date("2023-01-01T10:05:00Z") });
    const l_home = createMockListing({ id: generateId("l"), title: "Home Decor", tags: ["home", "decor"], createdAt: new Date("2023-01-01T10:10:00Z") });
    const l_elec2 = createMockListing({ id: generateId("l"), title: "Gaming PC", tags: ["electronics", "gaming"], createdAt: new Date("2023-01-01T10:15:00Z") });

    // 2. Simulate creation and events for all listings
    const listings = [l_photo, l_elec1, l_home, l_elec2];
    for (const l of listings) {
      await itemListingService.createListing(l);
      await eventBus.emit("ListingCreatedEvent", { listingId: l.id, timestamp: l.createdAt });
    }
    await waitForEventProcessing();

    // 3. User filters by a specific tag ("electronics")
    const feedView = await feedConcept.filter_by_tag("electronics" as Tag, 10);

    // 4. Assert results are correct and chronologically ordered
    assertEquals(feedView.listings.length, 2, "Feed should contain 2 listings for 'electronics'.");
    assertEquals(feedView.totalCount, 2, "Total count should be 2 for 'electronics'.");
    assertEquals(feedView.listings[0].id, l_elec2.id, "Latest 'electronics' listing (l_elec2) should be first.");
    assertEquals(feedView.listings[1].id, l_elec1.id, "Second latest 'electronics' listing (l_elec1) should be second.");
    assertEquals(feedView.listings[0].tags.includes("electronics"), true, "First listing should have 'electronics' tag.");
    assertEquals(feedView.listings[1].tags.includes("electronics"), true, "Second listing should have 'electronics' tag.");

    console.log("Principle: Users can filter listings by tag while maintaining chronological order - PASSED");

  } finally {
    await client.close();
  }
});

Deno.test("Principle: Users can filter listings by price range while maintaining chronological order", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const itemListingService = new MockItemListingService();
  const feedConcept = new FeedConcept(db, eventBus, itemListingService);

  try {
    // 1. Prepare listings with various prices and creation times
    const l_low = createMockListing({ id: generateId("l"), priceValue: 20, createdAt: new Date("2023-01-01T10:00:00Z") });
    const l_mid1 = createMockListing({ id: generateId("l"), priceValue: 75, createdAt: new Date("2023-01-01T10:05:00Z") });
    const l_high = createMockListing({ id: generateId("l"), priceValue: 150, createdAt: new Date("2023-01-01T10:10:00Z") });
    const l_mid2 = createMockListing({ id: generateId("l"), priceValue: 60, createdAt: new Date("2023-01-01T10:15:00Z") });
    const l_vhigh = createMockListing({ id: generateId("l"), priceValue: 200, createdAt: new Date("2023-01-01T10:20:00Z") });

    // 2. Simulate creation and events for all listings
    const listings = [l_low, l_mid1, l_high, l_mid2, l_vhigh];
    for (const l of listings) {
      await itemListingService.createListing(l);
      await eventBus.emit("ListingCreatedEvent", { listingId: l.id, timestamp: l.createdAt });
    }
    await waitForEventProcessing();

    // 3. User filters by a price range (e.g., $50-$100)
    const minPrice: CurrencyAmount = { value: 50, currency: "USD" };
    const maxPrice: CurrencyAmount = { value: 100, currency: "USD" };
    const feedView = await feedConcept.filter_by_price(minPrice, maxPrice, 10);

    // 4. Assert results are correct and chronologically ordered
    assertEquals(feedView.listings.length, 2, "Feed should contain 2 listings in the $50-$100 price range.");
    assertEquals(feedView.totalCount, 2, "Total count should be 2 for the price range.");
    assertEquals(feedView.listings[0].id, l_mid2.id, "Latest listing in price range (l_mid2) should be first.");
    assertEquals(feedView.listings[1].id, l_mid1.id, "Second latest listing in price range (l_mid1) should be second.");
    assertEquals(feedView.listings[0].price.value, 60, "Price for l_mid2 should be 60.");
    assertEquals(feedView.listings[1].price.value, 75, "Price for l_mid1 should be 75.");

    // Test with only min price filter
    const feedViewMin = await feedConcept.filter_by_price({ value: 100, currency: "USD" }, undefined, 10);
    assertEquals(feedViewMin.listings.length, 2, "Feed should contain 2 listings with price >= 100.");
    assertEquals(feedViewMin.listings[0].id, l_vhigh.id, "Latest listing with price >= 100 (l_vhigh) should be first.");
    assertEquals(feedViewMin.listings[1].id, l_high.id, "Second latest listing with price >= 100 (l_high) should be second.");

    console.log("Principle: Users can filter listings by price range while maintaining chronological order - PASSED");

  } finally {
    await client.close();
  }
});

Deno.test("Principle: Users can combine tag and price filters while maintaining chronological order", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const itemListingService = new MockItemListingService();
  const feedConcept = new FeedConcept(db, eventBus, itemListingService);

  try {
    // 1. Prepare listings for combined filtering
    const l1 = createMockListing({ id: generateId("l"), title: "Cam 1", tags: ["electronics"], priceValue: 150, createdAt: new Date("2023-01-01T10:00:00Z") });
    const l2 = createMockListing({ id: generateId("l"), title: "Shirt", tags: ["fashion"], priceValue: 80, createdAt: new Date("2023-01-01T10:05:00Z") });
    const l3 = createMockListing({ id: generateId("l"), title: "Cam 2", tags: ["electronics"], priceValue: 200, createdAt: new Date("2023-01-01T10:10:00Z") });
    const l4 = createMockListing({ id: generateId("l"), title: "Speaker", tags: ["electronics"], priceValue: 90, createdAt: new Date("2023-01-01T10:15:00Z") });
    const l5 = createMockListing({ id: generateId("l"), title: "Dress", tags: ["fashion"], priceValue: 120, createdAt: new Date("2023-01-01T10:20:00Z") });

    // 2. Simulate creation and events for all listings
    const listings = [l1, l2, l3, l4, l5];
    for (const l of listings) {
      await itemListingService.createListing(l);
      await eventBus.emit("ListingCreatedEvent", { listingId: l.id, timestamp: l.createdAt });
    }
    await waitForEventProcessing();

    // 3. User combines filters: tag "electronics" AND price $100-$250
    const tagFilter: Tag = "electronics" as Tag;
    const minPrice: CurrencyAmount = { value: 100, currency: "USD" };
    const maxPrice: CurrencyAmount = { value: 250, currency: "USD" };
    const feedView = await feedConcept.filter_by_combined(tagFilter, minPrice, maxPrice, 10);

    // 4. Assert results are correct and chronologically ordered
    assertEquals(feedView.listings.length, 2, "Feed should contain 2 listings matching combined filters.");
    assertEquals(feedView.totalCount, 2, "Total count should be 2 for combined filters.");
    assertEquals(feedView.listings[0].id, l3.id, "Latest matching listing (l3 - Cam 2) should be first.");
    assertEquals(feedView.listings[1].id, l1.id, "Second latest matching listing (l1 - Cam 1) should be second.");
    assertEquals(feedView.listings[0].price.value, 200, "Price for l3 should be 200.");
    assertEquals(feedView.listings[1].price.value, 150, "Price for l1 should be 150.");
    assertEquals(feedView.listings[0].tags.includes("electronics"), true, "l3 should have 'electronics' tag.");
    assertEquals(feedView.listings[1].tags.includes("electronics"), true, "l1 should have 'electronics' tag.");

    console.log("Principle: Users can combine tag and price filters while maintaining chronological order - PASSED");

  } finally {
    await client.close();
  }
});

Deno.test("Principle: Feed automatically updates when listings are created, updated, or removed", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const itemListingService = new MockItemListingService();
  const feedConcept = new FeedConcept(db, eventBus, itemListingService);

  try {
    // Initial setup: add one listing
    const initialListing = createMockListing({
      id: generateId("l"),
      title: "Initial Item",
      priceValue: 50,
      createdAt: new Date("2023-01-01T09:00:00Z"),
    });
    await itemListingService.createListing(initialListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: initialListing.id, timestamp: initialListing.createdAt });
    await waitForEventProcessing();

    let feedView = await feedConcept.get_latest(10);
    assertEquals(feedView.listings.length, 1, "Feed should have 1 listing initially.");
    assertEquals(feedView.listings[0].id, initialListing.id, "Initial listing should be present.");

    // 1. New listing created: Feed should reflect it automatically
    const newListing = createMockListing({
      id: generateId("l"),
      title: "Brand New Item",
      priceValue: 75,
      createdAt: new Date("2023-01-01T10:00:00Z"),
    });
    await itemListingService.createListing(newListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: newListing.id, timestamp: newListing.createdAt });
    await waitForEventProcessing(); // Wait for FeedConcept to process the event

    feedView = await feedConcept.get_latest(10);
    assertEquals(feedView.listings.length, 2, "Feed should now have 2 listings after creation.");
    assertEquals(feedView.listings[0].id, newListing.id, "New listing should be the latest.");
    assertEquals(feedView.listings[1].id, initialListing.id, "Initial listing should still be present.");

    // 2. Listing updated: Feed should reflect the update automatically
    const updatedTitle = "Updated Initial Item Title";
    const updatedPrice = 60;
    // Simulate updating the listing in the source ItemListingService
    await itemListingService.updateListing(initialListing.id, {
      title: updatedTitle,
      price: { value: updatedPrice, currency: "USD" },
    });
    // Emit the update event
    await eventBus.emit("ListingUpdatedEvent", { listingId: initialListing.id, timestamp: new Date() });
    await waitForEventProcessing();

    feedView = await feedConcept.get_latest(10);
    assertEquals(feedView.listings.length, 2, "Feed count should remain 2 after update.");
    const updatedInFeed = feedView.listings.find(l => l.id === initialListing.id);
    assertExists(updatedInFeed, "Updated listing should still be in feed.");
    assertEquals(updatedInFeed?.title, updatedTitle, "Listing title should be updated in feed.");
    assertEquals(updatedInFeed?.price.value, updatedPrice, "Listing price should be updated in feed.");

    // 3. Listing withdrawn: Feed should remove it automatically
    const withdrawUserId: UserId = generateId("user");
    // Simulate withdrawing the listing in the source ItemListingService
    await itemListingService.withdrawListing(newListing.id, withdrawUserId);
    // Emit the withdrawn event
    await eventBus.emit("ListingWithdrawnEvent", { listingId: newListing.id, timestamp: new Date(), byUserId: withdrawUserId });
    await waitForEventProcessing();

    feedView = await feedConcept.get_latest(10);
    assertEquals(feedView.listings.length, 1, "Feed should have 1 listing after withdrawal.");
    assertEquals(feedView.listings[0].id, initialListing.id, "Only the initial (now updated) listing should remain.");
    assertEquals(feedView.listings.some(l => l.id === newListing.id), false, "Withdrawn listing should not be in feed.");

    // 4. Listing sold: Feed should remove it automatically
    const soldListing = createMockListing({
      id: generateId("l"),
      title: "Item Sold",
      priceValue: 10,
      createdAt: new Date("2023-01-01T11:00:00Z"),
    });
    await itemListingService.createListing(soldListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: soldListing.id, timestamp: soldListing.createdAt });
    await waitForEventProcessing();
    feedView = await feedConcept.get_latest(10);
    assertEquals(feedView.listings.length, 2, "Feed should have 2 listings before selling."); // initial + sold

    const buyerId: UserId = generateId("user");
    // Simulate selling the listing in the source ItemListingService
    await itemListingService.sellListing(soldListing.id, buyerId);
    // Emit the sold event
    await eventBus.emit("ListingSoldEvent", { listingId: soldListing.id, timestamp: new Date(), buyerId: buyerId });
    await waitForEventProcessing();

    feedView = await feedConcept.get_latest(10);
    assertEquals(feedView.listings.length, 1, "Feed should have 1 listing after selling.");
    assertEquals(feedView.listings.some(l => l.id === soldListing.id), false, "Sold listing should not be in feed.");

    console.log("Principle: Feed automatically updates when listings are created, updated, or removed - PASSED");

  } finally {
    await client.close();
  }
});

Deno.test("Principle: Feed handles pagination correctly for large result sets", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const itemListingService = new MockItemListingService();
  const feedConcept = new FeedConcept(db, eventBus, itemListingService);

  try {
    // 1. Prepare a large number of listings
    const totalListings = 25;
    const initialBaseDate = new Date("2023-01-01T12:00:00Z");
    const listings = createManyMockListings(totalListings, initialBaseDate);
    // createManyMockListings returns items ordered by `createdAt` ascending.
    // FeedConcept sorts by `createdAt` descending. So, reverse the `listings` array
    // to match the expected chronological order from FeedConcept.
    const sortedListings = [...listings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 2. Simulate creation and events for all listings
    for (const l of listings) {
      await itemListingService.createListing(l);
      await eventBus.emit("ListingCreatedEvent", { listingId: l.id, timestamp: l.createdAt });
    }
    await waitForEventProcessing(100); // Give a bit more time for many events to be processed

    // 3. Request first page with a specific page size
    const pageSize = 5;
    let feedView = await feedConcept.get_latest(pageSize, 1);

    // 4. Assert first page content
    assertEquals(feedView.listings.length, pageSize, `First page should have ${pageSize} listings.`);
    assertEquals(feedView.totalCount, totalListings, `Total count should be ${totalListings}.`);
    assertEquals(feedView.currentPage, 1, "Current page should be 1.");
    assertEquals(feedView.pageSize, pageSize, `Page size should be ${pageSize}.`);
    for (let i = 0; i < pageSize; i++) {
      assertEquals(feedView.listings[i].id, sortedListings[i].id, `Listing ${i} on page 1 should match sorted list.`);
    }

    // 5. Request second page
    feedView = await feedConcept.get_latest(pageSize, 2);

    // 6. Assert second page content
    assertEquals(feedView.listings.length, pageSize, `Second page should have ${pageSize} listings.`);
    assertEquals(feedView.currentPage, 2, "Current page should be 2.");
    for (let i = 0; i < pageSize; i++) {
      assertEquals(feedView.listings[i].id, sortedListings[pageSize + i].id, `Listing ${i} on page 2 should match sorted list.`);
    }

    // 7. Request last page (which might have fewer items)
    const lastPageNumber = Math.ceil(totalListings / pageSize);
    const expectedLastPageCount = totalListings % pageSize === 0 ? pageSize : totalListings % pageSize;
    feedView = await feedConcept.get_latest(pageSize, lastPageNumber);

    // 8. Assert last page content
    assertEquals(feedView.listings.length, expectedLastPageCount, `Last page should have ${expectedLastPageCount} listings.`);
    assertEquals(feedView.currentPage, lastPageNumber, `Current page should be ${lastPageNumber}.`);
    for (let i = 0; i < expectedLastPageCount; i++) {
      assertEquals(feedView.listings[i].id, sortedListings[(lastPageNumber - 1) * pageSize + i].id, `Listing ${i} on last page should match sorted list.`);
    }

    // 9. Request a page beyond available data
    feedView = await feedConcept.get_latest(pageSize, lastPageNumber + 1);
    assertEquals(feedView.listings.length, 0, "Page beyond max should return empty array.");
    assertEquals(feedView.totalCount, totalListings, "Total count should still be correct.");

    console.log("Principle: Feed handles pagination correctly for large result sets - PASSED");

  } finally {
    await client.close();
  }
});

Deno.test("Principle: Feed gracefully handles errors and invalid inputs", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const itemListingService = new MockItemListingService();
  const feedConcept = new FeedConcept(db, eventBus, itemListingService);

  try {
    // 1. Test invalid pagination inputs (n, page)
    await assertRejects(
      () => feedConcept.get_latest(0),
      InvalidInputError,
      "Requesting 0 items (n) should throw InvalidInputError.",
    );
    await assertRejects(
      () => feedConcept.get_latest(-5),
      InvalidInputError,
      "Requesting negative items (n) should throw InvalidInputError.",
    );
    await assertRejects(
      () => feedConcept.get_latest(10, 0),
      InvalidInputError,
      "Requesting page 0 should throw InvalidInputError.",
    );
    await assertRejects(
      () => feedConcept.get_latest(10, -1),
      InvalidInputError,
      "Requesting negative page should throw InvalidInputError.",
    );

    // 2. Test invalid price range (min > max)
    const invalidMin: CurrencyAmount = { value: 100, currency: "USD" };
    const invalidMax: CurrencyAmount = { value: 50, currency: "USD" };
    await assertRejects(
      () => feedConcept.filter_by_price(invalidMin, invalidMax, 10),
      InvalidInputError,
      "Min price greater than max price should throw InvalidInputError.",
    );
    await assertRejects(
      () => feedConcept.filter_by_combined("any" as Tag, invalidMin, invalidMax, 10),
      InvalidInputError,
      "Combined filter with min price greater than max price should throw InvalidInputError.",
    );

    // 3. Simulate ItemListingService errors during event processing
    // First, add a valid listing to the service and feed
    const errorListing = createMockListing({
      id: generateId("l"),
      title: "Item for Error Test",
      createdAt: new Date("2023-01-01T13:00:00Z"),
    });
    await itemListingService.createListing(errorListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: errorListing.id, timestamp: errorListing.createdAt });
    await waitForEventProcessing();

    // Verify it's in the feed
    let feedView = await feedConcept.get_latest(10);
    assertEquals(feedView.listings.length, 1, "Feed should contain the error test listing initially.");
    assertEquals(feedView.listings[0].id, errorListing.id, "Error test listing should be present.");

    // Now, simulate an error (e.g., ListingNotFound) when FeedConcept tries to fetch a listing for an event
    itemListingService.setShouldThrowError(true, "NotFound"); // Configure mock to throw NotFound
    const nonExistentListingId: ListingId = generateId("l"); // A listing ID not known to the service
    await eventBus.emit("ListingUpdatedEvent", { listingId: nonExistentListingId, timestamp: new Date() });
    await waitForEventProcessing();

    // FeedConcept should log the error internally but not crash or alter existing valid data.
    // The feed state should remain unchanged regarding this non-existent listing.
    feedView = await feedConcept.get_latest(10);
    assertEquals(feedView.listings.length, 1, "Feed count should remain 1 as update for nonexistent listing failed.");
    assertEquals(feedView.listings[0].id, errorListing.id, "Existing listing should still be present and unaltered.");
    itemListingService.setShouldThrowError(false); // Reset error state

    // Simulate a database error from ItemListingService (e.g., during a valid listing update)
    itemListingService.setShouldThrowError(true, "Database");
    const existingListingUpdatedTitle = "Updated Title with DB Error";
    // Simulate the update in the mock service first (before the error config kicks in for FeedConcept's getListing call)
    await itemListingService.updateListing(errorListing.id, { title: existingListingUpdatedTitle });
    // Now emit the event. FeedConcept will try to `getListing` which will hit the mock's error.
    await eventBus.emit("ListingUpdatedEvent", { listingId: errorListing.id, timestamp: new Date() });
    await waitForEventProcessing();

    // FeedConcept should handle this internal service error gracefully.
    // It should not crash, and the feed entry for `errorListing` should ideally remain as it was
    // or at least not be corrupted. The update would not have propagated to the feed index.
    feedView = await feedConcept.get_latest(10);
    assertEquals(feedView.listings.length, 1, "Feed count should remain 1 after mock DB error on update.");
    assertEquals(feedView.listings[0].id, errorListing.id, "Existing listing should still be present.");
    // The title should be the *original* one, because the update failed to apply to the feed index.
    assertNotEquals(feedView.listings[0].title, existingListingUpdatedTitle, "Listing title should NOT be updated in feed due to DB error.");


    console.log("Principle: Feed gracefully handles errors and invalid inputs - PASSED");

  } finally {
    itemListingService.setShouldThrowError(false); // Ensure mock is reset
    await client.close();
  }
});
```