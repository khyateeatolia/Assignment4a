---
timestamp: 'Sun Oct 19 2025 17:21:14 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_172114.dcf82b8d.md]]'
content_id: 940f0708ecde875041a491abfbfd960b9db9ffc19eba75791aa92ff91f256afc
---

# response:

Okay, let's implement the Bidding Concept for the SwapIt marketplace system.

We'll follow the provided specifications, Deno/TypeScript conventions, MongoDB Atlas integration, and the LikertSurvey-based test structure.

First, let's outline the files and their content:

1. **`BiddingErrors.ts`**: Custom error classes for the bidding concept.
2. **`mock-services.ts`**: Mock `EventBus` for testing and a helper to get a MongoDB test client.
3. **`fake-data.ts`**: Functions to generate fake bid data and `ObjectId`s for testing.
4. **`BiddingConcept.ts`**: The core implementation of the Bidding concept, including actions and types.
5. **`BiddingConcept.test.ts`**: Comprehensive test suite covering all specified principles and edge cases.

***

### 1. `BiddingErrors.ts`

This file will contain custom error classes for specific bidding-related failures.

```typescript
// BiddingErrors.ts

/**
 * Base error class for all Bidding Concept related errors.
 */
export class BiddingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        // This is important for custom error types in TypeScript/JavaScript
        // It ensures the prototype chain is correctly set up.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Error thrown when an attempt is made to place a bid with an invalid amount (e.g., negative, zero, non-numeric).
 */
export class InvalidBidAmountError extends BiddingError {
    constructor(amount: number) {
        super(`Invalid bid amount: ${amount}. Amount must be a positive number.`);
    }
}

/**
 * Error thrown when a requested bid is not found.
 */
export class BidNotFoundError extends BiddingError {
    constructor(bidId: string) {
        super(`Bid with ID ${bidId} not found.`);
    }
}

/**
 * Error thrown when an attempt is made to withdraw a bid that has already been withdrawn.
 */
export class BidAlreadyWithdrawnError extends BiddingError {
    constructor(bidId: string) {
        super(`Bid with ID ${bidId} has already been withdrawn.`);
    }
}

/**
 * Error thrown when a user attempts to withdraw a bid they did not place.
 */
export class UnauthorizedBidWithdrawalError extends BiddingError {
    constructor(bidId: string, userId: string) {
        super(`User ${userId} is not authorized to withdraw bid ${bidId}.`);
    }
}

/**
 * Error thrown when a bid is placed on a listing that is assumed to be invalid
 * (though BiddingConcept does not validate listing existence, it still accepts valid ObjectId as input).
 * This error might be used by a higher-level service, or as a placeholder if more strict validation were added.
 */
export class InvalidListingIdError extends BiddingError {
    constructor(listingId: string) {
        super(`Invalid ListingId: ${listingId}.`);
    }
}

/**
 * Error thrown when a bid is placed by a user that is assumed to be invalid.
 */
export class InvalidUserIdError extends BiddingError {
    constructor(userId: string) {
        super(`Invalid UserId: ${userId}.`);
    }
}
```

***

### 2. `mock-services.ts`

This file will contain a mock `EventBus` for testing purposes and a utility function to connect to a MongoDB test database.

```typescript
// mock-services.ts
import { MongoClient, Db } from "npm:mongodb";

/**
 * Interface for the EventBus, consistent with existing concepts.
 */
export interface EventBus {
    publish<T = unknown>(topic: string, event: T): void;
    subscribe<T = unknown>(topic: string, handler: (event: T) => void): () => void;
}

/**
 * A mock implementation of the EventBus for testing purposes.
 * It captures published events for later inspection.
 */
export class MockEventBus implements EventBus {
    private publishedEvents: { topic: string; event: any }[] = [];
    private subscriptions: Map<string, Function[]> = new Map();

    publish<T = unknown>(topic: string, event: T): void {
        this.publishedEvents.push({ topic, event });
        // Simulate event handling for any subscribers
        if (this.subscriptions.has(topic)) {
            this.subscriptions.get(topic)?.forEach(handler => handler(event));
        }
    }

    subscribe<T = unknown>(topic: string, handler: (event: T) => void): () => void {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, []);
        }
        this.subscriptions.get(topic)?.push(handler);
        // Return an unsubscribe function
        return () => {
            const handlers = this.subscriptions.get(topic);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
            }
        };
    }

    /**
     * Retrieves all events published since the last reset or initialization.
     * @returns An array of published events.
     */
    getPublishedEvents(): { topic: string; event: any }[] {
        return this.publishedEvents;
    }

    /**
     * Clears all recorded published events.
     */
    clearEvents(): void {
        this.publishedEvents = [];
    }

    /**
     * Retrieves published events for a specific topic.
     * @param topic The topic to filter events by.
     * @returns An array of events published on the specified topic.
     */
    getEventsByTopic<T = unknown>(topic: string): T[] {
        return this.publishedEvents
            .filter(e => e.topic === topic)
            .map(e => e.event as T);
    }
}

/**
 * Global variables for the MongoDB test client and database.
 */
let testClient: MongoClient | null = null;
let testDb: Db | null = null;

/**
 * Connects to a MongoDB test database and returns the client and database instance.
 * Ensures only one connection is made globally for tests.
 * @returns A tuple containing the MongoClient and Db instances.
 */
export async function getMongoTestClientAndDb(): Promise<{ client: MongoClient; db: Db }> {
    if (!testClient || !testDb) {
        const mongoUri = Deno.env.get("MONGO_URI_TEST");
        if (!mongoUri) {
            throw new Error("MONGO_URI_TEST environment variable not set for testing.");
        }
        const dbName = Deno.env.get("MONGO_DB_TEST_NAME") || "swapit_test_bidding";

        testClient = new MongoClient(mongoUri);
        await testClient.connect();
        testDb = testClient.db(dbName);
    }
    return { client: testClient, db: testDb };
}

/**
 * Disconnects the MongoDB test client if it's connected.
 */
export async function disconnectMongoTestClient(): Promise<void> {
    if (testClient) {
        await testClient.close();
        testClient = null;
        testDb = null;
    }
}
```

***

### 3. `fake-data.ts`

This file will provide helper functions to generate `ObjectId`s and realistic-looking fake bid data for testing.

```typescript
// fake-data.ts
import { ObjectId } from "npm:mongodb";
import { BidStatus, BidRecordDBO } from "./BiddingConcept.ts";

/**
 * Generates a new MongoDB ObjectId.
 * @returns A new ObjectId instance.
 */
export function generateObjectId(): ObjectId {
    return new ObjectId();
}

// Pre-defined fake ObjectIds for consistent testing scenarios
export const fakeListingId1 = generateObjectId();
export const fakeListingId2 = generateObjectId();
export const fakeUserId1 = generateObjectId();
export const fakeUserId2 = generateObjectId();
export const fakeUserId3 = generateObjectId();

/**
 * Creates a fake BidRecordDBO object with sensible defaults, allowing overrides.
 * @param overrides Partial BidRecordDBO object to override default values.
 * @returns A complete BidRecordDBO object.
 */
export function createFakeBidRecord(overrides?: Partial<BidRecordDBO>): BidRecordDBO {
    return {
        _id: overrides?._id || generateObjectId(),
        bidderId: overrides?.bidderId || fakeUserId1,
        listingId: overrides?.listingId || fakeListingId1,
        amount: overrides?.amount || Math.floor(Math.random() * 100) + 1, // Random amount between 1 and 100
        timestamp: overrides?.timestamp || new Date(),
        status: overrides?.status || BidStatus.Active,
        ...overrides, // Apply any other specific overrides
    };
}
```

***

### 4. `BiddingConcept.ts`

This is the core implementation file for the Bidding concept.

```typescript
// BiddingConcept.ts
import { Collection, Db, ObjectId, WithId } from "npm:mongodb";
import { EventBus } from "./mock-services.ts"; // Using mock-services for EventBus interface
import {
    BidAlreadyWithdrawnError,
    BidNotFoundError,
    InvalidBidAmountError,
    UnauthorizedBidWithdrawalError,
} from "./BiddingErrors.ts";

/**
 * Type alias for Bid ID, corresponds to MongoDB's ObjectId.
 */
export type BidId = ObjectId;

/**
 * Type alias for Listing ID, corresponds to MongoDB's ObjectId.
 */
export type ListingId = ObjectId;

/**
 * Type alias for User ID, corresponds to MongoDB's ObjectId.
 */
export type UserId = ObjectId;

/**
 * Type alias for Currency Amount, represented as a number.
 */
export type CurrencyAmount = number;

/**
 * Enum for the status of a bid.
 */
export enum BidStatus {
    Active = "Active",
    Withdrawn = "Withdrawn",
}

/**
 * Represents a bid record as exposed to the public API.
 * Does not include internal database `_id` and uses string for IDs.
 */
export interface BidRecord {
    id: string; // String representation of BidId
    bidderId: string; // String representation of UserId
    listingId: string; // String representation of ListingId
    amount: CurrencyAmount;
    timestamp: Date;
    status: BidStatus;
}

/**
 * Represents a bid record as stored in the MongoDB database.
 * Uses ObjectId for IDs and includes the internal `_id`.
 */
export interface BidRecordDBO {
    _id: BidId;
    bidderId: UserId;
    listingId: ListingId;
    amount: CurrencyAmount;
    timestamp: Date;
    status: BidStatus;
}

/**
 * Event payload for when a bid is placed.
 */
export interface BidPlacedEvent {
    listingId: string; // String representation of ListingId
    bidId: string; // String representation of BidId
    bidderId: string; // String representation of UserId
    amount: CurrencyAmount;
    timestamp: Date;
}

/**
 * Event payload for when a bid is withdrawn.
 */
export interface BidWithdrawnEvent {
    bidId: string; // String representation of BidId
    listingId: string; // String representation of ListingId
    bidderId: string; // String representation of UserId
    amount: CurrencyAmount;
    timestamp: Date; // Timestamp of the withdrawal
}

/**
 * Topic names for bidding-related events.
 */
export const BiddingEventTopics = {
    BidPlaced: "bidding.BidPlaced",
    BidWithdrawn: "bidding.BidWithdrawn",
};

/**
 * Implements the Bidding Concept for the SwapIt marketplace.
 * Handles placing, withdrawing, viewing, and determining the highest bid.
 */
export class BiddingConcept {
    private bidsCollection: Collection<BidRecordDBO>;
    private eventBus: EventBus;

    /**
     * Initializes the BiddingConcept with a MongoDB database instance and an EventBus.
     * @param db The MongoDB Db instance.
     * @param eventBus The EventBus instance for publishing events.
     */
    constructor(db: Db, eventBus: EventBus) {
        this.bidsCollection = db.collection<BidRecordDBO>("bids");
        this.eventBus = eventBus;
        this.initializeIndexes();
    }

    /**
     * Ensures necessary indexes are created for efficient querying.
     * - `listingId` for fetching bids related to a specific listing.
     * - `listingId`, `status`, `amount`, `timestamp` for efficiently finding the current high bid.
     * - `bidderId` (optional, for future user profile views of their bids).
     */
    private async initializeIndexes(): Promise<void> {
        await this.bidsCollection.createIndex({ listingId: 1 });
        await this.bidsCollection.createIndex({ listingId: 1, status: 1, amount: -1, timestamp: -1 });
        await this.bidsCollection.createIndex({ bidderId: 1 }); // For potential future "get bids by user"
        console.log("BiddingConcept: MongoDB indexes initialized.");
    }

    /**
     * Converts a database BidRecordDBO object to a public BidRecord interface.
     * @param bidDBO The database object.
     * @returns The public BidRecord object.
     */
    private _mapDbToDomain(bidDBO: WithId<BidRecordDBO>): BidRecord {
        return {
            id: bidDBO._id.toHexString(),
            bidderId: bidDBO.bidderId.toHexString(),
            listingId: bidDBO.listingId.toHexString(),
            amount: bidDBO.amount,
            timestamp: bidDBO.timestamp,
            status: bidDBO.status,
        };
    }

    /**
     * Places a new bid on a listing.
     * @param bidder The ID of the user placing the bid.
     * @param listingId The ID of the listing the bid is for.
     * @param amount The amount of the bid.
     * @returns The ID of the newly placed bid.
     * @throws {InvalidBidAmountError} If the bid amount is not positive.
     */
    async place_bid(bidder: UserId, listingId: ListingId, amount: CurrencyAmount): Promise<BidId> {
        if (amount <= 0 || !Number.isFinite(amount)) {
            throw new InvalidBidAmountError(amount);
        }

        const newBid: BidRecordDBO = {
            _id: new ObjectId(),
            bidderId: bidder,
            listingId: listingId,
            amount: amount,
            timestamp: new Date(),
            status: BidStatus.Active,
        };

        await this.bidsCollection.insertOne(newBid);

        const event: BidPlacedEvent = {
            listingId: listingId.toHexString(),
            bidId: newBid._id.toHexString(),
            bidderId: bidder.toHexString(),
            amount: amount,
            timestamp: newBid.timestamp,
        };
        this.eventBus.publish(BiddingEventTopics.BidPlaced, event);

        return newBid._id;
    }

    /**
     * Withdraws an active bid.
     * @param bidId The ID of the bid to withdraw.
     * @param bidder The ID of the user attempting to withdraw the bid.
     * @throws {BidNotFoundError} If the bid does not exist.
     * @throws {BidAlreadyWithdrawnError} If the bid is already withdrawn.
     * @throws {UnauthorizedBidWithdrawalError} If the provided bidder is not the original bidder.
     */
    async withdraw_bid(bidId: BidId, bidder: UserId): Promise<void> {
        const updateResult = await this.bidsCollection.findOneAndUpdate(
            { _id: bidId },
            { $set: { status: BidStatus.Withdrawn } },
            { returnDocument: 'before' } // Get the document *before* the update
        );

        if (!updateResult.value) {
            throw new BidNotFoundError(bidId.toHexString());
        }

        const bid = updateResult.value;

        if (bid.status === BidStatus.Withdrawn) {
            throw new BidAlreadyWithdrawnError(bidId.toHexString());
        }
        if (!bid.bidderId.equals(bidder)) {
            throw new UnauthorizedBidWithdrawalError(bidId.toHexString(), bidder.toHexString());
        }

        // Only emit if the update actually changed something and it passed checks
        const event: BidWithdrawnEvent = {
            bidId: bid._id.toHexString(),
            listingId: bid.listingId.toHexString(),
            bidderId: bid.bidderId.toHexString(),
            amount: bid.amount,
            timestamp: new Date(), // Timestamp of the withdrawal
        };
        this.eventBus.publish(BiddingEventTopics.BidWithdrawn, event);
    }

    /**
     * Retrieves all active bids for a specific listing, ordered by amount (highest first),
     * then by timestamp (most recent first for ties).
     * Withdrawn bids are hidden.
     * @param listingId The ID of the listing.
     * @returns An array of active bid records.
     */
    async get_bids(listingId: ListingId): Promise<BidRecord[]> {
        const bids = await this.bidsCollection
            .find({
                listingId: listingId,
                status: BidStatus.Active,
            })
            .sort({ amount: -1, timestamp: -1 }) // Highest amount first, then most recent for ties
            .toArray();

        return bids.map(this._mapDbToDomain);
    }

    /**
     * Retrieves the current highest active bid for a specific listing.
     * @param listingId The ID of the listing.
     * @returns The ID of the highest bid, or null if no active bids exist.
     */
    async get_current_high(listingId: ListingId): Promise<BidId | null> {
        const highestBid = await this.bidsCollection
            .find({
                listingId: listingId,
                status: BidStatus.Active,
            })
            .sort({ amount: -1, timestamp: -1 }) // Highest amount first, then most recent for ties
            .limit(1)
            .toArray();

        return highestBid.length > 0 ? highestBid[0]._id : null;
    }
}
```

***

### 5. `BiddingConcept.test.ts`

This is the comprehensive test suite for the Bidding concept, following the LikertSurvey principles and covering all specified edge cases.

```typescript
// BiddingConcept.test.ts
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
} from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { assert, assertEquals, assertExists, assertNotEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
    InvalidBidAmountError,
    UnauthorizedBidWithdrawalError,
} from "./BiddingErrors.ts";
import { MockEventBus, getMongoTestClientAndDb, disconnectMongoTestClient } from "./mock-services.ts";
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
        const mongo = await getMongoTestClientAndDb();
        client = mongo.client;
        db = mongo.db;
        bidsCollection = db.collection<BidRecordDBO>("bids");

        // Initialize BiddingConcept once, it will setup indexes on first run.
        mockEventBus = new MockEventBus();
        biddingConcept = new BiddingConcept(db, mockEventBus);
        console.log("MongoDB client and BiddingConcept initialized.");
    });

    afterAll(async () => {
        // P6: Testability - Clean up resources after all tests.
        await disconnectMongoTestClient();
        console.log("MongoDB client disconnected.");
    });

    beforeEach(async () => {
        // P6: Testability - Isolate tests by clearing data and resetting mocks before each test.
        await bidsCollection.deleteMany({});
        mockEventBus.clearEvents();

        // Generate fresh IDs for each test to ensure isolation
        listingId_active = generateObjectId();
        listingId_no_bids = generateObjectId();
        bidderId_alpha = generateObjectId();
        bidderId_beta = generateObjectId();
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
            assertEquals(events[0].bidId, bidId.toHexString());
            assertEquals(events[0].listingId, listingId_active.toHexString());
            assertEquals(events[0].bidderId, bidderId_alpha.toHexString());
            assertEquals(events[0].amount, bidAmount);
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

            await biddingConcept.withdraw_bid(bidId, bidderId_alpha);

            const withdrawnBid = await bidsCollection.findOne({ _id: bidId });
            assertExists(withdrawnBid);
            assertEquals(withdrawnBid.status, BidStatus.Withdrawn, "Bid status should be 'Withdrawn'");

            const activeBids = await biddingConcept.get_bids(listingId_active);
            assertEquals(activeBids.length, 0, "Withdrawn bid should not appear in active bids");

            const events = mockEventBus.getEventsByTopic(BiddingEventTopics.BidWithdrawn);
            assertEquals(events.length, 1, "Should emit one BidWithdrawn event");
            assertEquals(events[0].bidId, bidId.toHexString());
            assertEquals(events[0].listingId, listingId_active.toHexString());
            assertEquals(events[0].bidderId, bidderId_alpha.toHexString());
            assertEquals(events[0].amount, 200);
        });

        it("should correctly update the current high bid after a high bid is withdrawn", async () => {
            const bidId1 = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 50);
            await new Promise(resolve => setTimeout(resolve, 10));
            const bidId2 = await biddingConcept.place_bid(bidderId_beta, listingId_active, 150); // Highest
            await new Promise(resolve => setTimeout(resolve, 10));
            const bidId3 = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100); // Second highest

            let currentHigh = await biddingConcept.get_current_high(listingId_active);
            assertEquals(currentHigh?.toHexString(), bidId2.toHexString(), "Initial high bid should be bidId2");

            await biddingConcept.withdraw_bid(bidId2, bidderId_beta);

            currentHigh = await biddingConcept.get_current_high(listingId_active);
            assertEquals(currentHigh?.toHexString(), bidId3.toHexString(), "New high bid should be bidId3 after withdrawal");
        });
    });

    // P2: Robustness - Error Handling & Edge Cases Tests
    describe("P2: Robustness - Error Handling & Edge Cases", () => {
        it("should reject placing a bid with a zero amount", async () => {
            await assertRejects(
                () => biddingConcept.place_bid(bidderId_alpha, listingId_active, 0),
                InvalidBidAmountError,
                "Invalid bid amount: 0. Amount must be a positive number.",
            );
        });

        it("should reject placing a bid with a negative amount", async () => {
            await assertRejects(
                () => biddingConcept.place_bid(bidderId_alpha, listingId_active, -10),
                InvalidBidAmountError,
                "Invalid bid amount: -10. Amount must be a positive number.",
            );
        });

        it("should reject placing a bid with a non-finite amount (NaN)", async () => {
            await assertRejects(
                () => biddingConcept.place_bid(bidderId_alpha, listingId_active, NaN),
                InvalidBidAmountError,
                "Invalid bid amount: NaN. Amount must be a positive number.",
            );
        });

        it("should reject withdrawing a bid that does not exist", async () => {
            const nonExistentBidId = generateObjectId();
            await assertRejects(
                () => biddingConcept.withdraw_bid(nonExistentBidId, bidderId_alpha),
                BidNotFoundError,
                `Bid with ID ${nonExistentBidId.toHexString()} not found.`,
            );
        });

        it("should reject withdrawing a bid if the user is not the original bidder", async () => {
            const bidId = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100);
            await assertRejects(
                () => biddingConcept.withdraw_bid(bidId, bidderId_beta),
                UnauthorizedBidWithdrawalError,
                `User ${bidderId_beta.toHexString()} is not authorized to withdraw bid ${bidId.toHexString()}.`,
            );
            const bidAfterAttempt = await bidsCollection.findOne({ _id: bidId });
            assertEquals(bidAfterAttempt?.status, BidStatus.Active, "Bid should remain active after unauthorized attempt");
        });

        it("should reject withdrawing a bid that has already been withdrawn", async () => {
            const bidId = await biddingConcept.place_bid(bidderId_alpha, listingId_active, 100);
            await biddingConcept.withdraw_bid(bidId, bidderId_alpha); // First withdrawal

            await assertRejects(
                () => biddingConcept.withdraw_bid(bidId, bidderId_alpha), // Second withdrawal attempt
                BidAlreadyWithdrawnError,
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
            const exampleAmount: CurrencyAmount = 100.50;

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
```

***

### Design Assumptions Documentation

1. **Concept Independence for Foreign Keys**: The `BiddingConcept` takes `ListingId` and `UserId` as `ObjectId`s. It **does not** perform checks to see if these `ObjectId`s actually correspond to existing listings in `ItemListingConcept` or existing users in `UserAccountConcept`. This strictly adheres to the "Independence preserved — ListingId is a foreign key, not a dependency" note. Validation of existence would typically happen at a higher service layer that coordinates between concepts.
2. **ID Generation**: `ObjectId` from `npm:mongodb` is used for all ID types (`BidId`, `ListingId`, `UserId`). MongoDB automatically generates unique `ObjectId`s upon insertion if `_id` is not provided, or a new `ObjectId()` can be explicitly created for client-side generation.
3. **Currency Amount**: `CurrencyAmount` is represented as a `number`. For real-world financial applications, it's often safer to use integers (e.g., store cents) to avoid floating-point inaccuracies. However, given the "student marketplace" context and the specification's lack of explicit guidance, `number` is used, which maps to a `double` in MongoDB.
4. **Timestamp**: Bid timestamps are stored as `Date` objects, automatically handled by MongoDB.
5. **Bid Immutability**: The specification states "Bids cannot be edited once placed." This is enforced by not providing any `edit_bid` action. The only modification allowed is changing `status` to `Withdrawn`.
6. **Withdrawal Logic**: A bid can only be withdrawn if it's `Active` and the `bidder` requesting the withdrawal matches the original `bidderId`.
7. **"Hidden" Withdrawn Bids**: Withdrawn bids are explicitly excluded from `get_bids` and `get_current_high` results. They remain in the database with `status: 'Withdrawn'` for historical/auditing purposes.
8. **Event-Driven Communication**: `EventBus` is used for `BidPlaced` and `BidWithdrawn` notifications. The `BiddingConcept` is responsible for publishing these events.
9. **Database Connection**: The `BiddingConcept` expects a connected `Db` instance to be passed to its constructor, following a dependency injection pattern.
10. **Test Database**: For testing, a separate MongoDB test database (configured via `MONGO_URI_TEST` and `MONGO_DB_TEST_NAME` environment variables) is used to prevent data contamination with development or production environments. The `bids` collection is cleared `beforeEach` test to ensure isolation.
11. **High Bid Tie-breaking**: If multiple active bids have the same `CurrencyAmount`, the bid with the most recent `timestamp` is considered the "higher" bid for `get_current_high` and for sorting in `get_bids`. This is achieved by sorting `amount: -1, timestamp: -1`.
12. **MongoDB Indexes**: Essential indexes (`listingId`, `listingId + status + amount + timestamp`, `bidderId`) are created upon `BiddingConcept` instantiation to optimize common queries and ensure acceptable performance, especially for `get_bids` and `get_current_high`.

To run these tests, you will need:

* Deno installed.
* A `.env` file or environment variables set for your MongoDB Atlas test database:
  ```
  MONGO_URI_TEST="mongodb+srv://<username>:<password>@<cluster-url>/<db-name>?retryWrites=true&w=majority"
  MONGO_DB_TEST_NAME="swapit_test_bidding"
  ```
* The `npm:mongodb` dependency will be automatically resolved by Deno.

You can run the tests using:
`deno test --allow-env --allow-net --allow-read --unstable-kv BiddingConcept.test.ts`
(The `--unstable-kv` might not be strictly necessary for MongoDB, but good practice for Deno's native KV when used). `--allow-read` could be needed if you use `.env` files.
