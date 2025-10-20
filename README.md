# SwapIt Marketplace

A comprehensive marketplace platform built with TypeScript and Deno, implementing a modular concept-based architecture for secure item trading and user communication.

## Overview

SwapIt is a modern marketplace system that enables users to buy, sell, and trade items through an intuitive platform. Built using a concept-driven architecture, SwapIt separates concerns into five core concepts that work together to provide a complete marketplace experience.

## Core Concepts

### 1. UserAccount
**Purpose**: Manages user authentication, profiles, and session handling
- **Authentication**: SSO-based login system (no passwords required)
- **Profile Management**: Complete user profile with bio, avatar, and preferences
- **Session Management**: Secure session handling with automatic expiration
- **Events**: User registration, login/logout, profile updates, account deletion

### 2. ItemListing
**Purpose**: Handles the complete lifecycle of marketplace items
- **Listing Management**: Create, update, withdraw, and sell items
- **Validation**: Comprehensive input validation and authorization
- **State Management**: Track listing status (active, withdrawn, sold)
- **Events**: Listing creation, updates, withdrawals, and sales

### 3. Bidding
**Purpose**: Manages competitive bidding on marketplace items
- **Bid Operations**: Place, withdraw, and track bids
- **Atomic Operations**: Database-first design with race condition protection
- **Status Tracking**: Comprehensive bid status management
- **Events**: Bid placement, withdrawal, and status updates

### 4. MessagingThread
**Purpose**: Enables private communication between users
- **Two-User Communication**: Private messaging between exactly two users
- **Listing Integration**: Optional integration with specific marketplace items
- **Message Management**: Send, retrieve, and flag messages
- **Moderation**: Built-in message flagging and moderation capabilities

### 5. Feed
**Purpose**: Provides efficient discovery and filtering of marketplace items
- **Chronological Sorting**: Listings sorted by creation date (recent first)
- **Advanced Filtering**: Filter by tags, price range, or combined criteria
- **Denormalized Architecture**: Optimized for fast querying and updates
- **Real-time Updates**: Event-driven updates when listings change

## Technical Architecture

### Technology Stack
- **Runtime**: Deno with TypeScript
- **Database**: MongoDB Atlas with native driver
- **Testing**: Deno's built-in test framework
- **Architecture**: Event-driven, concept-based modular design

### Key Design Principles
- **Modularity**: Each concept is independent with no direct dependencies
- **Event-Driven Communication**: Concepts communicate via events only
- **Database-First**: All state persisted in MongoDB collections
- **Atomic Operations**: Race condition protection for concurrent operations
- **Comprehensive Testing**: LikertSurvey-format tests for all concepts

## Project Structure

```
src/
├── SwapItMarketplace.ts          # Unified integration of all concepts
├── concepts/
│   ├── UserAccount/              # User authentication and profiles
│   ├── ItemListing/              # Marketplace item management
│   ├── Bidding/                  # Competitive bidding system
│   ├── MessagingThread/          # Private user communication
│   └── Feed/                     # Item discovery and filtering
├── utils/
│   ├── database.ts               # Database connection utilities
│   └── types.ts                  # Shared type definitions
design/
├── design-notes/
│   └── System_Design_Documentation.md  # Comprehensive design documentation
└── prompts/                      # LLM interaction history
context/                          # Immutable snapshots of development process
```

## Assignment 4a Deliverables

This project was developed as part of MIT 6.1040 Assignment 4a, focusing on backend concept coding with the following achievements:

### ✅ Complete Implementation
- **5 Core Concepts**: All concepts fully implemented with comprehensive functionality
- **Production-Ready Code**: Error handling, validation, security considerations
- **Event-Driven Architecture**: Clean separation of concerns with event-based communication

### ✅ Comprehensive Testing
- **LikertSurvey Format**: All concepts tested using principle-based testing methodology
- **100% Test Pass Rate**: All 30 test principles pass across all concepts
- **Edge Case Coverage**: Concurrency testing, error handling, performance validation
- **Immutable Snapshots**: All test results preserved in context area

### ✅ Design Documentation
- **10 Interesting Moments**: Technical breakthroughs and design decisions documented
- **Evolution Tracking**: Complete record of design changes and rationale
- **Implementation Links**: Direct links to code, tests, and development snapshots

### ✅ Incremental Development
- **230+ Context Snapshots**: Evidence of reflective, incremental development process
- **LLM-Augmented Workflow**: Strategic use of Google Gemini for code generation and debugging
- **Iterative Refinement**: Continuous improvement through testing and feedback

## Getting Started

### Prerequisites
- Deno 1.40+ installed
- MongoDB Atlas account and connection string
- Environment variables configured

### Installation
1. Clone the repository
2. Set up environment variables in `.env`:
   ```
   MONGODB_URL=your_mongodb_atlas_connection_string
   ```
3. Install dependencies:
   ```bash
   deno cache --reload src/SwapItMarketplace.ts
   ```

### Running Tests
```bash
# Run all concept tests
deno test --allow-net --allow-read --allow-sys src/concepts/*/**.test.ts

# Run specific concept tests
deno test --allow-net --allow-read --allow-sys src/concepts/UserAccount/UserAccountConcept.test.ts
```

### Using the Marketplace
```typescript
import { SwapItMarketplace } from './src/SwapItMarketplace.ts';

// Initialize the marketplace
const marketplace = new SwapItMarketplace(db, eventBus, listingService);

// Register a user
const user = await marketplace.userAccount.register_or_login(ssoToken);

// Create a listing
const listing = await marketplace.itemListing.create_listing({
  title: "Vintage Camera",
  description: "Excellent condition",
  price: { value: 150, currency: "USD" },
  tags: ["electronics", "photography"],
  ownerId: user.id
});

// Place a bid
const bid = await marketplace.bidding.place_bid(listing.id, bidderId, 160);

// Start a conversation
const thread = await marketplace.messagingThread.start_thread(sellerId, bidderId, listing.id);

// Browse the feed
const latest = await marketplace.feed.get_latest(20);
const electronics = await marketplace.feed.filter_by_tags(["electronics"]);
```

## Key Features

### Security & Authentication
- SSO-based authentication (no password management)
- Session-based security with automatic expiration
- Comprehensive input validation and sanitization
- Authorization checks for all operations

### Performance & Scalability
- Denormalized feed architecture for fast queries
- Database indexing for optimal performance
- Atomic operations preventing race conditions
- Event-driven updates for real-time functionality

### User Experience
- Intuitive concept-based API design
- Comprehensive error handling with meaningful messages
- Real-time updates through event system
- Flexible filtering and search capabilities

## Development Process

This project was developed following MIT 6.1040's incremental and reflective development methodology:

1. **Concept Specification**: Detailed specifications for each concept
2. **Incremental Implementation**: One concept at a time with comprehensive testing
3. **LLM Augmentation**: Strategic use of Google Gemini for code generation and debugging
4. **Reflective Practice**: Continuous documentation of design decisions and interesting moments
5. **Context Management**: Immutable snapshots preserving development history

## Interesting Technical Moments

The development process included several key technical breakthroughs:

1. **SSO Authentication Migration**: Transition from email verification to SSO-based authentication
2. **Event-Driven Architecture**: Implementation of clean concept separation through events
3. **Atomic Bid Operations**: Database-first design preventing race conditions in bidding
4. **Denormalized Feed Design**: Performance optimization for listing discovery
5. **LikertSurvey Testing**: Comprehensive principle-based testing methodology
6. **Concurrency Testing**: Advanced testing for race conditions and parallel operations
7. **Error Handling Strategy**: Custom error classes with meaningful messages
8. **Mock Service Architecture**: Isolated testing with comprehensive mock implementations
9. **Type Safety**: Full TypeScript implementation with strict type checking
10. **Context Preservation**: Immutable snapshots documenting incremental development

## Future Enhancements

- Frontend implementation (Assignment 4b)
- Real-time notifications
- Advanced search capabilities
- Payment integration
- Mobile application
- Analytics and reporting

## License

This project is developed as part of MIT 6.1040 Software Design course.

## Contributing

This is an academic project. For questions or feedback, please refer to the course documentation or contact the development team.

---

**Assignment 4a Status**: ✅ Complete  
**Test Coverage**: 100% (30/30 principles passing)  
**Concepts Implemented**: 5/5  
**Documentation**: Comprehensive  
**Development Process**: Incremental and Reflective