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
