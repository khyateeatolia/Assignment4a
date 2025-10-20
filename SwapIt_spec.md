# Marketplace System Concept Specification

## Overview
A student marketplace system enabling verified users to list items, place bids, communicate through threads, and browse available listings.

## Concepts

### Concept A — UserAccount
**Purpose:** Authenticate students via school SSO, manage verified user identities, and maintain full editable profiles containing their listings, bids, and messages.

**Types:**
- EmailAddress
- UserId
- Username
- SSOToken
- SessionId
- SSOProvider
- PasswordHash

**State:**
```
sessions: Map<SessionId -> { 
    userId: UserId, 
    createdAt: Timestamp, 
    expiresAt: Timestamp 
}]
users: Map<UserId -> { 
    email: EmailAddress, 
    username: Username, 
    avatarUrl: Url, 
    bio: String, 
    ssoProvider: SSOProvider, 
    ssoId: String, 
    createdAt: Timestamp, 
    lastLoginAt: Timestamp, 
    isActive: Boolean 
}]
profiles: Map<UserId -> { 
    bio?: String, 
    listings: List<ListingId>, 
    bids: List<BidId>, 
    threads: List<ThreadId> 
}]
```

**Actions:**
- `register_or_login(ssoProvider: SSOProvider, ssoToken: SSOToken, ipAddress: String, userAgent: String) -> { userId: UserId, sessionId: SessionId }`
- `logout(sessionId: SessionId)`
- `change_avatar(userId: UserId, newAvatar: Url)`
- `change_bio(userId: UserId, bio: String)`
- `delete_account(userId: UserId)`
- `view_profile(userId: UserId) -> ProfileView`
- `validate_session(sessionId: SessionId) -> UserId`

**Notifications / Side-effects:**
- UserRegistered(UserId) emitted on first SSO login
- UserLoggedIn(UserId) emitted on successful login
- UserLoggedOut(UserId) emitted on logout
- UserDeleted(UserId) emitted on account deletion
- ProfileUpdated(UserId) emitted on avatar/bio changes

**Notes:**
- Usernames are immutable
- Avatars, bios, and passwords are editable
- Profiles automatically synchronize listings, bids, and message threads
- SSO integration handles authentication via school's identity provider
- UserAccount implicitly covers moderation (e.g., accounts may flag messages)

### Concept B — ItemListing
**Purpose:** Represent items available for sale or exchange, and manage their full lifecycle — creation, editing, withdrawal, and sale.

**Types:**
- ListingId (ObjectId)
- UserId (ObjectId)
- Tag
- CurrencyAmount (number)
- ListingStatus (Enum{Active, Sold, Withdrawn})

**State:**
```
listings: Collection<ItemListing> where ItemListing = {
    _id: ObjectId,
    seller: ObjectId, 
    title: String, 
    description: String, 
    photos: List<Url>, 
    tags: List<Tag>, 
    minAsk?: CurrencyAmount, 
    createdAt: Date, 
    status: ListingStatus, 
    currentHighestBid?: ObjectId, 
    bidLog: List<ObjectId> 
}
```

**Actions:**
- `create_listing(seller: UserId, title: String, description: String, photos: List<Url>, tags: List<Tag>, minAsk?: CurrencyAmount) -> Promise<ListingId>`
- `update_listing(listingId: ListingId, updaterId: UserId, fieldsToUpdate: { title?: String, description?: String, photos?: List<Url>, tags?: List<Tag>, minAsk?: CurrencyAmount }) -> Promise<void>`
- `withdraw_listing(listingId: ListingId, sellerId: UserId) -> Promise<void>`
- `accept_bid(listingId: ListingId, sellerId: UserId, bidId: ObjectId) -> Promise<void>`
- `get_listing(listingId: ListingId) -> Promise<ItemListing | null>`

**Notifications:**
- ListingCreated(ListingId, SellerId)
- ListingUpdated(ListingId, SellerId, UpdatedFields)
- ListingWithdrawn(ListingId, SellerId)
- ListingSold(ListingId, SellerId, AcceptedBidId)

**Notes:**
- Each listing references only the seller's UserId, not their full record (maintains modular independence)
- Withdrawn listings disappear from the feed and seller's profile automatically
- accept_bid triggers synchronization with Bidding and UserAccount
- Authorization is enforced at the concept level - only sellers can modify their listings
- Input validation includes length limits: title (max 200 chars), description (max 2000 chars), photos (max 10), tags (max 10)
- URL validation is performed on photo URLs using URL.canParse()
- State transitions are controlled: Active → Withdrawn/Sold, no updates on non-Active listings
- Events include additional context (sellerId, updatedFields, acceptedBidId) for better integration and audit trails

### Concept C — Bidding
**Purpose:** Enable users to place, view, and withdraw bids on active listings while maintaining transparent bid histories.

**Types:**
- BidId (ObjectId)
- ListingId (ObjectId)
- UserId (ObjectId)
- CurrencyAmount (number)
- BidStatus (Enum{Active, Withdrawn})

**State:**
```
bids: Collection<BidRecordDBO> where BidRecordDBO = {
    _id: ObjectId,
    bidderId: ObjectId, 
    listingId: ObjectId, 
    amount: CurrencyAmount, 
    timestamp: Date, 
    status: BidStatus 
}
```

**Actions:**
- `place_bid(bidder: UserId, listingId: ListingId, amount: CurrencyAmount) -> Promise<BidId>`
- `withdraw_bid(bidId: BidId, bidder: UserId) -> Promise<void>`
- `get_bids(listingId: ListingId) -> Promise<BidRecord[]>`
- `get_current_high(listingId: ListingId) -> Promise<BidId | null>`

**Notifications:**
- BidPlaced(ListingId, BidId, BidderId, Amount, Timestamp)
- BidWithdrawn(BidId, ListingId, BidderId, Amount, Timestamp)

**Notes:**
- Bids cannot be edited once placed
- Withdrawn bids are hidden in both the listing's and bidder's profile views
- Independence preserved — ListingId is a foreign key, not a dependency
- Database indexing handles efficient querying by listingId, status, amount, and timestamp
- Rich event payloads provide complete context for integration with other concepts

### Concept D — MessagingThread
**Purpose:** Enable private communication between exactly two users on the platform, with optional integration for seller-buyer exchanges around specific listings.

**Types:**
- ThreadId (ObjectId)
- ListingId (ObjectId)
- UserId (ObjectId)
- MessageId (ObjectId)
- Message

**State:**
```
threads: Collection<Thread> where Thread = {
    _id: ObjectId,
    listingId?: ObjectId, 
    participants: [ObjectId, ObjectId], 
    messageIds: List<ObjectId>,
    createdAt: Date,
    updatedAt: Date
}
messages: Collection<StoredMessage> where StoredMessage = {
    _id: ObjectId,
    threadId: ObjectId,
    sender: ObjectId, 
    text: String, 
    attachments?: List<Url>, 
    timestamp: Date, 
    flagged: Boolean,
    flaggedReason?: String
}
```

**Actions:**
- `start_thread(initiator: UserId, recipient: UserId, listingId?: ListingId) -> Promise<ThreadId>`
- `post_message(threadId: ThreadId, user: UserId, text: String, attachments?: List<Url>) -> Promise<MessageId>`
- `flag_message(threadId: ThreadId, messageId: MessageId, reason: String, flaggedBy?: UserId) -> Promise<void>`
- `get_thread(threadId: ThreadId) -> Promise<Thread | null>`
- `get_messages_in_thread(threadId: ThreadId, limit?: number, skip?: number) -> Promise<StoredMessage[]>`
- `get_message(messageId: MessageId) -> Promise<StoredMessage | null>`

**Notifications:**
- NewMessage(ThreadId, MessageId, Sender, Text, Timestamp)
- MessageFlagged(ThreadId, MessageId, Reason, FlaggedBy, Timestamp)

**Notes:**
- Moderation is folded into UserAccount — flagging triggers a review by system admins via event emission, not a separate concept
- Threads are limited to exactly two participants for private communication
- Threads can be general conversations between any two users or specific to a listing
- When listingId is provided, the thread is associated with that listing for context
- Sellers and buyers can use this feature to arrange exchanges, but it's not enforced

### Concept E — Feed
**Purpose:** Provide a browsable, filterable view of available listings and synchronize with updates across listing states.

**Types:**
- ListingSummary
- ListingId
- Tag
- CurrencyAmount

**State:**
```
feedCollection: Collection<FeedIndexDoc> where FeedIndexDoc = {
    _id: ObjectId,
    listingId: ListingId,
    title: String,
    description: String,
    price: CurrencyAmount,
    tags: List<Tag>,
    imageUrl?: String,
    createdAt: Timestamp,
    lastUpdatedAt: Timestamp,
    status: Enum{Active, Withdrawn, Sold},
    ownerId: UserId
}
```

**Actions:**
- `get_latest(n: Int) -> List<ListingSummary>`
- `filter_by_tags(tags: List<Tag>) -> List<ListingSummary>`
- `filter_by_price(min: CurrencyAmount, max: CurrencyAmount) -> List<ListingSummary>`
- `filter_by_tags_and_price(tags: List<Tag>, min: CurrencyAmount, max: CurrencyAmount) -> List<ListingSummary>`
- `refresh_feed()`

**Notifications:**
- FeedUpdatedEvent

**Notes:**
- Only active listings are indexed in the feed collection
- Automatically updates when listings are created, withdrawn, or sold via event listeners
- Feed maintains denormalized listing data for efficient querying and filtering
- Supports combined filtering by both tags and price ranges
- Database indexes optimize queries by createdAt (desc), tags, and price.value
- Feed reads data by ID through ItemListingService interface — no shared access to ItemListing internals

## Synchronizations

**Sync 1 — SSO Authentication**
- When: register_or_login
- Where: UserAccount + External SSO Provider
- Then: Validate SSOToken with school's identity provider; create user on first login, update lastLoginAt on subsequent logins
- Rationale: Ensures secure authentication via school's trusted identity system

**Sync 2 — AuthRequired**
- When: create_listing or place_bid
- Where: UserAccount + ItemListing + Bidding
- Then: Verify UserId exists with isActive = true and lastLoginAt within session timeout; reject otherwise
- Rationale: Enforces active student access via SSO authentication

**Sync 3 — Place Bid → Update Listing + Profile**
- When: Bidding.place_bid
- Where: Bidding + ItemListing + UserAccount
- Then: Append bid to both bid_records and ItemListing.bidLog. Update currentHighestBid if needed. Add BidId to bidder's profile
- Rationale: Keeps bid history transparent and synchronized

**Sync 4 — Accept Bid → Close Listing + Notify Buyer**
- When: ItemListing.accept_bid
- Where: ItemListing + Bidding + MessagingThread + UserAccount
- Then: Set listing status = Sold, emit ListingSold, start a MessagingThread between buyer/seller, move item to "sold" in profile
- Rationale: Ensures consistent transaction closure

**Sync 5 — Withdraw Listing → Update Feed + Profiles**
- When: ItemListing.withdraw_listing
- Where: ItemListing + Feed + UserAccount
- Then: Remove listing from feed and seller's active listings. Mark associated bids withdrawn
- Rationale: Keeps visibility consistent across feed and profile

**Sync 6 — Withdraw Bid → Update Listing + Profile**
- When: Bidding.withdraw_bid
- Where: Bidding + ItemListing + UserAccount
- Then: Mark bid as Withdrawn, remove from listing's visible bidLog and bidder's profile
- Rationale: Maintains accurate bid visibility

**Sync 7 — Flag Message → Notify Reviewer**
- When: MessagingThread.flag_message
- Where: MessagingThread + UserAccount
- Then: Emit MessageFlagged event for internal moderation workflow; does not break modularity
- Rationale: Integrates moderation via UserAccount events

**Sync 8 — Feed Refresh**
- When: ItemListing.create_listing or ItemListing.update_listing
- Where: ItemListing + Feed + UserAccount
- Then: Add or update listing in feed indexes. Add listing to seller's profile. Emit FeedUpdated
- Rationale: Keeps feed and profile pages synchronized with listing lifecycle
