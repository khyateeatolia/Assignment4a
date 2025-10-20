# ItemListing Concept Implementation Request

## Project Context
You are working on a student marketplace system called "SwapIt" (CampusCloset) that enables verified users to list items, place bids, communicate through threads, and browse available listings. This is part of Assignment 4a for a Software Design course.

## Current System Status
- **UserAccount concept**: Fully implemented with SSO authentication, session management, and comprehensive testing
- **Database**: MongoDB Atlas with npm:mongodb driver
- **Testing Framework**: Deno with principle-based test structure
- **Test Format**: Following LikertSurvey pattern with 6 test principles

## Request
Please implement the **ItemListing concept** (Concept B) from the specification below. Generate:

1. **TypeScript Implementation** (`ItemListingConcept.ts`)
2. **Comprehensive Test Suite** (`ItemListingConcept.test.ts`) in LikertSurvey format
3. **Mock Services** (`mock-services.ts`) for external dependencies
4. **Fake Test Data** (`fake-data.ts`) for various scenarios

## ItemListing Concept Specification

### Purpose
Represent items available for sale or exchange, and manage their full lifecycle — creation, editing, withdrawal, and sale.

### Types
- ListingId
- UserId (seller)
- Tag
- CurrencyAmount

### State
```
listings: Map<ListingId -> { 
    seller: UserId, 
    title: String, 
    description: String, 
    photos: List<Url>, 
    tags: List<Tag>, 
    minAsk?: CurrencyAmount, 
    createdAt: Timestamp, 
    status: Enum{Active, Sold, Withdrawn}, 
    currentHighestBid?: BidId, 
    bidLog: List<BidId> 
}]
```

### Actions
- `create_listing(seller: UserId, title, description, photos, tags, minAsk?) -> ListingId`
- `update_listing(listingId: ListingId, fields)`
- `withdraw_listing(listingId: ListingId, seller: UserId)`
- `accept_bid(listingId: ListingId, bidId: BidId)`

### Notifications
- ListingCreated(ListingId)
- ListingUpdated(ListingId)
- ListingWithdrawn(ListingId)
- ListingSold(ListingId, BidId)

### Notes
- Each listing references only the seller's UserId, not their full record (maintains modular independence)
- Withdrawn listings disappear from the feed and seller's profile automatically
- accept_bid triggers synchronization with Bidding and UserAccount

## Implementation Requirements

### 1. TypeScript Implementation
- Use `npm:mongodb` driver for database operations
- Follow the same patterns as UserAccountConcept
- Include proper error handling with custom error classes
- Implement all actions from the specification
- Use ObjectId for ListingId and UserId
- Include proper TypeScript interfaces and types

### 2. Test Structure (LikertSurvey Format)
Create 6 test principles following the UserAccount pattern:

1. **Listing Creation and Management** - Create listings, update fields, verify data integrity
2. **Listing Lifecycle** - Creation, updates, withdrawal, sale completion
3. **Bid Integration** - Accept bids, update bid logs, handle bid status changes
4. **Data Validation** - Invalid inputs, missing fields, constraint violations
5. **Error Handling** - Non-existent listings, unauthorized access, invalid operations
6. **Synchronization** - Event emission, external system integration, data consistency

### 3. Mock Services
Create mock services for:
- EventBus (for notifications)
- External validation services
- Configuration management

### 4. Fake Data
Generate comprehensive fake data including:
- Various listing types (electronics, books, clothing, etc.)
- Different sellers and scenarios
- Edge cases (empty descriptions, long titles, etc.)
- Invalid data for error testing

## Technical Constraints
- Use Deno runtime with TypeScript
- Follow existing code patterns from UserAccountConcept
- Use MongoDB Atlas for persistence
- Include proper error classes and handling
- Ensure all tests pass with MongoDB connection
- Follow the principle-based testing approach

## Reference Implementation
Please reference the existing UserAccount concept implementation for:
- Database connection patterns
- Error handling approaches
- Test structure and organization
- Mock service implementations
- Event bus integration

Generate a complete, working implementation that integrates seamlessly with the existing system architecture.
