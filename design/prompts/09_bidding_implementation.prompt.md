# Bidding Concept Implementation - SwapIt Marketplace System

## Project Context
You are working on a student marketplace system called "SwapIt" (CampusCloset) that enables verified users to list items, place bids, communicate through threads, and browse available listings. This is part of Assignment 4a for a Software Design course.

## Current Status
- **UserAccount concept**: Fully implemented with SSO authentication and comprehensive test suite
- **ItemListing concept**: Fully implemented with comprehensive test suite
- **Database**: MongoDB Atlas with npm:mongodb driver
- **Testing Framework**: Deno with principle-based test structure (LikertSurvey format)
- **Architecture**: Event-driven system with concept independence

## Request
Please implement **Concept C — Bidding** based on the specification below. Generate the complete TypeScript implementation, comprehensive test cases with edge cases, and compatible fake data.

## Concept C — Bidding Specification

**Purpose:** Enable users to place, view, and withdraw bids on active listings while maintaining transparent bid histories.

**Types:**
- BidId
- ListingId  
- UserId
- CurrencyAmount

**State:**
```
bids_by_listing: Map<ListingId -> List<BidId>>
bid_records: Map<BidId -> { 
    bidder: UserId, 
    listing: ListingId, 
    amount: CurrencyAmount, 
    timestamp: Timestamp, 
    status: Enum{Active, Withdrawn} 
}]
```

**Actions:**
- `place_bid(bidder: UserId, listingId: ListingId, amount: CurrencyAmount) -> BidId`
- `withdraw_bid(bidId: BidId, bidder: UserId)`
- `get_bids(listingId: ListingId) -> [BidRecord]`
- `get_current_high(listingId: ListingId) -> BidId?`

**Notifications:**
- BidPlaced(ListingId, BidId)
- BidWithdrawn(BidId)

**Notes:**
- Bids cannot be edited once placed
- Withdrawn bids are hidden in both the listing's and bidder's profile views
- Independence preserved — ListingId is a foreign key, not a dependency

## Implementation Requirements

### **Technical Constraints:**
- Use **TypeScript** with **Deno** runtime
- Use **MongoDB Atlas** with **npm:mongodb** driver
- Follow the same patterns as UserAccount and ItemListing concepts
- Maintain **concept independence** (no direct database reads across concepts)
- Use **ObjectId** for all ID types (BidId, ListingId, UserId)
- Implement **event-driven communication** via EventBus

### **Test Structure Requirements:**
- Follow the **LikertSurvey test format** (6 principles)
- Include **comprehensive edge cases** for:
  - Multiple bids by same user on same listing
  - Bid withdrawal scenarios
  - Invalid bid amounts (negative, zero, non-numeric)
  - Bids on non-existent listings
  - Bids by non-existent users
  - Concurrent bid placement
  - Bid status transitions
  - Data integrity during failures
- Use **principle-based organization** similar to existing concepts

### **Edge Cases to Cover:**
1. **Multiple Bids by Same User:** User can place multiple bids on same listing
2. **Bid Immutability:** Bids cannot be edited once placed
3. **Withdrawal Logic:** Only bidder can withdraw their own bids
4. **Status Management:** Proper Active/Withdrawn status handling
5. **Concurrent Operations:** Race conditions in bid placement
6. **Data Validation:** Invalid amounts, non-existent listings/users
7. **Event Emission:** Proper notification system
8. **Database Consistency:** Atomic operations and error handling

### **Expected Output:**
1. **BiddingConcept.ts** - Complete TypeScript implementation
2. **BiddingConcept.test.ts** - Comprehensive test suite (6 principles)
3. **fake-data.ts** - Test data for all scenarios
4. **mock-services.ts** - Mock services for testing
5. **BiddingErrors.ts** - Custom error classes
6. **Design assumptions** - Document key implementation decisions

### **Integration Notes:**
- Use existing `EventBus` interface from other concepts
- Follow same database connection patterns as UserAccount/ItemListing
- Ensure compatibility with existing test infrastructure
- Use same error handling patterns and custom error classes
- Maintain consistency with existing code style and patterns

Generate a complete, production-ready implementation that integrates seamlessly with the existing SwapIt marketplace system.
