// BiddingConcept.ts
import { Collection, Db, ObjectId, WithId } from "npm:mongodb";
import { EventBus } from "./mock-services.ts"; // Using mock-services for EventBus interface
import {
    BidAlreadyWithdrawnError,
    BidNotFoundError,
    BidWithdrawalFailedUnexpectedlyError,
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
        try {
            await this.bidsCollection.createIndex({ listingId: 1 });
            await this.bidsCollection.createIndex({ listingId: 1, status: 1, amount: -1, timestamp: -1 });
            await this.bidsCollection.createIndex({ bidderId: 1 }); // For potential future "get bids by user"
            console.log("BiddingConcept: MongoDB indexes initialized.");
        } catch (error) {
            console.warn("BiddingConcept: Index creation failed (may already exist):", error);
        }
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
     * Withdraws a bid that was previously placed.
     * @param bidId The ID of the bid to withdraw.
     * @param bidder The ID of the user attempting to withdraw the bid.
     * @throws {BidNotFoundError} If the bid does not exist.
     * @throws {BidAlreadyWithdrawnError} If the bid is already withdrawn.
     * @throws {UnauthorizedBidWithdrawalError} If the provided bidder is not the original bidder.
     */
    async withdraw_bid(bidId: BidId, bidder: UserId): Promise<void> {
        console.log(`[DEBUG - withdraw_bid] Attempting to withdraw bid ${bidId.toHexString()} by user ${bidder.toHexString()}`);

        // Use findOneAndUpdate with conditions to handle all validation in one atomic operation
        const updateResult = await this.bidsCollection.findOneAndUpdate(
            { 
                _id: bidId,
                bidderId: bidder, // Ensure the bidder matches
                status: BidStatus.Active // Ensure the bid is still active
            },
            { $set: { status: BidStatus.Withdrawn } },
            { returnDocument: 'before' } // Get the document before the update
        );

        if (!updateResult) {
            console.log(`[DEBUG - withdraw_bid] findOneAndUpdate failed for bid ${bidId.toHexString()}. Checking specific reasons...`);
            
            // The bid either doesn't exist, is already withdrawn, or doesn't belong to this bidder
            const existingBid = await this.bidsCollection.findOne({ _id: bidId });
            
            if (!existingBid) {
                console.log(`[DEBUG - withdraw_bid] Bid ${bidId.toHexString()} does not exist.`);
                throw new BidNotFoundError(bidId.toHexString());
            }
            
            console.log(`[DEBUG - withdraw_bid] Existing bid ${bidId.toHexString()} found with status: ${existingBid.status}, bidder: ${existingBid.bidderId.toHexString()}`);

            if (existingBid.status === BidStatus.Withdrawn) {
                console.log(`[DEBUG - withdraw_bid] Bid ${bidId.toHexString()} is already withdrawn.`);
                throw new BidAlreadyWithdrawnError(bidId.toHexString());
            }
            
            if (!existingBid.bidderId.equals(bidder)) {
                console.log(`[DEBUG - withdraw_bid] User ${bidder.toHexString()} is not the original bidder for bid ${bidId.toHexString()}. Original bidder: ${existingBid.bidderId.toHexString()}`);
                throw new UnauthorizedBidWithdrawalError(bidId.toHexString(), bidder.toHexString());
            }
            
            // If we get here, it means:
            // 1. The bid exists (`existingBid` is not null).
            // 2. The bid is not `Withdrawn` (`existingBid.status` is not "Withdrawn").
            // 3. The `bidderId` matches (`existingBid.bidderId.equals(bidder)` is true).
            // BUT `findOneAndUpdate` still returned `null`.
            // This is an unexpected state, possibly a very rare race condition or an underlying DB issue
            // where `status: BidStatus.Active` in the find query didn't match, but a subsequent direct find
            // shows it's still active.
            console.error(`[ERROR - withdraw_bid] Unexpected failure for bid ${bidId.toHexString()}: bid exists, active, and belongs to bidder, but findOneAndUpdate failed.`);
            throw new BidWithdrawalFailedUnexpectedlyError(bidId.toHexString(), "Atomic update failed without clear reason.");
        }

        const bid = updateResult;
        console.log(`[DEBUG - withdraw_bid] Successfully withdrew bid ${bid._id.toHexString()}.`);

        // Emit the withdrawal event
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
