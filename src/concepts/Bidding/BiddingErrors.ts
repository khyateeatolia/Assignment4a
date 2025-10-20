// BiddingErrors.ts

/**
 * Base error class for all Bidding Concept related errors.
 */
export class BiddingError extends Error {
    constructor(message: string, name: string) {
        super(message);
        this.name = name;
        // This is important for custom error types in TypeScript/JavaScript
        // It ensures the prototype chain is correctly set up.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Error thrown when an attempt is made to place a bid with an invalid amount (e.g., negative, zero, non-numeric).
 */
export class InvalidBidAmountError extends BiddingError {
    constructor(amount: number | string) {
        super(`Invalid bid amount: ${amount}. Amount must be a positive finite number.`, "InvalidBidAmountError");
    }
}

/**
 * Error thrown when a requested bid is not found.
 */
export class BidNotFoundError extends BiddingError {
    constructor(bidId: string) {
        super(`Bid with ID ${bidId} not found.`, "BidNotFoundError");
    }
}

/**
 * Error thrown when an attempt is made to withdraw a bid that has already been withdrawn.
 */
export class BidAlreadyWithdrawnError extends BiddingError {
    constructor(bidId: string) {
        super(`Bid with ID ${bidId} has already been withdrawn.`, "BidAlreadyWithdrawnError");
    }
}

/**
 * Error thrown when a user attempts to withdraw a bid they did not place.
 */
export class UnauthorizedBidWithdrawalError extends BiddingError {
    constructor(bidId: string, userId: string) {
        super(`User ${userId} is not authorized to withdraw bid ${bidId}.`, "UnauthorizedBidWithdrawalError");
    }
}

/**
 * Error thrown when a bid is placed on a listing that is assumed to be invalid
 * (though BiddingConcept does not validate listing existence, it still accepts valid ObjectId as input).
 * This error might be used by a higher-level service, or as a placeholder if more strict validation were added.
 */
export class InvalidListingIdError extends BiddingError {
    constructor(listingId: string) {
        super(`Invalid ListingId: ${listingId}.`, "InvalidListingIdError");
    }
}

/**
 * Error thrown when a bid is placed by a user that is assumed to be invalid.
 */
export class InvalidUserIdError extends BiddingError {
    constructor(userId: string) {
        super(`Invalid UserId: ${userId}.`, "InvalidUserIdError");
    }
}

// New error for unexpected internal failures during withdrawal
export class BidWithdrawalFailedUnexpectedlyError extends BiddingError {
    constructor(bidId: string, details: string = "An unexpected error occurred during bid withdrawal.") {
        super(`Failed to withdraw bid ${bidId}: ${details}`, "BidWithdrawalFailedUnexpectedlyError");
    }
}
