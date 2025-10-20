# MessagingThread Concept Implementation Request

## Context
You are implementing Concept D (MessagingThread) for the SwapIt marketplace system. This concept enables structured communication between users around listings and handles message moderation through the UserAccount concept.

## Reference Implementation Pattern
Please follow the same implementation pattern as the successful UserAccount, ItemListing, and Bidding concepts. Reference the LikertSurvey test format for comprehensive testing.

## Concept Specification

### Purpose
Support structured communication between users around a listing and track message flow without requiring a separate moderation concept.

### Types
- ThreadId
- ListingId  
- UserId
- MessageId
- Message

### State
```
threads: Map<ThreadId -> { 
    listingId: ListingId, 
    participants: Set<UserId>, 
    messages: List<MessageId> 
}]
messages: Map<MessageId -> { 
    sender: UserId, 
    text: String, 
    attachments?: List<Url>, 
    timestamp: Timestamp, 
    flagged?: Boolean 
}]
```

### Actions
- `start_thread(user: UserId, listingId: ListingId) -> ThreadId`
- `post_message(threadId: ThreadId, user: UserId, text: String, attachments?)`
- `flag_message(threadId: ThreadId, messageId: MessageId, reason: String)`
- `mark_pickup_complete(threadId: ThreadId, user: UserId)`

### Notifications
- NewMessage(ThreadId, MessageId)
- MessageFlagged(ThreadId, MessageId)

### Notes
- Moderation is folded into UserAccount — flagging triggers a review by system admins via event emission, not a separate concept
- Threads are removed if either participant deletes their profile

## Technical Requirements

### Database Integration
- Use MongoDB with `npm:mongodb` driver
- Follow the same database patterns as UserAccount, ItemListing, and Bidding concepts
- Use ObjectId for all ID types (ThreadId, MessageId, ListingId, UserId)
- Implement proper MongoDB indexing for efficient queries

### Error Handling
- Create custom error classes following the pattern in BiddingErrors.ts
- Handle cases like: thread not found, message not found, unauthorized access, invalid participants

### Event System
- Implement EventBus interface for notifications
- Emit NewMessage and MessageFlagged events with appropriate payloads
- Follow the same event patterns as other concepts

### Testing Requirements
- Create comprehensive test suite following LikertSurvey format
- Implement 6 test principles covering:
  1. **Correctness** - Core functionality (thread creation, messaging, flagging)
  2. **Robustness** - Error handling and edge cases
  3. **Performance** - Database indexing and query efficiency
  4. **Usability** - API clarity and intuitive design
  5. **Maintainability** - Code structure and modularity
  6. **Testability** - Dependency injection and mocking

### Mock Services
- Create mock EventBus implementation
- Include test utilities for database setup
- Provide comprehensive fake data for testing

## Implementation Files Needed
1. `MessagingThreadConcept.ts` - Main implementation
2. `MessagingThreadErrors.ts` - Custom error classes
3. `MessagingThreadConcept.test.ts` - Comprehensive test suite
4. `mock-services.ts` - Mock implementations
5. `fake-data.ts` - Test data generation

## Key Implementation Considerations
- Thread participants should be automatically managed (add users when they first post)
- Message attachments should be optional and validated as URLs
- Flagging should emit events for UserAccount moderation integration
- Thread cleanup should be handled when participants delete accounts
- Use atomic operations for thread and message creation
- Implement proper authorization (only participants can post/flag)

## Expected Output
Please provide:
1. Complete TypeScript implementation following the established patterns
2. Comprehensive test suite with 6 principles and multiple scenarios per principle
3. Mock services and fake data for testing
4. Clear documentation and comments explaining design decisions

Follow the same high-quality implementation standards demonstrated in the UserAccount, ItemListing, and Bidding concepts.
