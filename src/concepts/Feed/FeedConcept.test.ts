import { assertEquals, assert, assertRejects } from "jsr:@std/assert";
import { FeedConcept } from "./FeedConcept.ts";
import { MockEventBus, MockItemListingService } from "./mock-services.ts"; // Removed setupTestDatabase from here
import { generateId, createMockListing, createManyMockListings } from "./fake-data.ts";
import { testDb } from "../../utils/database.ts"; // Directly import testDb helper
import { InvalidInputError } from "./FeedErrors.ts"; // Import custom error

Deno.test("Principle: Feed provides latest listings in reverse chronological order", async () => {
  const [db, client] = await testDb(); // Destructure db and client
  const eventBus = new MockEventBus();
  const listingService = new MockItemListingService();
  const feed = new FeedConcept(db, eventBus, listingService);

  try {
    // Create test listings with staggered creation times
    // createManyMockListings already handles staggering, so events will process in that order
    const listings = createManyMockListings(5);
    for (const listing of listings) {
      await listingService.createListing(listing); // Mock service creates it
      await eventBus.emit("ListingCreatedEvent", { listingId: listing.id, timestamp: new Date() }); // Emit event
    }

    // Give some time for async event handlers to process and update the feed
    await new Promise(resolve => setTimeout(resolve, 200));

    // Test get_latest
    const latest = await feed.get_latest(3);
    assertEquals(latest.length, 3, "Expected 3 latest listings in the feed.");

    // Verify chronological order (most recent first)
    for (let i = 0; i < latest.length - 1; i++) {
      assert(latest[i].createdAt.getTime() >= latest[i + 1].createdAt.getTime(), `Listings should be in reverse chronological order: ${latest[i].createdAt.toISOString()} vs ${latest[i + 1].createdAt.toISOString()}`);
    }
  } finally {
    await client.close();
  }
});

Deno.test("Principle: Users can filter listings by tags while maintaining chronological order", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const listingService = new MockItemListingService();
  const feed = new FeedConcept(db, eventBus, listingService);

  try {
    // Create test listings with different tags and staggered times
    const electronicsListing = createMockListing({ tags: ["electronics", "gadgets"], createdAt: new Date(Date.now() - 300) });
    const clothingListing = createMockListing({ tags: ["clothing", "fashion"], createdAt: new Date(Date.now() - 200) });
    const electronicsListing2 = createMockListing({ tags: ["electronics", "computers"], createdAt: new Date(Date.now() - 100) });

    await listingService.createListing(electronicsListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: electronicsListing.id, timestamp: new Date() });

    await listingService.createListing(clothingListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: clothingListing.id, timestamp: new Date() });

    await listingService.createListing(electronicsListing2);
    await eventBus.emit("ListingCreatedEvent", { listingId: electronicsListing2.id, timestamp: new Date() });

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Test tag filtering
    const electronicsResults = await feed.filter_by_tags(["electronics"]);
    assertEquals(electronicsResults.length, 2, "Expected 2 listings with 'electronics' tag.");

    // Verify all results have electronics tag
    for (const listing of electronicsResults) {
      assert(listing.tags.includes("electronics"), "All results should have electronics tag");
    }

    // Verify chronological order (most recent first among filtered)
    assert(electronicsResults[0].id === electronicsListing2.id, "Most recent electronics listing should be first");
    assert(electronicsResults[1].id === electronicsListing.id, "Older electronics listing should be second");
    for (let i = 0; i < electronicsResults.length - 1; i++) {
      assert(electronicsResults[i].createdAt.getTime() >= electronicsResults[i + 1].createdAt.getTime(), "Filtered results should maintain chronological order");
    }
  } finally {
    await client.close();
  }
});

Deno.test("Principle: Users can filter listings by price range while maintaining chronological order", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const listingService = new MockItemListingService();
  const feed = new FeedConcept(db, eventBus, listingService);

  try {
    // Create test listings with different prices and staggered times
    const cheapListing = createMockListing({ price: { value: 10, currency: "USD" }, createdAt: new Date(Date.now() - 300) });
    const midRangeListing = createMockListing({ price: { value: 50, currency: "USD" }, createdAt: new Date(Date.now() - 200) });
    const expensiveListing = createMockListing({ price: { value: 100, currency: "USD" }, createdAt: new Date(Date.now() - 100) });


    await listingService.createListing(cheapListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: cheapListing.id, timestamp: new Date() });

    await listingService.createListing(midRangeListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: midRangeListing.id, timestamp: new Date() });

    await listingService.createListing(expensiveListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: expensiveListing.id, timestamp: new Date() });

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Test price filtering (20-80 USD)
    const midRangeResults = await feed.filter_by_price(
      { value: 20, currency: "USD" },
      { value: 80, currency: "USD" }
    );

    assertEquals(midRangeResults.length, 1, "Expected 1 listing in the 20-80 USD range.");
    assertEquals(midRangeResults[0].id, midRangeListing.id, "The correct listing (mid-range) should be found.");
    assertEquals(midRangeResults[0].price.value, 50, "The found listing should have price 50.");
  } finally {
    await client.close();
  }
});

Deno.test("Principle: Users can combine tag and price filters while maintaining chronological order", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const listingService = new MockItemListingService();
  const feed = new FeedConcept(db, eventBus, listingService);

  try {
    // Create test listings
    const electronicsCheap = createMockListing({
      tags: ["electronics"],
      price: { value: 30, currency: "USD" },
      createdAt: new Date(Date.now() - 300)
    });
    const electronicsExpensive = createMockListing({
      tags: ["electronics"],
      price: { value: 150, currency: "USD" },
      createdAt: new Date(Date.now() - 200)
    });
    const clothingCheap = createMockListing({
      tags: ["clothing"],
      price: { value: 25, currency: "USD" },
      createdAt: new Date(Date.now() - 100)
    });

    await listingService.createListing(electronicsCheap);
    await eventBus.emit("ListingCreatedEvent", { listingId: electronicsCheap.id, timestamp: new Date() });

    await listingService.createListing(electronicsExpensive);
    await eventBus.emit("ListingCreatedEvent", { listingId: electronicsExpensive.id, timestamp: new Date() });

    await listingService.createListing(clothingCheap);
    await eventBus.emit("ListingCreatedEvent", { listingId: clothingCheap.id, timestamp: new Date() });

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Test combined filtering
    const results = await feed.filter_by_tags_and_price(
      ["electronics"],
      { value: 20, currency: "USD" },
      { value: 100, currency: "USD" }
    );

    assertEquals(results.length, 1, "Expected 1 listing matching both tag and price criteria.");
    assertEquals(results[0].id, electronicsCheap.id, "The correct listing (electronics, cheap) should be found.");
    assert(results[0].tags.includes("electronics"), "Found listing should have 'electronics' tag.");
    assertEquals(results[0].price.value, 30, "Found listing should have price 30.");
  } finally {
    await client.close();
  }
});

Deno.test("Principle: Feed automatically updates when listings are created, updated, or removed", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const listingService = new MockItemListingService();
  const feed = new FeedConcept(db, eventBus, listingService);

  try {
    // Create initial listing
    const listing1 = createMockListing({ title: "Initial Listing", createdAt: new Date(Date.now() - 300) });
    await listingService.createListing(listing1);
    await eventBus.emit("ListingCreatedEvent", { listingId: listing1.id, timestamp: new Date() });

    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for processing

    // Verify initial state
    let feedListings = await feed.get_latest(10);
    assertEquals(feedListings.length, 1, "Feed should contain 1 listing after initial creation.");
    assertEquals(feedListings[0].id, listing1.id);
    assertEquals(feedListings[0].title, "Initial Listing");

    // Create second listing
    const listing2 = createMockListing({ title: "Second Listing", createdAt: new Date(Date.now() - 200) });
    await listingService.createListing(listing2);
    await eventBus.emit("ListingCreatedEvent", { listingId: listing2.id, timestamp: new Date() });

    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for processing

    // Verify update
    feedListings = await feed.get_latest(10);
    assertEquals(feedListings.length, 2, "Feed should contain 2 listings after second creation.");
    assertEquals(feedListings[0].id, listing2.id, "Second listing should be first (more recent).");
    assertEquals(feedListings[1].id, listing1.id, "First listing should be second (older).");

    // Update listing1
    const updatedListingData = { title: "Updated Listing 1", tags: ["updated"] };
    const updatedListing = await listingService.updateListing(listing1.id, updatedListingData); // Update in mock service
    await eventBus.emit("ListingUpdatedEvent", { listingId: listing1.id, timestamp: new Date() }); // Emit update event

    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for processing

    // Verify update in feed
    feedListings = await feed.get_latest(10);
    assertEquals(feedListings.length, 2, "Feed count should remain 2 after update.");
    const updatedInFeed = feedListings.find(l => l.id === listing1.id);
    assert(updatedInFeed, "Updated listing should still be in feed.");
    assertEquals(updatedInFeed.title, "Updated Listing 1", "Listing title should be updated in feed.");
    assert(updatedInFeed.tags.includes("updated"), "Listing tags should be updated in feed.");
    assert(updatedInFeed.lastUpdatedAt.getTime() > listing1.lastUpdatedAt.getTime(), "lastUpdatedAt should be updated.");


    // Withdraw listing1
    await listingService.withdrawListing(listing1.id, listing1.ownerId); // Update in mock service
    await eventBus.emit("ListingWithdrawnEvent", { listingId: listing1.id, byUserId: listing1.ownerId, timestamp: new Date() });

    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for processing

    // Verify withdrawal
    feedListings = await feed.get_latest(10);
    assertEquals(feedListings.length, 1, "Feed should contain 1 listing after withdrawal.");
    assertEquals(feedListings[0].id, listing2.id, "Only listing2 should remain after listing1 withdrawal.");

    // Create a new listing to be sold
    const soldListing = createMockListing({ title: "Sold Listing", createdAt: new Date(Date.now() - 100) });
    await listingService.createListing(soldListing);
    await eventBus.emit("ListingCreatedEvent", { listingId: soldListing.id, timestamp: new Date() });

    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for processing

    // Verify sold listing is in feed
    feedListings = await feed.get_latest(10);
    assertEquals(feedListings.length, 2, "Feed should have 2 listings again (listing2 + soldListing).");
    assert(feedListings.some(l => l.id === soldListing.id), "Sold listing should be in feed before being sold event processed.");

    // Sell the listing
    await listingService.sellListing(soldListing.id, "buyer123"); // Update in mock service
    await eventBus.emit("ListingSoldEvent", { listingId: soldListing.id, buyerId: "buyer123", timestamp: new Date() });

    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for processing

    // Verify sold listing is removed
    feedListings = await feed.get_latest(10);
    assertEquals(feedListings.length, 1, "Feed should contain 1 listing after sold event processed.");
    assertEquals(feedListings[0].id, listing2.id, "Only listing2 should remain after soldListing is sold.");
  } finally {
    await client.close();
  }
});

Deno.test("Principle: Feed handles invalid inputs gracefully", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const listingService = new MockItemListingService();
  const feed = new FeedConcept(db, eventBus, listingService);

  try {
    // Test invalid page size
    await assertRejects(
      () => feed.get_latest(0),
      InvalidInputError, // Use custom error type
      "Page size (n) must be a positive integer."
    );

    await assertRejects(
      () => feed.get_latest(-1),
      InvalidInputError, // Use custom error type
      "Page size (n) must be a positive integer."
    );

    // Test invalid price range (negative min)
    await assertRejects(
      () => feed.filter_by_price(
        { value: -10, currency: "USD" },
        { value: 100, currency: "USD" }
      ),
      InvalidInputError, // Use custom error type
      "Minimum price must be a non-negative number."
    );

    // Test invalid price range (negative max) - NEW
    await assertRejects(
      () => feed.filter_by_price(
        { value: 10, currency: "USD" },
        { value: -5, currency: "USD" }
      ),
      InvalidInputError, // Use custom error type
      "Maximum price must be a non-negative number."
    );

    // Test invalid price range (min > max)
    await assertRejects(
      () => feed.filter_by_price(
        { value: 50, currency: "USD" },
        { value: 30, currency: "USD" }
      ),
      InvalidInputError, // Use custom error type
      "Minimum price cannot be greater than maximum price."
    );
  } finally {
    await client.close();
  }
});

Deno.test("Principle: Feed maintains data consistency during concurrent operations", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const listingService = new MockItemListingService();
  const feed = new FeedConcept(db, eventBus, listingService);

  try {
    // Create multiple listings concurrently
    const listings = createManyMockListings(10);
    const createPromises = listings.map(listing =>
      listingService.createListing(listing).then(() =>
        eventBus.emit("ListingCreatedEvent", { listingId: listing.id, timestamp: new Date() })
      )
    );

    await Promise.all(createPromises);

    // Wait for all async event handlers to process
    await new Promise(resolve => setTimeout(resolve, 500)); // Increased timeout for multiple concurrent ops

    // Verify all listings are in feed
    const feedListings = await feed.get_latest(20); // Request more than 10 to ensure all are fetched
    assertEquals(feedListings.length, 10, "Expected 10 listings after concurrent creation.");
  } finally {
    await client.close();
  }
});

Deno.test("Principle: Feed provides efficient querying capabilities", async () => {
  const [db, client] = await testDb();
  const eventBus = new MockEventBus();
  const listingService = new MockItemListingService();
  const feed = new FeedConcept(db, eventBus, listingService);

  try {
    // Create test data
    const listings = createManyMockListings(100);
    // Create a mix of tags and prices for better test coverage
    listings.forEach((listing, i) => {
      listing.tags = i % 2 === 0 ? ["electronics"] : ["books"];
      listing.price = { value: i * 10, currency: "USD" };
    });

    for (const listing of listings) {
      await listingService.createListing(listing);
      await eventBus.emit("ListingCreatedEvent", { listingId: listing.id, timestamp: new Date() });
    }

    // Wait for event processing for all 100 listings
    await new Promise(resolve => setTimeout(resolve, 1000)); // Increased timeout for 100 listings

    // Test performance of different operations
    const startTimeLatest = Date.now();
    await feed.get_latest(20);
    const getLatestTime = Date.now() - startTimeLatest;

    const startTimeFilterTags = Date.now();
    await feed.filter_by_tags(["electronics"]);
    const filterTagsTime = Date.now() - startTimeFilterTags;

    const startTimeFilterPrice = Date.now();
    await feed.filter_by_price(
      { value: 0, currency: "USD" },
      { value: 500, currency: "USD" }
    );
    const filterPriceTime = Date.now() - startTimeFilterPrice;

    const startTimeFilterBoth = Date.now();
    await feed.filter_by_tags_and_price(
      ["books"],
      { value: 100, currency: "USD" },
      { value: 700, currency: "USD" }
    );
    const filterBothTime = Date.now() - startTimeFilterBoth;

    // Verify reasonable performance (adjust thresholds as needed based on environment)
    console.log(`Performance metrics:`);
    console.log(`  get_latest: ${getLatestTime}ms`);
    console.log(`  filter_by_tags: ${filterTagsTime}ms`);
    console.log(`  filter_by_price: ${filterPriceTime}ms`);
    console.log(`  filter_by_tags_and_price: ${filterBothTime}ms`);

    assert(getLatestTime < 1000, `get_latest should complete within 1000ms, took ${getLatestTime}ms`);
    assert(filterTagsTime < 1000, `filter_by_tags should complete within 1000ms, took ${filterTagsTime}ms`);
    assert(filterPriceTime < 1000, `filter_by_price should complete within 1000ms, took ${filterPriceTime}ms`);
    assert(filterBothTime < 1000, `filter_by_tags_and_price should complete within 1000ms, took ${filterBothTime}ms`);
  } finally {
    await client.close();
  }
});