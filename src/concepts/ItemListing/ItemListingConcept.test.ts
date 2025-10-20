// ItemListingConcept.test.ts

import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ObjectId } from "npm:mongodb";
import { testDb } from "../../utils/database.ts";

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

// Main test suite following the LikertSurvey principle-based format
Deno.test("ItemListingConcept Principles", async (t) => {
  // Principle 1: Listing Creation and Management
  await t.step(
    "Principle: Listing Creation and Management - Create listings, update fields, verify data integrity",
    async () => {
      const [db, client] = await testDb();
      let itemListingConcept: ItemListingConcept;
      let mockEventBus: MockEventBus;

      try {
        mockEventBus = new MockEventBus();
        itemListingConcept = new ItemListingConcept(client, mockEventBus, db.databaseName);

        const { seller1 } = fakeUserIds;
        const listingData = {
          seller: seller1,
          title: "Deno T-Shirt",
          description: "Official Deno conference t-shirt, size M, never worn.",
          photos: ["https://example.com/deno_shirt.jpg"],
          tags: ["clothing", "deno", "software"],
          minAsk: 25.00,
        };

        // 1.1. Should successfully create a new listing with all valid data
        console.log("   --> Scenario: Create listing with all valid data.");
        const listingId = await itemListingConcept.create_listing(
          listingData.seller,
          listingData.title,
          listingData.description,
          listingData.photos,
          listingData.tags,
          listingData.minAsk,
        );

        assertExists(listingId, "Listing ID should be returned.");
        assert(listingId instanceof ObjectId, "Listing ID should be an ObjectId.");

        const createdListing = await itemListingConcept.get_listing(listingId);
        assertExists(createdListing, "Created listing should exist.");
        assertEquals(createdListing?.seller.toHexString(), listingData.seller.toHexString(), "Seller should match.");
        assertEquals(createdListing?.title, listingData.title, "Title should match.");
        assertEquals(createdListing?.description, listingData.description, "Description should match.");
        assertEquals(createdListing?.photos, listingData.photos, "Photos should match.");
        assertEquals(createdListing?.tags, listingData.tags, "Tags should match.");
        assertEquals(createdListing?.minAsk, listingData.minAsk, "MinAsk should match.");
        assertEquals(createdListing?.status, ListingStatus.Active, "Status should be Active.");
        assertExists(createdListing?.createdAt, "CreatedAt should exist.");
        assertEquals(createdListing?.bidLog, [], "BidLog should be empty.");
        assert(createdListing?.currentHighestBid === undefined, "CurrentHighestBid should be undefined.");

        // Verify event emission
        const createdEvents = mockEventBus.getEventsByName<ListingCreatedEvent>("ListingCreated");
        assertEquals(createdEvents.length, 1, "One ListingCreated event should be emitted.");
        assertEquals(createdEvents[0].payload.listingId.toHexString(), listingId.toHexString(), "Event listingId should match.");
        assertEquals(createdEvents[0].payload.sellerId.toHexString(), seller1.toHexString(), "Event sellerId should match.");

        // 1.2. Should create a listing without minAsk if not provided
        console.log("   --> Scenario: Create listing without minAsk.");
        const listingDataNoMinAsk = {
          seller: seller1,
          title: "Free Books",
          description: "Old textbooks, free for pickup.",
          photos: [],
          tags: ["books", "free"],
        };

        const listingIdNoMinAsk = await itemListingConcept.create_listing(
          listingDataNoMinAsk.seller,
          listingDataNoMinAsk.title,
          listingDataNoMinAsk.description,
          listingDataNoMinAsk.photos,
          listingDataNoMinAsk.tags,
        );

        const createdListingNoMinAsk = await itemListingConcept.get_listing(listingIdNoMinAsk);
        assertExists(createdListingNoMinAsk, "Listing without minAsk should exist.");
        assert(createdListingNoMinAsk?.minAsk === undefined || createdListingNoMinAsk?.minAsk === null, "MinAsk should be undefined or null.");

        // 1.3. Should successfully update multiple fields of an existing listing
        console.log("   --> Scenario: Update multiple fields of existing listing.");
        const initialListing = generateFakeListing({ seller: seller1 });
        const initialListingId = await itemListingConcept.create_listing(
          initialListing.seller,
          initialListing.title,
          initialListing.description,
          initialListing.photos,
          initialListing.tags,
          initialListing.minAsk,
        );

        const updatedTitle = "Updated Vintage Bicycle Listing";
        const updatedDescription = "Even more detailed description of the bike.";
        const updatedMinAsk = 180.00;
        const updatedPhotos = ["https://example.com/new_bike_photo.jpg"];
        const updatedTags = ["bicycle", "vintage", "commute", "sport"];

        await itemListingConcept.update_listing(
          initialListingId,
          seller1,
          {
            title: updatedTitle,
            description: updatedDescription,
            minAsk: updatedMinAsk,
            photos: updatedPhotos,
            tags: updatedTags,
          },
        );

        const retrievedListing = await itemListingConcept.get_listing(initialListingId);
        assertExists(retrievedListing, "Updated listing should exist.");
        assertEquals(retrievedListing?.title, updatedTitle, "Title should be updated.");
        assertEquals(retrievedListing?.description, updatedDescription, "Description should be updated.");
        assertEquals(retrievedListing?.minAsk, updatedMinAsk, "MinAsk should be updated.");
        assertEquals(retrievedListing?.photos, updatedPhotos, "Photos should be updated.");
        assertEquals(retrievedListing?.tags, updatedTags, "Tags should be updated.");
        assertEquals(retrievedListing?.status, ListingStatus.Active, "Status should remain Active.");

        const updatedEvents = mockEventBus.getEventsByName<ListingUpdatedEvent>("ListingUpdated");
        assertEquals(updatedEvents.length, 1, "One ListingUpdated event should be emitted.");
        assertEquals(updatedEvents[0].payload.updatedFields, ["title", "description", "photos", "tags", "minAsk"], "Updated fields should match.");

        // 1.4. Should retrieve a listing by ID
        console.log("   --> Scenario: Retrieve listing by ID.");
        const retrievedListingById = await itemListingConcept.get_listing(initialListingId);
        assertExists(retrievedListingById, "Listing should be retrievable by ID.");
        assertEquals(retrievedListingById?._id.toHexString(), initialListingId.toHexString(), "Listing ID should match.");

        // 1.5. Should return null if retrieving a non-existent listing
        console.log("   --> Scenario: Retrieve non-existent listing.");
        const nonExistentId = generateObjectId();
        const retrievedNonExistent = await itemListingConcept.get_listing(nonExistentId);
        assertEquals(retrievedNonExistent, null, "Non-existent listing should return null.");

        // 1.6. Should not update listing if no fields are provided for update
        console.log("   --> Scenario: Update with no fields provided.");
        mockEventBus.clearEvents();
        await itemListingConcept.update_listing(initialListingId, seller1, {});
        assertEquals(mockEventBus.emittedEvents.length, 0, "No events should be emitted for empty update.");

        // 1.7. Should not update listing if provided fields are identical to current values
        console.log("   --> Scenario: Update with identical values.");
        await itemListingConcept.update_listing(
          initialListingId,
          seller1,
          {
            title: updatedTitle,
            description: updatedDescription,
          },
        );
        assertEquals(mockEventBus.emittedEvents.length, 0, "No events should be emitted for identical values.");

      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 2: Listing Lifecycle
  await t.step(
    "Principle: Listing Lifecycle - Creation, updates, withdrawal, sale completion",
    async () => {
      const [db, client] = await testDb();
      let itemListingConcept: ItemListingConcept;
      let mockEventBus: MockEventBus;

      try {
        mockEventBus = new MockEventBus();
        itemListingConcept = new ItemListingConcept(client, mockEventBus, db.databaseName);

        const { seller1 } = fakeUserIds;

        // 2.1. Should correctly transition a listing from Active to Withdrawn
        console.log("   --> Scenario: Transition listing from Active to Withdrawn.");
        const listing = generateFakeListing({ seller: seller1 });
        const listingId = await itemListingConcept.create_listing(
          listing.seller,
          listing.title,
          listing.description,
          listing.photos,
          listing.tags,
          listing.minAsk,
        );

        await itemListingConcept.withdraw_listing(listingId, seller1);

        const updatedListing = await itemListingConcept.get_listing(listingId);
        assertExists(updatedListing, "Withdrawn listing should exist.");
        assertEquals(updatedListing?.status, ListingStatus.Withdrawn, "Status should be Withdrawn.");

        const withdrawnEvents = mockEventBus.getEventsByName<ListingWithdrawnEvent>("ListingWithdrawn");
        assertEquals(withdrawnEvents.length, 1, "One ListingWithdrawn event should be emitted.");
        assertEquals(withdrawnEvents[0].payload.listingId.toHexString(), listingId.toHexString(), "Event listingId should match.");

        // 2.2. Should correctly transition a listing from Active to Sold after accepting a bid
        console.log("   --> Scenario: Transition listing from Active to Sold.");
        const listing2 = generateFakeListing({ seller: seller1 });
        const listingId2 = await itemListingConcept.create_listing(
          listing2.seller,
          listing2.title,
          listing2.description,
          listing2.photos,
          listing2.tags,
          listing2.minAsk,
        );

        const bidId = generateObjectId();
        await itemListingConcept.accept_bid(listingId2, seller1, bidId);

        const soldListing = await itemListingConcept.get_listing(listingId2);
        assertExists(soldListing, "Sold listing should exist.");
        assertEquals(soldListing?.status, ListingStatus.Sold, "Status should be Sold.");
        assertEquals(soldListing?.currentHighestBid?.toHexString(), bidId.toHexString(), "CurrentHighestBid should match.");
        assertEquals(soldListing?.bidLog, [bidId], "BidLog should contain the bid.");

        const soldEvents = mockEventBus.getEventsByName<ListingSoldEvent>("ListingSold");
        assertEquals(soldEvents.length, 1, "One ListingSold event should be emitted.");
        assertEquals(soldEvents[0].payload.acceptedBidId.toHexString(), bidId.toHexString(), "Event acceptedBidId should match.");

        // 2.3. Should prevent updating a withdrawn listing
        console.log("   --> Scenario: Prevent updating withdrawn listing.");
        await assertRejects(
          () => itemListingConcept.update_listing(listingId, seller1, { title: "New Title" }),
          (error) => error.name === "InvalidListingStatusError",
          "Should reject updating withdrawn listing.",
        );

        // 2.4. Should prevent withdrawing a sold listing
        console.log("   --> Scenario: Prevent withdrawing sold listing.");
        await assertRejects(
          () => itemListingConcept.withdraw_listing(listingId2, seller1),
          (error) => error.name === "InvalidListingStatusError",
          "Should reject withdrawing sold listing.",
        );

        // 2.5. Should prevent accepting a bid on a sold listing
        console.log("   --> Scenario: Prevent accepting bid on sold listing.");
        const newBidId = generateObjectId();
        await assertRejects(
          () => itemListingConcept.accept_bid(listingId2, seller1, newBidId),
          (error) => error.name === "InvalidListingStatusError",
          "Should reject accepting bid on sold listing.",
        );

      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 3: Bid Integration
  await t.step(
    "Principle: Bid Integration - Accept bids, update bid logs, handle bid status changes",
    async () => {
      const [db, client] = await testDb();
      let itemListingConcept: ItemListingConcept;
      let mockEventBus: MockEventBus;

      try {
        mockEventBus = new MockEventBus();
        itemListingConcept = new ItemListingConcept(client, mockEventBus, db.databaseName);

        const { seller1 } = fakeUserIds;

        // 3.1. Should record the accepted bid in bidLog and currentHighestBid when accepted
        console.log("   --> Scenario: Record accepted bid in bidLog and currentHighestBid.");
        const listing = generateFakeListing({ seller: seller1 });
        const listingId = await itemListingConcept.create_listing(
          listing.seller,
          listing.title,
          listing.description,
          listing.photos,
          listing.tags,
          listing.minAsk,
        );

        const bid1 = generateObjectId();
        await itemListingConcept.accept_bid(listingId, seller1, bid1);

        const updatedListing = await itemListingConcept.get_listing(listingId);
        assertExists(updatedListing, "Updated listing should exist.");
        assertEquals(updatedListing?.status, ListingStatus.Sold, "Status should be Sold.");
        assertEquals(updatedListing?.currentHighestBid?.toHexString(), bid1.toHexString(), "CurrentHighestBid should match.");
        assertEquals(updatedListing?.bidLog, [bid1], "BidLog should contain the bid.");

        const soldEvents = mockEventBus.getEventsByName<ListingSoldEvent>("ListingSold");
        assertEquals(soldEvents.length, 1, "One ListingSold event should be emitted.");
        assertEquals(soldEvents[0].payload.acceptedBidId.toHexString(), bid1.toHexString(), "Event acceptedBidId should match.");

        // 3.2. Should ensure accept_bid updates listing status to Sold
        console.log("   --> Scenario: Accept bid updates status to Sold.");
        mockEventBus.clearEvents(); // Clear events from previous test
        const listing2 = generateFakeListing({ seller: seller1 });
        const listingId2 = await itemListingConcept.create_listing(
          listing2.seller,
          listing2.title,
          listing2.description,
          listing2.photos,
          listing2.tags,
          listing2.minAsk,
        );

        const bidId2 = generateObjectId();
        await itemListingConcept.accept_bid(listingId2, seller1, bidId2);

        const soldListing2 = await itemListingConcept.get_listing(listingId2);
        assertExists(soldListing2, "Sold listing should exist.");
        assertEquals(soldListing2?.status, ListingStatus.Sold, "Status should be Sold.");

        const soldEvents2 = mockEventBus.getEventsByName<ListingSoldEvent>("ListingSold");
        assertEquals(soldEvents2.length, 1, "One ListingSold event should be emitted.");

        // 3.3. Should reject accepting a bid with an invalid bidId format
        console.log("   --> Scenario: Reject invalid bidId format.");
        const listing3 = generateFakeListing({ seller: seller1 });
        const listingId3 = await itemListingConcept.create_listing(
          listing3.seller,
          listing3.title,
          listing3.description,
          listing3.photos,
          listing3.tags,
          listing3.minAsk,
        );

        const invalidBidId = "not-an-objectid" as unknown as ObjectId;
        await assertRejects(
          () => itemListingConcept.accept_bid(listingId3, seller1, invalidBidId),
          (error) => error.name === "ListingValidationError",
          "Should reject invalid bidId format.",
        );

      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 4: Data Validation
  await t.step(
    "Principle: Data Validation - Invalid inputs, missing fields, constraint violations",
    async () => {
      const [db, client] = await testDb();
      let itemListingConcept: ItemListingConcept;
      let mockEventBus: MockEventBus;

      try {
        mockEventBus = new MockEventBus();
        itemListingConcept = new ItemListingConcept(client, mockEventBus, db.databaseName);

        const { seller1 } = fakeUserIds;

        // 4.1. Should reject creating a listing with empty title
        console.log("   --> Scenario: Reject empty title.");
        await assertRejects(
          () => itemListingConcept.create_listing(seller1, "", "description", [], []),
          (error) => error.name === "ListingValidationError",
          "Should reject empty title.",
        );

        // 4.2. Should reject creating a listing with title exceeding max length
        console.log("   --> Scenario: Reject title exceeding max length.");
        const longTitle = generateRandomString(201);
        await assertRejects(
          () => itemListingConcept.create_listing(seller1, longTitle, "description", [], []),
          (error) => error.name === "ListingValidationError",
          "Should reject title exceeding max length.",
        );

        // 4.3. Should reject creating a listing with invalid photos
        console.log("   --> Scenario: Reject invalid photos.");
        await assertRejects(
          () => itemListingConcept.create_listing(seller1, "title", "description", ["invalid-url"], []),
          (error) => error.name === "ListingValidationError",
          "Should reject invalid photos.",
        );

        // 4.4. Should reject creating a listing with too many photos
        console.log("   --> Scenario: Reject too many photos.");
        const photos = generateRandomUrls(11);
        await assertRejects(
          () => itemListingConcept.create_listing(seller1, "title", "description", photos, []),
          (error) => error.name === "ListingValidationError",
          "Should reject too many photos.",
        );

        // 4.5. Should reject creating a listing with negative minAsk
        console.log("   --> Scenario: Reject negative minAsk.");
        await assertRejects(
          () => itemListingConcept.create_listing(seller1, "title", "description", [], [], -10.00),
          (error) => error.name === "ListingValidationError",
          "Should reject negative minAsk.",
        );

        // 4.6. Should reject updating a listing with invalid field values
        console.log("   --> Scenario: Reject invalid field values in update.");
        const listing = generateFakeListing({ seller: seller1 });
        const listingId = await itemListingConcept.create_listing(
          listing.seller,
          listing.title,
          listing.description,
          listing.photos,
          listing.tags,
          listing.minAsk,
        );

        await assertRejects(
          () => itemListingConcept.update_listing(listingId, seller1, { title: "" }),
          (error) => error.name === "ListingValidationError",
          "Should reject empty title in update.",
        );

        // 4.7. Should reject updating a listing with too many tags
        console.log("   --> Scenario: Reject too many tags in update.");
        const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
        await assertRejects(
          () => itemListingConcept.update_listing(listingId, seller1, { tags }),
          (error) => error.name === "ListingValidationError",
          "Should reject too many tags in update.",
        );

        // 4.8. Should reject operations with invalid ObjectId formats
        console.log("   --> Scenario: Reject invalid ObjectId formats.");
        const invalidId = "not-a-valid-objectid" as unknown as ObjectId;

        await assertRejects(
          () => itemListingConcept.get_listing(invalidId),
          (error) => error.name === "ListingValidationError",
          "Should reject invalid listingId format.",
        );

        await assertRejects(
          () => itemListingConcept.update_listing(invalidId, seller1, { title: "x" }),
          (error) => error.name === "ListingValidationError",
          "Should reject invalid listingId in update.",
        );

        await assertRejects(
          () => itemListingConcept.withdraw_listing(listingId, invalidId),
          (error) => error.name === "ListingValidationError",
          "Should reject invalid sellerId in withdraw.",
        );

        await assertRejects(
          () => itemListingConcept.accept_bid(listingId, invalidId, generateObjectId()),
          (error) => error.name === "ListingValidationError",
          "Should reject invalid sellerId in accept_bid.",
        );

      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 5: Error Handling
  await t.step(
    "Principle: Error Handling - Non-existent listings, unauthorized access, invalid operations",
    async () => {
      const [db, client] = await testDb();
      let itemListingConcept: ItemListingConcept;
      let mockEventBus: MockEventBus;

      try {
        mockEventBus = new MockEventBus();
        itemListingConcept = new ItemListingConcept(client, mockEventBus, db.databaseName);

        const { seller1, seller2 } = fakeUserIds;

        // 5.1. Should throw ListingNotFoundError when updating a non-existent listing
        console.log("   --> Scenario: Update non-existent listing.");
        const nonExistentId = generateObjectId();
        await assertRejects(
          () => itemListingConcept.update_listing(nonExistentId, seller1, { title: "New Title" }),
          (error) => error.name === "ListingNotFoundError",
          "Should reject updating non-existent listing.",
        );

        // 5.2. Should throw UnauthorizedListingAccessError when a non-seller tries to update
        console.log("   --> Scenario: Unauthorized update attempt.");
        const listing = generateFakeListing({ seller: seller1 });
        const listingId = await itemListingConcept.create_listing(
          listing.seller,
          listing.title,
          listing.description,
          listing.photos,
          listing.tags,
          listing.minAsk,
        );

        await assertRejects(
          () => itemListingConcept.update_listing(listingId, seller2, { title: "Malicious Title" }),
          (error) => error.name === "UnauthorizedListingAccessError",
          "Should reject unauthorized update.",
        );

        // 5.3. Should throw UnauthorizedListingAccessError when a non-seller tries to withdraw
        console.log("   --> Scenario: Unauthorized withdraw attempt.");
        await assertRejects(
          () => itemListingConcept.withdraw_listing(listingId, seller2),
          (error) => error.name === "UnauthorizedListingAccessError",
          "Should reject unauthorized withdraw.",
        );

        // 5.4. Should throw UnauthorizedListingAccessError when a non-seller tries to accept bid
        console.log("   --> Scenario: Unauthorized accept bid attempt.");
        const bidId = generateObjectId();
        await assertRejects(
          () => itemListingConcept.accept_bid(listingId, seller2, bidId),
          (error) => error.name === "UnauthorizedListingAccessError",
          "Should reject unauthorized accept bid.",
        );

        // 5.5. Should throw ListingNotFoundError when withdrawing a non-existent listing
        console.log("   --> Scenario: Withdraw non-existent listing.");
        await assertRejects(
          () => itemListingConcept.withdraw_listing(nonExistentId, seller1),
          (error) => error.name === "ListingNotFoundError",
          "Should reject withdrawing non-existent listing.",
        );

        // 5.6. Should throw ListingNotFoundError when accepting a bid for a non-existent listing
        console.log("   --> Scenario: Accept bid for non-existent listing.");
        await assertRejects(
          () => itemListingConcept.accept_bid(nonExistentId, seller1, bidId),
          (error) => error.name === "ListingNotFoundError",
          "Should reject accepting bid for non-existent listing.",
        );

      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 6: Synchronization (Event Emission)
  await t.step(
    "Principle: Synchronization - Event emission, external system integration, data consistency",
    async () => {
      const [db, client] = await testDb();
      let itemListingConcept: ItemListingConcept;
      let mockEventBus: MockEventBus;

      try {
        mockEventBus = new MockEventBus();
        itemListingConcept = new ItemListingConcept(client, mockEventBus, db.databaseName);

        const { seller1, seller2 } = fakeUserIds;

        // 6.1. ListingCreated event is emitted correctly on new listing creation
        console.log("   --> Scenario: ListingCreated event emission.");
        const listingData = { ...fakeListingData.activeListing, seller: seller1 };
        const listingId = await itemListingConcept.create_listing(
          listingData.seller,
          listingData.title,
          listingData.description,
          listingData.photos,
          listingData.tags,
          listingData.minAsk,
        );

        const createdEvents = mockEventBus.getEventsByName<ListingCreatedEvent>("ListingCreated");
        assertEquals(createdEvents.length, 1, "One ListingCreated event should be emitted.");
        assertEquals(createdEvents[0].payload.listingId.toHexString(), listingId.toHexString(), "Event listingId should match.");
        assertEquals(createdEvents[0].payload.sellerId.toHexString(), seller1.toHexString(), "Event sellerId should match.");

        // 6.2. ListingUpdated event is emitted correctly on listing update
        console.log("   --> Scenario: ListingUpdated event emission.");
        await itemListingConcept.update_listing(
          listingId,
          seller1,
          { title: "New Title", tags: ["updated"], minAsk: 100 },
        );

        const updatedEvents = mockEventBus.getEventsByName<ListingUpdatedEvent>("ListingUpdated");
        assertEquals(updatedEvents.length, 1, "One ListingUpdated event should be emitted.");
        assertEquals(updatedEvents[0].payload.updatedFields, ["title", "tags", "minAsk"], "Updated fields should match.");

        // 6.3. ListingWithdrawn event is emitted correctly on listing withdrawal
        console.log("   --> Scenario: ListingWithdrawn event emission.");
        const listing2 = generateFakeListing({ seller: seller1 });
        const listingId2 = await itemListingConcept.create_listing(
          listing2.seller,
          listing2.title,
          listing2.description,
          listing2.photos,
          listing2.tags,
          listing2.minAsk,
        );

        await itemListingConcept.withdraw_listing(listingId2, seller1);

        const withdrawnEvents = mockEventBus.getEventsByName<ListingWithdrawnEvent>("ListingWithdrawn");
        assertEquals(withdrawnEvents.length, 1, "One ListingWithdrawn event should be emitted.");
        assertEquals(withdrawnEvents[0].payload.listingId.toHexString(), listingId2.toHexString(), "Event listingId should match.");

        // 6.4. ListingSold event is emitted correctly on accepting a bid
        console.log("   --> Scenario: ListingSold event emission.");
        const listing3 = generateFakeListing({ seller: seller1 });
        const listingId3 = await itemListingConcept.create_listing(
          listing3.seller,
          listing3.title,
          listing3.description,
          listing3.photos,
          listing3.tags,
          listing3.minAsk,
        );

        const bidId = generateObjectId();
        await itemListingConcept.accept_bid(listingId3, seller1, bidId);

        const soldEvents = mockEventBus.getEventsByName<ListingSoldEvent>("ListingSold");
        assertEquals(soldEvents.length, 1, "One ListingSold event should be emitted.");
        assertEquals(soldEvents[0].payload.acceptedBidId.toHexString(), bidId.toHexString(), "Event acceptedBidId should match.");

        // 6.5. No events are emitted for failed or non-altering operations
        console.log("   --> Scenario: No events for failed operations.");
        mockEventBus.clearEvents();

        // Attempt unauthorized update
        await assertRejects(
          () => itemListingConcept.update_listing(listingId, seller2, { title: "Attempted update" }),
          (error) => error.name === "UnauthorizedListingAccessError",
          "Should reject unauthorized update.",
        );

        // Attempt to withdraw a non-existent listing
        await assertRejects(
          () => itemListingConcept.withdraw_listing(generateObjectId(), seller1),
          (error) => error.name === "ListingNotFoundError",
          "Should reject withdrawing non-existent listing.",
        );

        // Attempt update with no changes
        await itemListingConcept.update_listing(
          listingId,
          seller1,
          { title: "New Title" }, // Same as current
        );

        assertEquals(mockEventBus.emittedEvents.length, 0, "No events should be emitted for failed operations.");

      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );
});
