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
