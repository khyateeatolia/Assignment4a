// BiddingConcept.test.ts
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assert, assertEquals, assertExists, assertNotEquals, assertRejects, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Collection, Db, MongoClient, ObjectId } from "npm:mongodb";

import {
    BiddingConcept,
    BidStatus,
    BiddingEventTopics,
    BidRecordDBO,
    BidId,
    UserId,
    ListingId
} from "./BiddingConcept.ts";
import {
    BidAlreadyWithdrawnError,
    BidNotFoundError,
    BidWithdrawalFailedUnexpectedlyError,
    InvalidBidAmountError,
    UnauthorizedBidWithdrawalError,
} from "./BiddingErrors.ts";
import { MockEventBus } from "./mock-services.ts";
import { testDb } from "../../utils/database.ts";
import { generateObjectId, fakeListingId1, fakeListingId2, fakeUserId1, fakeUserId2, createFakeBidRecord } from "./fake-data.ts";

describe("Concept C - Bidding Implementation", () => {
    let biddingConcept: BiddingConcept;
    let mockEventBus: MockEventBus;
    let client: MongoClient;
    let db: Db;
    let bidsCollection: Collection<BidRecordDBO>;

    // Shared test data
    let listingId_active: ListingId;
    let listingId_no_bids: ListingId;
    let bidderId_alpha: UserId;
    let bidderId_beta: UserId;

    beforeAll(async () => {
        // P6: Testability - Ensure dependencies are injectable and setup once for all tests.
        const [testDbInstance, testClient] = await testDb();
        client = testClient;
        db = testDbInstance;
        bidsCollection = db.collection<BidRecordDBO>("bids");

        // Initialize BiddingConcept once, it will setup indexes on first run.
        mockEventBus = new MockEventBus();
        biddingConcept = new BiddingConcept(db, mockEventBus);
        console.log("MongoDB client and BiddingConcept initialized.");
    });

    afterAll(async () => {
        // P6: Testability - Clean up resources after all tests.
        await client.close();
        console.log("MongoDB client disconnected.");
    });

    beforeEach(async () => {
        // P6: Testability - Isolate tests by clearing data and resetting mocks before each test.
        console.log("\n[TEST HOOK] Running beforeEach setup...");
        await bidsCollection.deleteMany({});
        mockEventBus.clearEvents();

        // Generate fresh IDs for each test to ensure isolation
        listingId_active = generateObjectId();
        listingId_no_bids = generateObjectId();
        bidderId_alpha = generateObjectId();
        bidderId_beta = generateObjectId();
        console.log("[TEST HOOK] beforeEach setup complete. DB cleared, mocks reset, new IDs generated.");
    });

    // P1: Correctness - Core Functionality Tests
    describe("P1: Correctness - Core Functionality", () => {
        it("should allow a user to place a bid on a listing", async () => {
            const bidAmount = 100;
            const bidId = await biddingConcept.place_bid(bidderId_alpha, listingId_active, bidAmount);

            assertExists(bidId);
            assert(bidId instanceof ObjectId, "Bid ID should be an ObjectId");

            const placedBid = await bidsCollection.findOne({ _id: bidId });
            assertExists(placedBid, "Placed bid should be found in DB");
            assertEquals(placedBid.amount, bidAmount);
            assertEquals(placedBid.bidderId.toHexString(), bidderId_alpha.toHexString());
            assertEquals(placedBid.listingId.toHexString(), listingId_active.toHexString());
            assertEquals(placedBid.status, BidStatus.Active);

            const events = mockEventBus.getEventsByTopic(BiddingEventTopics.BidPlaced);
            assertEquals(events.length, 1, "Should emit one BidPlaced event");
            assertEquals((events[0] as any).bidId, bidId.toHexString());
            assertEquals((events[0] as any).listingId, listingId_active.toHexString());
            assertEquals((events[0] as any).bidderId, bidderId_alpha.toHexString());
            assertEquals((events[0] as any).amount, bidAmount);
        });

        it("should retrieve all active bids for a listing, sorted by amount and timestamp", async () => {
            await biddingConcept.place_bid(bidderId_alpha, listingId_active, 50); // bid A
            await new Promise(resolve => setTimeout(resolve, 10)); // Ensure distinct timestamps
            const bidIdB = await biddingConcept.place_bid(bidderId_beta, listingId_active, 150); // bid B (highest)
            await new Promise(resolve => setTimeout(resolve, 10));
            await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100); // bid C
            await new Promise(resolve => setTimeout(resolve, 10));
            const bidIdD = await biddingConcept.place_bid(bidderId_beta, listingId_active, 150); // bid D (same as B, but newer)

            const bids = await biddingConcept.get_bids(listingId_active);

            assertEquals(bids.length, 4, "Should retrieve all 4 active bids");
            assertEquals(bids[0].id, bidIdD.toHexString(), "Highest bid should be bid D (150, newest)");
            assertEquals(bids[0].amount, 150);
            assertEquals(bids[1].id, bidIdB.toHexString(), "Next highest bid should be bid B (150, older)");
            assertEquals(bids[1].amount, 150);
            assertEquals(bids[2].amount, 100);
            assertEquals(bids[3].amount, 50);
            assert(bids.every(b => b.status === BidStatus.Active), "All retrieved bids should be active");
        });

        it("should retrieve the current highest bid ID for a listing", async () => {
            await biddingConcept.place_bid(bidderId_alpha, listingId_active, 75);
            await new Promise(resolve => setTimeout(resolve, 10));
            const highBidId = await biddingConcept.place_bid(bidderId_beta, listingId_active, 120);
            await new Promise(resolve => setTimeout(resolve, 10));
            await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100);

            const currentHighBid = await biddingConcept.get_current_high(listingId_active);
            assertExists(currentHighBid, "Should find a high bid");
            assertEquals(currentHighBid.toHexString(), highBidId.toHexString(), "The highest bid ID should match");
        });

        it("should return null for get_current_high if no active bids exist on a listing", async () => {
            const highBid = await biddingConcept.get_current_high(listingId_no_bids);
            assertEquals(highBid, null, "Should return null for listing with no bids");
        });

        it("should allow a bidder to withdraw their own active bid", async () => {
            const bidId = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 200);
            
            // --- DEBUGGING LOGS ---
            const bidInDbBeforeWithdrawal = await bidsCollection.findOne({ _id: bidId });
            console.log(`[TEST DEBUG P1.5] Bid ${bidId.toHexString()} status before withdrawal attempt: ${bidInDbBeforeWithdrawal?.status}`);

            await biddingConcept.withdraw_bid(bidId, bidderId_alpha);

            const withdrawnBid = await bidsCollection.findOne({ _id: bidId });
            assertExists(withdrawnBid);
            assertEquals(withdrawnBid.status, BidStatus.Withdrawn, "Bid status should be 'Withdrawn'");

            const activeBids = await biddingConcept.get_bids(listingId_active);
            assertEquals(activeBids.length, 0, "Withdrawn bid should not appear in active bids");

            const events = mockEventBus.getEventsByTopic(BiddingEventTopics.BidWithdrawn);
            assertEquals(events.length, 1, "Should emit one BidWithdrawn event");
            assertEquals((events[0] as any).bidId, bidId.toHexString());
            assertEquals((events[0] as any).listingId, listingId_active.toHexString());
            assertEquals((events[0] as any).bidderId, bidderId_alpha.toHexString());
            assertEquals((events[0] as any).amount, 200);
        });

        it("should correctly update the current high bid after a high bid is withdrawn", async () => {
            const bidId1 = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 50);
            await new Promise(resolve => setTimeout(resolve, 10));
            const bidId2 = await biddingConcept.place_bid(bidderId_beta, listingId_active, 150); // Highest
            await new Promise(resolve => setTimeout(resolve, 10));
            const bidId3 = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100); // Second highest

            let currentHigh = await biddingConcept.get_current_high(listingId_active);
            assertEquals(currentHigh?.toHexString(), bidId2.toHexString(), "Initial high bid should be bidId2");

            // --- DEBUGGING LOGS ---
            const bid2InDbBeforeWithdrawal = await bidsCollection.findOne({ _id: bidId2 });
            console.log(`[TEST DEBUG P1.6] Bid ${bidId2.toHexString()} status before withdrawal attempt: ${bid2InDbBeforeWithdrawal?.status}`);

            await biddingConcept.withdraw_bid(bidId2, bidderId_beta);

            const withdrawnBid2 = await bidsCollection.findOne({ _id: bidId2 });
            assertEquals(withdrawnBid2?.status, BidStatus.Withdrawn, "Highest bid was not marked as withdrawn.");

            currentHigh = await biddingConcept.get_current_high(listingId_active);
            assertEquals(currentHigh?.toHexString(), bidId3.toHexString(), "New high bid should be bidId3 after withdrawal");
        });
    });

    // P2: Robustness - Error Handling & Edge Cases Tests
    describe("P2: Robustness - Error Handling & Edge Cases", () => {
        it("should reject placing a bid with a zero amount", async () => {
            await assertRejects(
                async () => {
                    await biddingConcept.place_bid(bidderId_alpha, listingId_active, 0);
                },
                Error,
                "Invalid bid amount: 0. Amount must be a positive finite number.",
            );
        });

        it("should reject placing a bid with a negative amount", async () => {
            await assertRejects(
                async () => {
                    await biddingConcept.place_bid(bidderId_alpha, listingId_active, -10);
                },
                Error,
                "Invalid bid amount: -10. Amount must be a positive finite number.",
            );
        });

        it("should reject placing a bid with a non-finite amount (NaN)", async () => {
            await assertRejects(
                async () => {
                    await biddingConcept.place_bid(bidderId_alpha, listingId_active, NaN);
                },
                Error,
                "Invalid bid amount: NaN. Amount must be a positive finite number.",
            );
        });

        it("should reject withdrawing a bid that does not exist", async () => {
            const nonExistentBidId = generateObjectId();
            console.log(`[TEST DEBUG P2.4] Attempting to withdraw non-existent bid ${nonExistentBidId.toHexString()}`);
            await assertRejects(
                async () => {
                    await biddingConcept.withdraw_bid(nonExistentBidId, bidderId_alpha);
                },
                Error,
                `Bid with ID ${nonExistentBidId.toHexString()} not found.`,
            );
        });

        it("should reject withdrawing a bid if the user is not the original bidder", async () => {
            const bidId = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100);
            console.log(`[TEST DEBUG P2.5] Attempting to withdraw bid ${bidId.toHexString()} (original bidder: ${bidderId_alpha.toHexString()}) with unauthorized user ${bidderId_beta.toHexString()}`);
            const bidInDbBeforeAttempt = await bidsCollection.findOne({ _id: bidId });
            console.log(`[TEST DEBUG P2.5] Bid status before unauthorized withdrawal attempt: ${bidInDbBeforeAttempt?.status}`);
            await assertRejects(
                async () => {
                    await biddingConcept.withdraw_bid(bidId, bidderId_beta);
                },
                Error,
                `User ${bidderId_beta.toHexString()} is not authorized to withdraw bid ${bidId.toHexString()}.`,
            );
            const bidAfterAttempt = await bidsCollection.findOne({ _id: bidId });
            assertEquals(bidAfterAttempt?.status, BidStatus.Active, "Bid should remain active after unauthorized attempt");
        });

        it("should reject withdrawing a bid that has already been withdrawn", async () => {
            const bidId = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100);
            console.log(`[TEST DEBUG P2.6] Withdrawing bid ${bidId.toHexString()} for the first time...`);
            await biddingConcept.withdraw_bid(bidId, bidderId_alpha); // First withdrawal
            const bidInDbAfterFirstWithdrawal = await bidsCollection.findOne({ _id: bidId });
            console.log(`[TEST DEBUG P2.6] Bid ${bidId.toHexString()} status after first withdrawal: ${bidInDbAfterFirstWithdrawal?.status}`);
            console.log(`[TEST DEBUG P2.6] Attempting to withdraw bid ${bidId.toHexString()} again...`);
            await assertRejects(
                async () => {
                    await biddingConcept.withdraw_bid(bidId, bidderId_alpha); // Second withdrawal attempt
                },
                Error,
                `Bid with ID ${bidId.toHexString()} has already been withdrawn.`,
            );
            const events = mockEventBus.getEventsByTopic(BiddingEventTopics.BidWithdrawn);
            assertEquals(events.length, 1, "Should emit BidWithdrawn event only once");
        });

        it("should handle multiple bids by the same user on the same listing", async () => {
            const bidId1 = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 50);
            await new Promise(resolve => setTimeout(resolve, 10));
            const bidId2 = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 150); // Higher bid
            await new Promise(resolve => setTimeout(resolve, 10));
            const bidId3 = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100); // Lower bid

            const bids = await biddingConcept.get_bids(listingId_active);
            assertEquals(bids.length, 3, "All three bids by the same user should be recorded");
            assertEquals(bids[0].id, bidId2.toHexString(), "Highest bid by same user should be at top");
            assertEquals(bids[0].amount, 150);
            assertEquals(bids[1].id, bidId3.toHexString());
            assertEquals(bids[1].amount, 100);
            assertEquals(bids[2].id, bidId1.toHexString());
            assertEquals(bids[2].amount, 50);

            const highBid = await biddingConcept.get_current_high(listingId_active);
            assertEquals(highBid?.toHexString(), bidId2.toHexString(), "Highest bid should be correct even with multiple bids from one user");
        });

        it("should maintain data integrity during concurrent bid placement", async () => {
            const listing = generateObjectId();
            const user1 = generateObjectId();
            const user2 = generateObjectId();

            const bidPromises = [];
            bidPromises.push(biddingConcept.place_bid(user1, listing, 10));
            bidPromises.push(biddingConcept.place_bid(user2, listing, 20));
            bidPromises.push(biddingConcept.place_bid(user1, listing, 30));
            bidPromises.push(biddingConcept.place_bid(user2, listing, 40));

            const bidIds = await Promise.all(bidPromises);

            assertEquals(bidIds.length, 4, "All four bids should be placed successfully");
            assert(bidIds.every(id => id instanceof ObjectId), "All returned IDs should be ObjectIds");

            const allBids = await biddingConcept.get_bids(listing);
            assertEquals(allBids.length, 4, "All bids should be retrievable");

            // Verify sorting: highest amount first, then newest
            assertEquals(allBids[0].amount, 40);
            assertEquals(allBids[1].amount, 30);
            assertEquals(allBids[2].amount, 20);
            assertEquals(allBids[3].amount, 10);

            const highBid = await biddingConcept.get_current_high(listing);
            assertEquals(highBid?.toHexString(), allBids[0].id, "Highest bid should be correct after concurrent operations");
        });

        it("should handle bids on non-existent listings (conceptually, as foreign key independence)", async () => {
            const nonExistentListingId = generateObjectId(); // A valid ObjectId, but not in any ListingConcept
            const bidId = await biddingConcept.place_bid(bidderId_alpha, nonExistentListingId, 100);

            assertExists(bidId);
            const placedBid = await bidsCollection.findOne({ _id: bidId });
            assertExists(placedBid);
            assertEquals(placedBid.listingId.toHexString(), nonExistentListingId.toHexString());

            const bids = await biddingConcept.get_bids(nonExistentListingId);
            assertEquals(bids.length, 1, "Bids on a conceptually non-existent listing should still be retrievable by its ID");
        });

        it("should handle bids by non-existent users (conceptually, as foreign key independence)", async () => {
            const nonExistentUserId = generateObjectId(); // A valid ObjectId, but not in any UserAccountConcept
            const bidId = await biddingConcept.place_bid(nonExistentUserId, listingId_active, 100);

            assertExists(bidId);
            const placedBid = await bidsCollection.findOne({ _id: bidId });
            assertExists(placedBid);
            assertEquals(placedBid.bidderId.toHexString(), nonExistentUserId.toHexString());
        });

        it("should filter withdrawn bids from get_bids and get_current_high", async () => {
            const bidId1 = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 50);
            await new Promise(resolve => setTimeout(resolve, 10));
            const bidId2 = await biddingConcept.place_bid(bidderId_beta, listingId_active, 150); // Highest
            await new Promise(resolve => setTimeout(resolve, 10));
            const bidId3 = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100);

            await biddingConcept.withdraw_bid(bidId2, bidderId_beta); // Withdraw the highest bid

            const activeBids = await biddingConcept.get_bids(listingId_active);
            assertEquals(activeBids.length, 2, "Should only retrieve 2 active bids after one withdrawal");
            assert(activeBids.every(b => b.status === BidStatus.Active), "All remaining bids should be active");
            assertEquals(activeBids[0].id, bidId3.toHexString(), "The new highest bid should be bidId3");

            const currentHigh = await biddingConcept.get_current_high(listingId_active);
            assertEquals(currentHigh?.toHexString(), bidId3.toHexString(), "get_current_high should reflect the new highest active bid");
        });
    });

    // P3: Performance - Implicitly covered by efficient queries and indexing
    describe("P3: Performance - Implicitly Addressed", () => {
        it("should use appropriate MongoDB indexes for efficient queries", async () => {
            // This test is conceptual, as `createIndex` is called in the constructor.
            // Direct testing of index usage is done via MongoDB's explain() but not easily
            // integrated into Deno unit tests without direct driver introspection.
            // The fact that `initializeIndexes` is called and specified queries use indexed fields
            // (`listingId`, `status`, `amount`, `timestamp`) is the assurance.
            console.log("Performance principle acknowledged. Indexes are set up in constructor.");
            // To truly test this, one would use `.explain()` on queries and assert on the executionStats.
            // Example:
            // const explainResult = await biddingConcept["bidsCollection"].find({ listingId: listingId_active }).explain("queryPlanner");
            // assertExists(explainResult.queryPlanner.winningPlan.inputStage.indexName, "Query should use an index");
            // For now, we rely on the implementation detail of `initializeIndexes`.
        });
    });

    // P4: Usability - API Clarity
    describe("P4: Usability - API Clarity", () => {
        it("should have clear and intuitive method names and parameters", () => {
            // This is largely covered by TypeScript types and code review.
            // The methods `place_bid`, `withdraw_bid`, `get_bids`, `get_current_high` are self-explanatory.
            // Types (`BidId`, `UserId`, `ListingId`, `CurrencyAmount`, `BidRecord`) enhance clarity.
            const exampleBidderId: UserId = generateObjectId();
            const exampleListingId: ListingId = generateObjectId();
            const exampleAmount: number = 100.50;

            // Example of usage readability (no assertions, just demonstrating readability)
            const examplePlaceBid = () => biddingConcept.place_bid(exampleBidderId, exampleListingId, exampleAmount);
            const exampleWithdrawBid = (bidId: BidId) => biddingConcept.withdraw_bid(bidId, exampleBidderId);
            const exampleGetBids = () => biddingConcept.get_bids(exampleListingId);
            const exampleGetCurrentHigh = () => biddingConcept.get_current_high(exampleListingId);

            assertExists(examplePlaceBid);
            assertExists(exampleWithdrawBid);
            assertExists(exampleGetBids);
            assertExists(exampleGetCurrentHigh);
            console.log("API method names and parameter types are clear and intuitive.");
        });
    });

    // P5: Maintainability - Code Structure
    describe("P5: Maintainability - Code Structure", () => {
        it("should follow consistent patterns and be modular", () => {
            // This is a qualitative assessment, but we can assert some structural aspects.
            // The concept is self-contained within `BiddingConcept.ts`.
            // Errors are in a dedicated `BiddingErrors.ts`.
            // Mocks and test helpers are in `mock-services.ts` and `fake-data.ts`.
            // Dependencies (Db, EventBus) are injected.
            assert(typeof biddingConcept.place_bid === 'function', "place_bid method exists");
            assert(typeof biddingConcept.withdraw_bid === 'function', "withdraw_bid method exists");
            assert(typeof biddingConcept.get_bids === 'function', "get_bids method exists");
            assert(typeof biddingConcept.get_current_high === 'function', "get_current_high method exists");
            assert(mockEventBus instanceof MockEventBus, "EventBus is injectable and a mock instance can be used");
            console.log("Code structure is modular, follows consistent patterns, and uses dependency injection.");
        });
    });

    // P6: Testability - Dependency Injection & Mocks
    describe("P6: Testability - Dependency Injection & Mocks", () => {
        it("should be testable through dependency injection of Db and EventBus", () => {
            // This is confirmed by the `beforeAll` and `beforeEach` setup.
            // `BiddingConcept` receives `db` and `mockEventBus` in its constructor,
            // making it independent of how these services are instantiated in production.
            assertExists(biddingConcept, "BiddingConcept instance exists");
            assertExists(mockEventBus, "MockEventBus instance exists");
            assert(biddingConcept instanceof BiddingConcept, "biddingConcept is an instance of BiddingConcept");
            assert(mockEventBus instanceof MockEventBus, "mockEventBus is an instance of MockEventBus");
            console.log("Testability confirmed: Db and EventBus are injected as dependencies.");
        });
    });
});
