# SwapIt Marketplace System - Design Documentation

## Overview
This document consolidates all design decisions, assumptions, and implementation details for the SwapIt marketplace system. The system implements five core concepts: UserAccount, ItemListing, Bidding, MessagingThread, and Feed.

## System Architecture

### Core Design Principles
- **Concept Modularity**: Each concept is independent with clear interfaces
- **Event-Driven Communication**: Concepts communicate via events, not direct calls
- **Database-First Design**: MongoDB collections with ObjectId-based relationships
- **Async Operations**: All operations return Promises for scalability
- **Comprehensive Validation**: Input validation at concept boundaries
- **Test-Driven Development**: LikertSurvey principle-based testing

### Technology Stack
- **Runtime**: Deno with TypeScript
- **Database**: MongoDB Atlas with native ObjectId types
- **Testing**: Deno test framework with comprehensive mock services
- **Event System**: In-memory event bus (production would use Redis/RabbitMQ)

## Concept Implementations

### Concept A — UserAccount
**Purpose**: SSO-based authentication and user profile management

**Key Design Decisions**:
- **SSO Integration**: Replaced email verification with school SSO for better UX and security
- **Session Management**: MongoDB-based session storage with configurable expiration
- **Profile Synchronization**: Automatic synchronization of listings, bids, and threads via events
- **Username Generation**: Automatic unique username generation with fallback numbering

**Implementation Details**:
- Uses `ObjectId` for internal storage, exposes string IDs in public API
- Three collections: `users`, `profiles`, `sessions`
- Comprehensive error handling with custom error classes
- Event emission for all user lifecycle events

**Assumptions**:
- SSO provider handles user validation and authentication
- School domains are pre-configured and trusted
- Session duration is configurable (default 24 hours)
- Usernames are immutable once set

### Concept B — ItemListing
**Purpose**: Item lifecycle management from creation to sale

**Key Design Decisions**:
- **Authorization Model**: Seller-only modification with explicit authorization checks
- **State Management**: Controlled transitions (Active → Withdrawn/Sold)
- **Input Validation**: Comprehensive validation with length limits and URL validation
- **Bid Integration**: Maintains bid log and current highest bid references

**Implementation Details**:
- Single `listings` collection with embedded bid tracking
- MongoDB indexes for efficient querying by seller, status, tags
- Atomic operations for state changes
- Rich event payloads for integration

**Assumptions**:
- Photos are stored as URLs (no direct file storage)
- Currency amounts are simple numbers (no multi-currency support)
- Tags are simple strings (no hierarchical structure)
- Bid acceptance is handled by ItemListing, bid creation by Bidding concept

### Concept C — Bidding
**Purpose**: Bid management with transparent history

**Key Design Decisions**:
- **Database-First Approach**: Single collection with MongoDB indexing
- **Atomic Operations**: `findOneAndUpdate` for withdrawal to prevent race conditions
- **Rich Event Payloads**: Complete context in events for integration
- **Efficient Querying**: Compound indexes for performance

**Implementation Details**:
- `bids` collection with status tracking (Active/Withdrawn)
- Automatic index creation for listingId, status, amount, timestamp
- Comprehensive error handling with specific error types
- Event emission for all bid operations

**Assumptions**:
- Bids cannot be edited once placed
- Withdrawn bids are hidden from public views
- Bid amounts are positive numbers
- No bid expiration or automatic withdrawal

### Concept D — MessagingThread
**Purpose**: Private two-user communication with optional listing context

**Key Design Decisions**:
- **Simplified Architecture**: Removed complex seller-buyer restrictions
- **Two-User Limit**: Enforced at database level with unique indexes
- **Optional Listing Context**: Threads can be general or listing-specific
- **Message Moderation**: Integrated flagging system with event emission

**Implementation Details**:
- Two collections: `messaging_threads` and `messaging_messages`
- Unique compound index on participants and listingId
- Consistent participant ordering for query efficiency
- Comprehensive message retrieval with pagination support

**Assumptions**:
- Threads are limited to exactly two participants
- Messages cannot be edited or deleted
- Flagging triggers moderation workflow via events
- No message encryption or advanced security features

### Concept E — Feed
**Purpose**: Efficient listing discovery with filtering capabilities

**Key Design Decisions**:
- **Denormalized Architecture**: Complete listing data in feed collection
- **Event-Driven Updates**: Automatic synchronization via event listeners
- **Flexible Filtering**: Support for tags, price ranges, and combined filters
- **Chronological Ordering**: Always sorted by creation date (recent first)

**Implementation Details**:
- Single `feed_index` collection with denormalized listing data
- MongoDB indexes for efficient filtering and sorting
- Event listeners for all listing lifecycle events
- Pagination support for all query methods

**Assumptions**:
- Feed data is eventually consistent with listing changes
- Only active listings appear in feed
- Price filtering uses simple numeric comparison
- No real-time updates (polling-based refresh)

## Cross-Concept Integration

### Event System
- **Event Bus**: In-memory implementation for development, production would use Redis/RabbitMQ
- **Event Ordering**: No guaranteed ordering, events emitted synchronously
- **Error Handling**: Failed operations don't emit events
- **Event Persistence**: Events not persisted, only emitted

### Data Consistency
- **Eventual Consistency**: Cross-concept updates via events
- **Atomic Operations**: Single-concept operations are atomic
- **Foreign Key Relationships**: ObjectId references between concepts
- **No Cross-Concept Queries**: Concepts only access their own data

### Error Handling
- **Custom Error Classes**: Specific error types for different failure scenarios
- **Graceful Degradation**: Failed operations don't break system state
- **Comprehensive Validation**: Input validation at all boundaries
- **Error Propagation**: Errors bubble up with context

## Testing Strategy

### LikertSurvey Test Format
- **Principle-Based Testing**: Each test covers a specific operational principle
- **Comprehensive Coverage**: 6 principles per concept covering correctness, robustness, performance
- **Mock Services**: Isolated testing with comprehensive mock implementations
- **Fake Data Generation**: Realistic test data for all scenarios

### Test Principles
1. **Correctness**: Core functionality works as expected
2. **Robustness**: Handles errors and edge cases gracefully
3. **Performance**: Meets performance requirements
4. **Security**: Validates authorization and input sanitization
5. **Integration**: Works correctly with other concepts
6. **Maintainability**: Code is readable and maintainable

## Security Considerations

### Authentication & Authorization
- **SSO Integration**: Leverages school's security infrastructure
- **Session Management**: Secure session handling with expiration
- **Authorization Checks**: Explicit permission validation for all operations
- **Input Validation**: Comprehensive validation at all entry points

### Data Protection
- **No Sensitive Data**: No passwords or sensitive information stored
- **Input Sanitization**: Basic validation, no advanced XSS protection
- **Rate Limiting**: Not implemented (would be added in production)
- **Content Moderation**: Flagging system for user-generated content

## Performance Considerations

### Database Optimization
- **Strategic Indexing**: Indexes on frequently queried fields
- **Denormalization**: Feed concept uses denormalized data for performance
- **Atomic Operations**: Single-document operations where possible
- **Connection Management**: Proper database connection handling

### Scalability
- **Async Operations**: All operations are asynchronous
- **Event-Driven**: Loose coupling enables horizontal scaling
- **Stateless Concepts**: No shared state between concept instances
- **Database Sharding**: Ready for MongoDB sharding if needed

## Production Readiness

### Current Limitations
- **In-Memory Event Bus**: Not suitable for distributed deployment
- **No Caching**: All operations hit database directly
- **No Rate Limiting**: Could be overwhelmed by malicious users
- **Basic Error Handling**: Could be more sophisticated

### Production Enhancements Needed
- **Distributed Event System**: Redis or RabbitMQ for events
- **Caching Layer**: Redis for frequently accessed data
- **Rate Limiting**: Per-user and per-endpoint limits
- **Monitoring**: Comprehensive logging and metrics
- **Load Balancing**: Multiple application instances
- **Database Optimization**: Connection pooling and query optimization

## Development Workflow

### Code Organization
- **Concept-Based Structure**: Each concept in its own directory
- **Shared Utilities**: Common database and type utilities
- **Mock Services**: Comprehensive mocks for testing
- **Fake Data**: Realistic test data generation

### Testing Workflow
- **Isolated Tests**: Each test runs with clean database state
- **Comprehensive Coverage**: All code paths tested
- **Performance Testing**: Thresholds for operation timing
- **Integration Testing**: Cross-concept interaction testing

## Future Enhancements

### Planned Features
- **Real-Time Updates**: WebSocket support for live updates
- **Advanced Search**: Full-text search and complex filtering
- **Image Processing**: Automatic image optimization and validation
- **Notification System**: User notifications for relevant events
- **Analytics**: Usage tracking and performance metrics

### Scalability Improvements
- **Microservices**: Split concepts into separate services
- **API Gateway**: Centralized API management
- **CDN Integration**: Static asset delivery
- **Database Sharding**: Horizontal database scaling
- **Caching Strategy**: Multi-level caching implementation

## Interesting Development Moments

This section highlights key technical breakthroughs and design decisions that emerged during the development process, demonstrating the incremental and reflective nature of our work.

### 1. **Atomic Bid Withdrawal with Comprehensive Error Handling** 
*Location: [@](../../src/concepts/Bidding/BiddingConcept.ts:192-239)*
**Moment**: Implemented `findOneAndUpdate` with detailed fallback error analysis. The code handles race conditions by using atomic MongoDB operations, then provides specific error messages for each failure scenario (bid not found, already withdrawn, unauthorized access). This demonstrates production-ready error handling with comprehensive debugging logs.

### 2. **Denormalized Feed Architecture for Performance**
*Location: [@](../../src/concepts/Feed/FeedConcept.ts:54-68)*
**Moment**: Chose denormalized data storage over separate indexes. The `_createFeedIndexDoc` method stores complete listing data in the feed collection rather than just references, enabling single-query operations. This architectural decision significantly improved query performance while maintaining data consistency through event-driven updates.

### 3. **SSO Authentication Evolution from Email Verification**
*Location: [@](../../context/design/prompts/03_updated_useraccount_spec.prompt.md/20251019_144027.90945e8b.md)*
**Moment**: Complete pivot from email verification to SSO authentication. This fundamental change eliminated user friction while leveraging school security infrastructure. The implementation includes automatic username generation with fallback numbering and comprehensive session management.

### 4. **MessagingThread Simplification from Restricted to Open Communication**
*Location: [@](../../context/design/prompts/11_messagingthread_new_implementation.prompt.md/20251019_204030.46f4a496.md)*
**Moment**: Removed complex seller-buyer restrictions in favor of general two-user communication. This design evolution eliminated enforcement complexity while providing greater user flexibility. The implementation uses unique compound indexes to prevent duplicate threads.

### 5. **LikertSurvey Test Format Adoption**
*Location: [@](../../context/design/prompts/02_rewrite_tests.prompt.md/20251019_135544.2a28159e.md)*
**Moment**: Transitioned from traditional unit tests to principle-based LikertSurvey format. This testing approach provides comprehensive coverage across 6 principles per concept (correctness, robustness, performance, security, integration, maintainability) with 3-5 variant tests each.

### 6. **Concurrent Operations Testing with Race Condition Handling**
*Location: [@](../../context/design/prompts/08_itemlisting_concurrency_tests.prompt.md/20251019_171045.a94fd7c6.md)*
**Moment**: Implemented advanced concurrency testing including concurrent bid acceptance, database transaction failures, and concurrent listing updates. These tests ensure system reliability under high-load scenarios with proper atomic operations and error recovery.

### 7. **Feed Event-Driven Synchronization**
*Location: [@](../../src/concepts/Feed/FeedConcept.ts:34-39)*
**Moment**: Implemented automatic feed updates through event listeners. The system maintains real-time consistency between ItemListing changes and Feed display without direct coupling, demonstrating proper event-driven architecture.

### 8. **Comprehensive Input Validation with Custom Error Classes**
*Location: [@](../../src/concepts/ItemListing/ItemListingConcept.ts:150-205)*
**Moment**: Built extensive validation system with specific error types for different failure scenarios. The validation includes length limits, URL validation using `URL.canParse()`, and comprehensive field checking. This approach provides clear error messages while preventing data corruption.

### 9. **Database-First Bidding Implementation**
*Location: [@](../../context/design/prompts/09_bidding_implementation.prompt.md/20251019_172114.dcf82b8d.md)*
**Moment**: Evolved from in-memory Map-based design to MongoDB collection with native indexing. This change eliminated data synchronization issues while providing better performance through MongoDB's built-in optimization capabilities.

### 10. **Test Results Immutable Snapshots**
*Location: [@](../../context/complete_test_results.txt/20251019_225334.65545494.md)*
**Moment**: Comprehensive test suite execution showing 100% pass rate across all concepts. The test results demonstrate 56+ individual scenarios covering edge cases, concurrency, error handling, and integration testing with total execution time of 14 seconds.

---

*This document represents the current state of the SwapIt marketplace system design as of the latest implementation. All concepts are fully implemented and tested according to the specifications outlined in `SwapIt_spec.md`.*
