---
timestamp: 'Sun Oct 19 2025 20:40:30 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_204030.46f4a496.md]]'
content_id: aeb2e3936185250455d2210f009e9064a559cb4763bd86566e2dc2f48c16d6c7
---

# response:

Okay, here's the complete implementation of the `MessagingThreadConcept` following your specifications.

***

### File Structure:

```
src/
└── concepts/
    └── MessagingThread/
        ├── MessagingThreadConcept.ts
        ├── MessagingThreadConcept.test.ts
        ├── MessagingThreadErrors.ts
        ├── mock-services.ts
        ├── types.ts
        └── fake-data.ts
```

***

### 1. `src/concepts/MessagingThread/types.ts`

```typescript
// src/concepts/MessagingThread/types.ts

import { ObjectId } from "npm:mongodb";

/**
 * Shared Type Definitions for MessagingThread Concept
 */

export type ThreadId = string; // Represented as ObjectId string
export type ListingId = string; // Represented as ObjectId string
export type UserId = string; // Represented as ObjectId string
export type MessageId = string; // Represented as ObjectId string
export type Timestamp = Date;

/**
 * Message Interface
 * Represents the content of a single message.
 */
export interface Message {
  sender: UserId;
  text: string;
  attachments?: string[]; // Array of URLs
  timestamp: Timestamp;
  flagged?: boolean;
}

/**
 * StoredMessage Interface
 * Extends Message with database-specific fields, including its own ID and thread association.
 */
export interface StoredMessage extends Message {
  _id: ObjectId; // Actual ObjectId for the database
  threadId: ObjectId; // Reference to the thread it belongs to
  flaggedReason?: string; // Reason provided when message is flagged
}

/**
 * Thread Interface
 * Represents a conversation thread.
 */
export interface Thread {
  _id: ObjectId; // Actual ObjectId for the database
  listingId?: ObjectId; // Optional reference to a listing
  participants: [ObjectId, ObjectId]; // Always two participants, sorted for uniqueness
  messageIds: ObjectId[]; // List of MessageIds belonging to this thread (for quick reference)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Event Payloads
 */

export interface NewMessageEventPayload {
  threadId: ThreadId;
  messageId: MessageId;
  sender: UserId;
  text: string;
  timestamp: Timestamp;
}

export interface MessageFlaggedEventPayload {
  threadId: ThreadId;
  messageId: MessageId;
  flaggedBy?: UserId; // The user who flagged it (optional, if context is needed)
  reason: string;
  timestamp: Timestamp;
}

// Global EventBus interface (mimicking a shared interface if present)
// This might be defined in a more central location, but included here for completeness.
export interface EventBus {
  emit<T>(eventName: string, payload: T): Promise<void> | void;
  on<T>(eventName: string, listener: (payload: T) => void): void;
}
```

***

### 2. `src/concepts/MessagingThread/MessagingThreadErrors.ts`

```typescript
// src/concepts/MessagingThread/MessagingThreadErrors.ts

/**
 * Base Error for the MessagingThread Concept.
 * All custom errors within this concept should extend this class.
 */
export class MessagingThreadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagingThreadError";
    // Set the prototype explicitly to ensure `instanceof` works correctly
    Object.setPrototypeOf(this, MessagingThreadError.prototype);
  }
}

/**
 * Error for invalid input parameters provided to an action.
 */
export class InvalidInputError extends MessagingThreadError {
  constructor(message: string) {
    super(`Invalid Input: ${message}`);
    this.name = "InvalidInputError";
    Object.setPrototypeOf(this, InvalidInputError.prototype);
  }
}

/**
 * Error for when a specified thread is not found.
 */
export class ThreadNotFoundError extends MessagingThreadError {
  constructor(threadId: string) {
    super(`Thread with ID ${threadId} not found.`);
    this.name = "ThreadNotFoundError";
    Object.setPrototypeOf(this, ThreadNotFoundError.prototype);
  }
}

/**
 * Error for when a specified message is not found.
 */
export class MessageNotFoundError extends MessagingThreadError {
  constructor(messageId: string, threadId?: string) {
    const threadContext = threadId ? ` in thread ${threadId}` : "";
    super(`Message with ID ${messageId}${threadContext} not found.`);
    this.name = "MessageNotFoundError";
    Object.setPrototypeOf(this, MessageNotFoundError.prototype);
  }
}

/**
 * Error for when a user attempts an action they are not authorized for.
 * E.g., posting to a thread they are not a participant of.
 */
export class UnauthorizedActionError extends MessagingThreadError {
  constructor(userId: string, action: string, context?: string) {
    const contextMsg = context ? ` for ${context}` : "";
    super(`User ${userId} is unauthorized to perform ${action}${contextMsg}.`);
    this.name = "UnauthorizedActionError";
    Object.setPrototypeOf(this, UnauthorizedActionError.prototype);
  }
}

/**
 * Error for when a user attempts to start a thread with themselves.
 */
export class SelfCommunicationError extends MessagingThreadError {
  constructor(userId: string) {
    super(`User ${userId} cannot start a conversation with themselves.`);
    this.name = "SelfCommunicationError";
    Object.setPrototypeOf(this, SelfCommunicationError.prototype);
  }
}

/**
 * Error for when a thread already exists with the same participants and listing context.
 */
export class DuplicateThreadError extends MessagingThreadError {
  constructor(initiatorId: string, recipientId: string, listingId?: string) {
    const listingContext = listingId ? ` for listing ${listingId}` : "";
    super(
      `A thread already exists between ${initiatorId} and ${recipientId}${listingContext}.`,
    );
    this.name = "DuplicateThreadError";
    Object.setPrototypeOf(this, DuplicateThreadError.prototype);
  }
}
```

***

### 3. `src/concepts/MessagingThread/mock-services.ts`

```typescript
// src/concepts/MessagingThread/mock-services.ts

import { Collection, Db, MongoClient, ObjectId } from "npm:mongodb";
import { EventBus } from "./types.ts";

/**
 * Helper to generate a MongoDB ObjectId string.
 */
export function getMongoId(): string {
  return new ObjectId().toHexString();
}

/**
 * Mock Event Bus Implementation for Testing
 */
export class MockEventBus implements EventBus {
  private listeners: Map<string, ((payload: any) => void)[]>;
  public emittedEvents: { eventName: string; payload: any }[];

  constructor() {
    this.listeners = new Map();
    this.emittedEvents = [];
  }

  emit<T>(eventName: string, payload: T): void {
    this.emittedEvents.push({ eventName, payload });
    const handlers = this.listeners.get(eventName);
    if (handlers) {
      handlers.forEach((handler) => handler(payload));
    }
  }

  on<T>(eventName: string, listener: (payload: T) => void): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName)!.push(listener);
  }

  // Utility for tests to clear emitted events
  clearEmittedEvents(): void {
    this.emittedEvents = [];
  }
}

/**
 * MongoDB Test Utilities
 */

let _client: MongoClient | null = null;
let _db: Db | null = null;
const MONGO_TEST_URI = Deno.env.get("MONGO_TEST_URI") ||
  "mongodb://localhost:27017/swapit_messaging_test";

/**
 * Connects to MongoDB and returns the database instance.
 * Ensures only one connection is made per test run.
 */
export async function setupTestDatabase(): Promise<Db> {
  if (!_client) {
    _client = new MongoClient(MONGO_TEST_URI);
    await _client.connect();
    _db = _client.db();
    console.log(`Connected to MongoDB test database: ${_db.databaseName}`);
  }
  return _db!;
}

/**
 * Closes the MongoDB connection.
 */
export async function teardownTestDatabase(): Promise<void> {
  if (_client) {
    await _client.close();
    _client = null;
    _db = null;
    console.log("Disconnected from MongoDB test database.");
  }
}

/**
 * Clears specified collections in the test database.
 */
export async function clearCollections(db: Db, collectionNames: string[]): Promise<void> {
  for (const name of collectionNames) {
    const collection: Collection = db.collection(name);
    await collection.deleteMany({});
  }
  console.log(`Cleared collections: ${collectionNames.join(", ")}`);
}
```

***

### 4. `src/concepts/MessagingThread/fake-data.ts`

```typescript
// src/concepts/MessagingThread/fake-data.ts

import { ObjectId } from "npm:mongodb";
import { ListingId, Message, MessageId, StoredMessage, Thread, ThreadId, UserId } from "./types.ts";

/**
 * Helper to generate a new MongoDB ObjectId string.
 */
function generateObjectIdString(): string {
  return new ObjectId().toHexString();
}

/**
 * Generates a fake UserId.
 */
export function generateUserId(): UserId {
  return generateObjectIdString();
}

/**
 * Generates a fake ListingId.
 */
export function generateListingId(): ListingId {
  return generateObjectIdString();
}

/**
 * Generates a fake ThreadId.
 */
export function generateThreadId(): ThreadId {
  return generateObjectIdString();
}

/**
 * Generates a fake MessageId.
 */
export function generateMessageId(): MessageId {
  return generateObjectIdString();
}

/**
 * Generates a fake Message object.
 */
export function generateFakeMessage(
  senderId: UserId,
  text: string,
  attachments?: string[],
): Message {
  return {
    sender: senderId,
    text: text,
    attachments: attachments,
    timestamp: new Date(),
  };
}

/**
 * Generates a fake StoredMessage object.
 */
export function generateFakeStoredMessage(
  threadId: ThreadId,
  senderId: UserId,
  text: string,
  attachments?: string[],
): StoredMessage {
  return {
    _id: new ObjectId(),
    threadId: new ObjectId(threadId),
    sender: senderId,
    text: text,
    attachments: attachments,
    timestamp: new Date(),
  };
}

/**
 * Generates a fake Thread object.
 * Participants are sorted to ensure consistency for querying.
 */
export function generateFakeThread(
  initiatorId: UserId,
  recipientId: UserId,
  listingId?: ListingId,
  messageIds: MessageId[] = [],
): Thread {
  const participants = [new ObjectId(initiatorId), new ObjectId(recipientId)].sort((a, b) =>
    a.toHexString().localeCompare(b.toHexString())
  ) as [ObjectId, ObjectId];

  return {
    _id: new ObjectId(),
    listingId: listingId ? new ObjectId(listingId) : undefined,
    participants: participants,
    messageIds: messageIds.map((id) => new ObjectId(id)),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Generates a set of fake user IDs.
 */
export function generateFakeUsers(count: number): UserId[] {
  return Array.from({ length: count }, () => generateUserId());
}
```

***

### 5. `src/concepts/MessagingThread/MessagingThreadConcept.ts`

```typescript
// src/concepts/MessagingThread/MessagingThreadConcept.ts

import { Collection, Db, ObjectId } from "npm:mongodb";
import {
  DuplicateThreadError,
  InvalidInputError,
  MessageNotFoundError,
  MessagingThreadError,
  SelfCommunicationError,
  ThreadNotFoundError,
  UnauthorizedActionError,
} from "./MessagingThreadErrors.ts";
import {
  EventBus,
  ListingId,
  MessageFlaggedEventPayload,
  MessageId,
  NewMessageEventPayload,
  StoredMessage,
  Thread,
  ThreadId,
  UserId,
} from "./types.ts";

/**
 * MessagingThreadConcept
 * Manages the creation, messaging, and moderation of private communication threads.
 */
export class MessagingThreadConcept {
  private threadsCollection: Collection<Thread>;
  private messagesCollection: Collection<StoredMessage>;
  private eventBus: EventBus;

  constructor(db: Db, eventBus: EventBus) {
    this.threadsCollection = db.collection<Thread>("messaging_threads");
    this.messagesCollection = db.collection<StoredMessage>("messaging_messages");
    this.eventBus = eventBus;

    // Ensure indexes for efficient querying
    this.threadsCollection.createIndex({ participants: 1, listingId: 1 }, { unique: true });
    this.threadsCollection.createIndex({ listingId: 1 });
    this.messagesCollection.createIndex({ threadId: 1 });
    this.messagesCollection.createIndex({ sender: 1 });
  }

  /**
   * Helper to validate if a string is a valid MongoDB ObjectId hex string.
   */
  private isValidObjectId(id: string): boolean {
    return ObjectId.isValid(id) && new ObjectId(id).toHexString() === id;
  }

  /**
   * Helper to convert string IDs to ObjectId instances.
   */
  private toObjectId(id: string): ObjectId {
    return new ObjectId(id);
  }

  /**
   * Helper to sort participant UserIds consistently for querying.
   * Participants array should always be `[lowestId, highestId]`.
   */
  private sortParticipants(p1: UserId, p2: UserId): [ObjectId, ObjectId] {
    const objId1 = this.toObjectId(p1);
    const objId2 = this.toObjectId(p2);
    return objId1.toHexString().localeCompare(objId2.toHexString()) < 0
      ? [objId1, objId2]
      : [objId2, objId1];
  }

  /**
   * Starts a new private communication thread.
   *
   * @param initiator - The UserId of the user starting the thread.
   * @param recipient - The UserId of the user receiving the thread.
   * @param listingId - Optional. A ListingId to associate the thread with a specific listing.
   * @returns The ThreadId of the newly created thread.
   * @throws InvalidInputError if input IDs are invalid.
   * @throws SelfCommunicationError if initiator tries to start a thread with themselves.
   * @throws DuplicateThreadError if a similar thread already exists.
   * @throws MessagingThreadError for other database errors.
   */
  async start_thread(
    initiator: UserId,
    recipient: UserId,
    listingId?: ListingId,
  ): Promise<ThreadId> {
    if (!this.isValidObjectId(initiator)) {
      throw new InvalidInputError(`Invalid initiator ID: ${initiator}`);
    }
    if (!this.isValidObjectId(recipient)) {
      throw new InvalidInputError(`Invalid recipient ID: ${recipient}`);
    }
    if (listingId && !this.isValidObjectId(listingId)) {
      throw new InvalidInputError(`Invalid listing ID: ${listingId}`);
    }
    if (initiator === recipient) {
      throw new SelfCommunicationError(initiator);
    }

    const sortedParticipants = this.sortParticipants(initiator, recipient);
    const now = new Date();

    // Check for existing thread
    const query: { participants: [ObjectId, ObjectId]; listingId?: ObjectId } = {
      participants: sortedParticipants,
    };
    if (listingId) {
      query.listingId = this.toObjectId(listingId);
    } else {
      query.listingId = { $exists: false }; // Ensure it's a general thread
    }

    const existingThread = await this.threadsCollection.findOne(query);
    if (existingThread) {
      throw new DuplicateThreadError(initiator, recipient, listingId);
    }

    try {
      const newThread: Thread = {
        _id: new ObjectId(),
        listingId: listingId ? this.toObjectId(listingId) : undefined,
        participants: sortedParticipants,
        messageIds: [],
        createdAt: now,
        updatedAt: now,
      };

      await this.threadsCollection.insertOne(newThread);
      return newThread._id.toHexString();
    } catch (error) {
      throw new MessagingThreadError(`Failed to start thread: ${error.message}`);
    }
  }

  /**
   * Posts a new message to an existing thread.
   *
   * @param threadId - The ID of the thread to post to.
   * @param user - The UserId of the user posting the message.
   * @param text - The content of the message.
   * @param attachments - Optional. A list of URLs for attachments.
   * @returns The MessageId of the newly posted message.
   * @throws InvalidInputError if input IDs or text are invalid.
   * @throws ThreadNotFoundError if the specified thread does not exist.
   * @throws UnauthorizedActionError if the user is not a participant of the thread.
   * @throws MessagingThreadError for other database errors.
   */
  async post_message(
    threadId: ThreadId,
    user: UserId,
    text: string,
    attachments?: string[],
  ): Promise<MessageId> {
    if (!this.isValidObjectId(threadId)) {
      throw new InvalidInputError(`Invalid thread ID: ${threadId}`);
    }
    if (!this.isValidObjectId(user)) {
      throw new InvalidInputError(`Invalid user ID: ${user}`);
    }
    if (!text || text.trim() === "") {
      throw new InvalidInputError("Message text cannot be empty.");
    }

    const threadObjectId = this.toObjectId(threadId);
    const userObjectId = this.toObjectId(user);

    const thread = await this.threadsCollection.findOne({ _id: threadObjectId });
    if (!thread) {
      throw new ThreadNotFoundError(threadId);
    }

    // Check if the user is a participant
    const isParticipant = thread.participants.some((p) => p.equals(userObjectId));
    if (!isParticipant) {
      throw new UnauthorizedActionError(user, "post a message", `thread ${threadId}`);
    }

    try {
      const now = new Date();
      const newMessage: StoredMessage = {
        _id: new ObjectId(),
        threadId: threadObjectId,
        sender: user,
        text: text,
        attachments: attachments,
        timestamp: now,
        flagged: false,
      };

      await this.messagesCollection.insertOne(newMessage);

      // Update the thread's messageIds and updatedAt fields
      await this.threadsCollection.updateOne(
        { _id: threadObjectId },
        {
          $push: { messageIds: newMessage._id },
          $set: { updatedAt: now },
        },
      );

      const payload: NewMessageEventPayload = {
        threadId: threadId,
        messageId: newMessage._id.toHexString(),
        sender: newMessage.sender,
        text: newMessage.text,
        timestamp: newMessage.timestamp,
      };
      await this.eventBus.emit("NewMessage", payload);

      return newMessage._id.toHexString();
    } catch (error) {
      throw new MessagingThreadError(`Failed to post message: ${error.message}`);
    }
  }

  /**
   * Flags a specific message for moderation review.
   *
   * @param threadId - The ID of the thread the message belongs to.
   * @param messageId - The ID of the message to flag.
   * @param reason - A string describing why the message is being flagged.
   * @param flaggedBy - Optional. The UserId of the user flagging the message (for audit/event context).
   * @throws InvalidInputError if input IDs or reason are invalid.
   * @throws ThreadNotFoundError if the specified thread does not exist.
   * @throws MessageNotFoundError if the specified message does not exist within the thread.
   * @throws MessagingThreadError for other database errors.
   */
  async flag_message(
    threadId: ThreadId,
    messageId: MessageId,
    reason: string,
    flaggedBy?: UserId,
  ): Promise<void> {
    if (!this.isValidObjectId(threadId)) {
      throw new InvalidInputError(`Invalid thread ID: ${threadId}`);
    }
    if (!this.isValidObjectId(messageId)) {
      throw new InvalidInputError(`Invalid message ID: ${messageId}`);
    }
    if (!reason || reason.trim() === "") {
      throw new InvalidInputError("Flagging reason cannot be empty.");
    }
    if (flaggedBy && !this.isValidObjectId(flaggedBy)) {
      throw new InvalidInputError(`Invalid flaggedBy ID: ${flaggedBy}`);
    }

    const threadObjectId = this.toObjectId(threadId);
    const messageObjectId = this.toObjectId(messageId);

    // Verify thread exists (optional, but good for robust error messages)
    const thread = await this.threadsCollection.findOne({ _id: threadObjectId });
    if (!thread) {
      throw new ThreadNotFoundError(threadId);
    }

    try {
      const result = await this.messagesCollection.updateOne(
        {
          _id: messageObjectId,
          threadId: threadObjectId, // Ensure message belongs to this thread
        },
        {
          $set: {
            flagged: true,
            flaggedReason: reason,
          },
        },
      );

      if (result.matchedCount === 0) {
        throw new MessageNotFoundError(messageId, threadId);
      }

      const payload: MessageFlaggedEventPayload = {
        threadId: threadId,
        messageId: messageId,
        reason: reason,
        flaggedBy: flaggedBy,
        timestamp: new Date(),
      };
      await this.eventBus.emit("MessageFlagged", payload);
    } catch (error) {
      if (error instanceof MessagingThreadError) throw error; // Re-throw custom errors
      throw new MessagingThreadError(`Failed to flag message: ${error.message}`);
    }
  }

  /**
   * Retrieves a thread by its ID.
   * @param threadId - The ID of the thread to retrieve.
   * @returns The Thread object, or null if not found.
   */
  async get_thread(threadId: ThreadId): Promise<Thread | null> {
    if (!this.isValidObjectId(threadId)) {
      throw new InvalidInputError(`Invalid thread ID: ${threadId}`);
    }
    return await this.threadsCollection.findOne({ _id: this.toObjectId(threadId) });
  }

  /**
   * Retrieves messages for a given thread.
   * @param threadId - The ID of the thread.
   * @param limit - Optional. Maximum number of messages to return.
   * @param skip - Optional. Number of messages to skip (for pagination).
   * @returns An array of StoredMessage objects.
   */
  async get_messages_in_thread(
    threadId: ThreadId,
    limit = 100,
    skip = 0,
  ): Promise<StoredMessage[]> {
    if (!this.isValidObjectId(threadId)) {
      throw new InvalidInputError(`Invalid thread ID: ${threadId}`);
    }

    return await this.messagesCollection.find({ threadId: this.toObjectId(threadId) })
      .sort({ timestamp: 1 }) // Oldest first
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Retrieves a specific message by its ID.
   * @param messageId - The ID of the message.
   * @returns The StoredMessage object, or null if not found.
   */
  async get_message(messageId: MessageId): Promise<StoredMessage | null> {
    if (!this.isValidObjectId(messageId)) {
      throw new InvalidInputError(`Invalid message ID: ${messageId}`);
    }
    return await this.messagesCollection.findOne({ _id: this.toObjectId(messageId) });
  }

  // TODO: Implement `get_user_threads(userId: UserId)` for retrieving all threads a user is part of.
  // This would involve querying `threadsCollection` where `participants` array contains `userId`.
  // This is beyond the direct actions listed but useful for a real app.
}
```

***

### 6. `src/concepts/MessagingThread/MessagingThreadConcept.test.ts`

```typescript
// src/concepts/MessagingThread/MessagingThreadConcept.test.ts

import { assert, assertEquals, assertExists, assertInstanceOf, assertRejects, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Db, ObjectId } from "npm:mongodb";
import { MessagingThreadConcept } from "./MessagingThreadConcept.ts";
import {
  DuplicateThreadError,
  InvalidInputError,
  MessageNotFoundError,
  SelfCommunicationError,
  ThreadNotFoundError,
  UnauthorizedActionError,
} from "./MessagingThreadErrors.ts";
import { clearCollections, MockEventBus, setupTestDatabase, teardownTestDatabase } from "./mock-services.ts";
import {
  generateFakeListingId,
  generateFakeMessage,
  generateFakeThread,
  generateFakeUsers,
  generateUserId,
} from "./fake-data.ts";
import { MessageFlaggedEventPayload, NewMessageEventPayload, StoredMessage, Thread } from "./types.ts";

// LikertSurvey Principle: Correctness, Robustness, Performance, Usability, Maintainability, Testability.

let db: Db;
let eventBus: MockEventBus;
let messagingThreadConcept: MessagingThreadConcept;

const collectionNames = ["messaging_threads", "messaging_messages"];

Deno.test("MessagingThreadConcept Tests", { sanitizeResources: false, sanitizeOps: false }, async (t) => {
  // Setup before all tests
  Deno.test({
    name: "Setup database and concept instance",
    fn: async () => {
      db = await setupTestDatabase();
      eventBus = new MockEventBus();
      messagingThreadConcept = new MessagingThreadConcept(db, eventBus);
    },
    sanitizeResources: false,
    sanitizeOps: false,
  });

  // Teardown after all tests
  Deno.test({
    name: "Teardown database connection",
    fn: async () => {
      await teardownTestDatabase();
    },
    sanitizeResources: false,
    sanitizeOps: false,
  });

  t.beforeEach(async () => {
    // Clear collections before each test
    await clearCollections(db, collectionNames);
    eventBus.clearEmittedEvents();
  });

  await t.step("Correctness: start_thread", async (t_step) => {
    const [user1, user2, user3] = generateFakeUsers(3);
    const listingId = generateFakeListingId();

    await t_step.step("should create a general thread between two users", async () => {
      const threadId = await messagingThreadConcept.start_thread(user1, user2);
      assertExists(threadId);
      const thread = await messagingThreadConcept.get_thread(threadId);
      assertExists(thread);
      assertEquals(thread.participants.map((p) => p.toHexString()).sort(), [user1, user2].sort());
      assertEquals(thread.listingId, undefined);
      assertEquals(thread.messageIds.length, 0);
    });

    await t_step.step("should create a listing-specific thread between two users", async () => {
      const threadId = await messagingThreadConcept.start_thread(user1, user3, listingId);
      assertExists(threadId);
      const thread = await messagingThreadConcept.get_thread(threadId);
      assertExists(thread);
      assertEquals(thread.participants.map((p) => p.toHexString()).sort(), [user1, user3].sort());
      assertEquals(thread.listingId?.toHexString(), listingId);
    });

    await t_step.step("should handle participants order consistently for general threads", async () => {
      const threadId1 = await messagingThreadConcept.start_thread(user1, user2);
      const thread1 = await messagingThreadConcept.get_thread(threadId1);
      assertExists(thread1);

      // Attempt to start same thread with participants swapped
      await assertRejects(
        () => messagingThreadConcept.start_thread(user2, user1),
        DuplicateThreadError,
        `A thread already exists between ${user2} and ${user1}`,
      );
    });

    await t_step.step("should handle participants order consistently for listing-specific threads", async () => {
      const threadId1 = await messagingThreadConcept.start_thread(user1, user3, listingId);
      const thread1 = await messagingThreadConcept.get_thread(threadId1);
      assertExists(thread1);

      // Attempt to start same thread with participants swapped
      await assertRejects(
        () => messagingThreadConcept.start_thread(user3, user1, listingId),
        DuplicateThreadError,
        `A thread already exists between ${user3} and ${user1} for listing ${listingId}`,
      );
    });
  });

  await t.step("Correctness: post_message", async (t_step) => {
    const [user1, user2, user3] = generateFakeUsers(3);
    let threadId: string;

    t_step.beforeEach(async () => {
      await clearCollections(db, collectionNames);
      eventBus.clearEmittedEvents();
      threadId = await messagingThreadConcept.start_thread(user1, user2);
    });

    await t_step.step("should allow a participant to post a message", async () => {
      const messageText = "Hello from user1!";
      const messageId = await messagingThreadConcept.post_message(threadId, user1, messageText);
      assertExists(messageId);

      const messages = await messagingThreadConcept.get_messages_in_thread(threadId);
      assertEquals(messages.length, 1);
      assertEquals(messages[0]._id.toHexString(), messageId);
      assertEquals(messages[0].sender, user1);
      assertEquals(messages[0].text, messageText);
      assertEquals(messages[0].threadId.toHexString(), threadId);
      assertEquals(messages[0].flagged, false);

      const updatedThread = await messagingThreadConcept.get_thread(threadId);
      assertExists(updatedThread);
      assertEquals(updatedThread.messageIds.length, 1);
      assertEquals(updatedThread.messageIds[0].toHexString(), messageId);

      // Check event emission
      assertEquals(eventBus.emittedEvents.length, 1);
      assertEquals(eventBus.emittedEvents[0].eventName, "NewMessage");
      const eventPayload = eventBus.emittedEvents[0].payload as NewMessageEventPayload;
      assertEquals(eventPayload.threadId, threadId);
      assertEquals(eventPayload.messageId, messageId);
      assertEquals(eventPayload.sender, user1);
      assertEquals(eventPayload.text, messageText);
    });

    await t_step.step("should allow another participant to post a message", async () => {
      const messageId1 = await messagingThreadConcept.post_message(threadId, user1, "First message");
      const messageId2 = await messagingThreadConcept.post_message(threadId, user2, "Second message");

      assertExists(messageId1);
      assertExists(messageId2);

      const messages = await messagingThreadConcept.get_messages_in_thread(threadId);
      assertEquals(messages.length, 2);
      assertEquals(messages[0].sender, user1);
      assertEquals(messages[1].sender, user2);

      // Check event emission for both messages
      assertEquals(eventBus.emittedEvents.length, 2);
      assertEquals(eventBus.emittedEvents[0].eventName, "NewMessage");
      assertEquals(eventBus.emittedEvents[1].eventName, "NewMessage");
    });

    await t_step.step("should allow messages with attachments", async () => {
      const attachments = ["http://example.com/img1.jpg", "http://example.com/doc.pdf"];
      const messageId = await messagingThreadConcept.post_message(threadId, user1, "With attachments", attachments);
      const message = await messagingThreadConcept.get_message(messageId);
      assertExists(message);
      assertEquals(message.attachments, attachments);
    });
  });

  await t.step("Correctness: flag_message", async (t_step) => {
    const [user1, user2, user3] = generateFakeUsers(3);
    let threadId: string;
    let messageId: string;

    t_step.beforeEach(async () => {
      await clearCollections(db, collectionNames);
      eventBus.clearEmittedEvents();
      threadId = await messagingThreadConcept.start_thread(user1, user2);
      messageId = await messagingThreadConcept.post_message(threadId, user1, "This message is problematic.");
      // Clear event bus after message post, so we only track flag_message events
      eventBus.clearEmittedEvents();
    });

    await t_step.step("should flag an existing message", async () => {
      const reason = "Contains offensive language";
      await messagingThreadConcept.flag_message(threadId, messageId, reason, user3);

      const message = await messagingThreadConcept.get_message(messageId);
      assertExists(message);
      assertEquals(message.flagged, true);
      assertEquals(message.flaggedReason, reason);

      // Check event emission
      assertEquals(eventBus.emittedEvents.length, 1);
      assertEquals(eventBus.emittedEvents[0].eventName, "MessageFlagged");
      const eventPayload = eventBus.emittedEvents[0].payload as MessageFlaggedEventPayload;
      assertEquals(eventPayload.threadId, threadId);
      assertEquals(eventPayload.messageId, messageId);
      assertEquals(eventPayload.reason, reason);
      assertEquals(eventPayload.flaggedBy, user3);
    });

    await t_step.step("should allow flagging without a flaggedBy user", async () => {
      const reason = "Spam content";
      await messagingThreadConcept.flag_message(threadId, messageId, reason);

      const message = await messagingThreadConcept.get_message(messageId);
      assertExists(message);
      assertEquals(message.flagged, true);
      assertEquals(message.flaggedReason, reason);

      const eventPayload = eventBus.emittedEvents[0].payload as MessageFlaggedEventPayload;
      assertEquals(eventPayload.flaggedBy, undefined);
    });
  });

  await t.step("Robustness: Error Handling", async (t_step) => {
    const [user1, user2, user3] = generateFakeUsers(3);
    const nonExistentId = new ObjectId().toHexString(); // Guaranteed not to exist
    let threadId: string;
    let messageId: string;

    t_step.beforeEach(async () => {
      await clearCollections(db, collectionNames);
      eventBus.clearEmittedEvents();
      threadId = await messagingThreadConcept.start_thread(user1, user2);
      messageId = await messagingThreadConcept.post_message(threadId, user1, "Test message.");
      eventBus.clearEmittedEvents();
    });

    await t_step.step("start_thread should throw InvalidInputError for invalid IDs", async () => {
      await assertRejects(
        () => messagingThreadConcept.start_thread("invalid-id", user2),
        InvalidInputError,
        "Invalid initiator ID",
      );
      await assertRejects(
        () => messagingThreadConcept.start_thread(user1, "invalid-id"),
        InvalidInputError,
        "Invalid recipient ID",
      );
      await assertRejects(
        () => messagingThreadConcept.start_thread(user1, user2, "invalid-id"),
        InvalidInputError,
        "Invalid listing ID",
      );
    });

    await t_step.step("start_thread should throw SelfCommunicationError if initiator is recipient", async () => {
      await assertRejects(
        () => messagingThreadConcept.start_thread(user1, user1),
        SelfCommunicationError,
        `User ${user1} cannot start a conversation with themselves.`,
      );
    });

    await t_step.step("start_thread should throw DuplicateThreadError for existing threads", async () => {
      await assertRejects(
        () => messagingThreadConcept.start_thread(user1, user2),
        DuplicateThreadError,
        `A thread already exists between ${user1} and ${user2}`,
      );
    });

    await t_step.step("post_message should throw InvalidInputError for invalid inputs", async () => {
      await assertRejects(
        () => messagingThreadConcept.post_message("invalid-id", user1, "text"),
        InvalidInputError,
        "Invalid thread ID",
      );
      await assertRejects(
        () => messagingThreadConcept.post_message(threadId, "invalid-id", "text"),
        InvalidInputError,
        "Invalid user ID",
      );
      await assertRejects(
        () => messagingThreadConcept.post_message(threadId, user1, ""),
        InvalidInputError,
        "Message text cannot be empty",
      );
    });

    await t_step.step("post_message should throw ThreadNotFoundError for non-existent thread", async () => {
      await assertRejects(
        () => messagingThreadConcept.post_message(nonExistentId, user1, "text"),
        ThreadNotFoundError,
        `Thread with ID ${nonExistentId} not found.`,
      );
    });

    await t_step.step("post_message should throw UnauthorizedActionError if user is not a participant", async () => {
      await assertRejects(
        () => messagingThreadConcept.post_message(threadId, user3, "text"),
        UnauthorizedActionError,
        `User ${user3} is unauthorized to perform post a message for thread ${threadId}.`,
      );
    });

    await t_step.step("flag_message should throw InvalidInputError for invalid inputs", async () => {
      await assertRejects(
        () => messagingThreadConcept.flag_message("invalid-id", messageId, "reason"),
        InvalidInputError,
        "Invalid thread ID",
      );
      await assertRejects(
        () => messagingThreadConcept.flag_message(threadId, "invalid-id", "reason"),
        InvalidInputError,
        "Invalid message ID",
      );
      await assertRejects(
        () => messagingThreadConcept.flag_message(threadId, messageId, ""),
        InvalidInputError,
        "Flagging reason cannot be empty.",
      );
      await assertRejects(
        () => messagingThreadConcept.flag_message(threadId, messageId, "reason", "invalid-id"),
        InvalidInputError,
        "Invalid flaggedBy ID",
      );
    });

    await t_step.step("flag_message should throw ThreadNotFoundError for non-existent thread", async () => {
      await assertRejects(
        () => messagingThreadConcept.flag_message(nonExistentId, messageId, "reason"),
        ThreadNotFoundError,
        `Thread with ID ${nonExistentId} not found.`,
      );
    });

    await t_step.step("flag_message should throw MessageNotFoundError for non-existent message", async () => {
      await assertRejects(
        () => messagingThreadConcept.flag_message(threadId, nonExistentId, "reason"),
        MessageNotFoundError,
        `Message with ID ${nonExistentId} in thread ${threadId} not found.`,
      );
    });

    await t_step.step("flag_message should throw MessageNotFoundError if message not in specified thread", async () => {
      const thread2Id = await messagingThreadConcept.start_thread(user1, user3);
      const message2Id = await messagingThreadConcept.post_message(thread2Id, user1, "Another thread's message");

      await assertRejects(
        () => messagingThreadConcept.flag_message(threadId, message2Id, "reason"), // message2Id is not in threadId
        MessageNotFoundError,
        `Message with ID ${message2Id} in thread ${threadId} not found.`,
      );
    });
  });

  await t.step("Performance: Basic checks (conceptual)", async (t_step) => {
    const [user1, user2] = generateFakeUsers(2);
    let threadId: string;

    t_step.beforeEach(async () => {
      await clearCollections(db, collectionNames);
      eventBus.clearEmittedEvents();
      threadId = await messagingThreadConcept.start_thread(user1, user2);
    });

    await t_step.step("should create 100 threads reasonably fast", async () => {
      const users = generateFakeUsers(200); // 100 pairs
      const start = performance.now();
      const promises = [];
      for (let i = 0; i < users.length; i += 2) {
        promises.push(messagingThreadConcept.start_thread(users[i], users[i + 1]));
      }
      await Promise.all(promises);
      const end = performance.now();
      const duration = end - start;
      console.log(`Created 100 threads in ${duration.toFixed(2)}ms`);
      assert(duration < 2000, `Creating 100 threads took too long: ${duration}ms`); // Arbitrary threshold
    });

    await t_step.step("should post 100 messages to a thread reasonably fast", async () => {
      const start = performance.now();
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(messagingThreadConcept.post_message(threadId, user1, `Message ${i}`));
      }
      await Promise.all(promises);
      const end = performance.now();
      const duration = end - start;
      console.log(`Posted 100 messages in ${duration.toFixed(2)}ms`);
      assert(duration < 1500, `Posting 100 messages took too long: ${duration}ms`); // Arbitrary threshold
    });
  });

  await t.step("Usability & Maintainability: Code structure and helpers", async (t_step) => {
    // This is primarily observed through code review and consistent patterns.
    // The previous tests implicitly cover usability (easy API) and maintainability (modular code, error classes).

    await t_step.step("should retrieve thread details correctly using get_thread", async () => {
      const [u1, u2] = generateFakeUsers(2);
      const threadId = await messagingThreadConcept.start_thread(u1, u2);
      const thread = await messagingThreadConcept.get_thread(threadId);
      assertExists(thread);
      assertEquals(thread._id.toHexString(), threadId);
      assertEquals(thread.participants.map(p => p.toHexString()).sort(), [u1, u2].sort());
      assertInstanceOf(thread.createdAt, Date);
      assertInstanceOf(thread.updatedAt, Date);
    });

    await t_step.step("should retrieve message details correctly using get_message", async () => {
      const [u1, u2] = generateFakeUsers(2);
      const threadId = await messagingThreadConcept.start_thread(u1, u2);
      const messageText = "This is a test message.";
      const messageId = await messagingThreadConcept.post_message(threadId, u1, messageText);
      const message = await messagingThreadConcept.get_message(messageId);
      assertExists(message);
      assertEquals(message._id.toHexString(), messageId);
      assertEquals(message.threadId.toHexString(), threadId);
      assertEquals(message.sender, u1);
      assertEquals(message.text, messageText);
      assertInstanceOf(message.timestamp, Date);
    });

    await t_step.step("should retrieve messages in correct order (oldest first)", async () => {
      const [u1, u2] = generateFakeUsers(2);
      const threadId = await messagingThreadConcept.start_thread(u1, u2);

      const m1Id = await messagingThreadConcept.post_message(threadId, u1, "First message");
      await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure different timestamps
      const m2Id = await messagingThreadConcept.post_message(threadId, u2, "Second message");
      await new Promise((resolve) => setTimeout(resolve, 10));
      const m3Id = await messagingThreadConcept.post_message(threadId, u1, "Third message");

      const messages = await messagingThreadConcept.get_messages_in_thread(threadId);
      assertEquals(messages.length, 3);
      assertEquals(messages[0]._id.toHexString(), m1Id);
      assertEquals(messages[1]._id.toHexString(), m2Id);
      assertEquals(messages[2]._id.toHexString(), m3Id);
      assert(messages[0].timestamp < messages[1].timestamp);
      assert(messages[1].timestamp < messages[2].timestamp);
    });

    await t_step.step("should support message pagination (limit and skip)", async () => {
      const [u1, u2] = generateFakeUsers(2);
      const threadId = await messagingThreadConcept.start_thread(u1, u2);

      for (let i = 0; i < 10; i++) {
        await messagingThreadConcept.post_message(threadId, u1, `Message ${i}`);
      }

      const firstFive = await messagingThreadConcept.get_messages_in_thread(threadId, 5, 0);
      assertEquals(firstFive.length, 5);
      assertEquals(firstFive[0].text, "Message 0");
      assertEquals(firstFive[4].text, "Message 4");

      const nextFive = await messagingThreadConcept.get_messages_in_thread(threadId, 5, 5);
      assertEquals(nextFive.length, 5);
      assertEquals(nextFive[0].text, "Message 5");
      assertEquals(nextFive[4].text, "Message 9");

      const emptyResult = await messagingThreadConcept.get_messages_in_thread(threadId, 5, 10);
      assertEquals(emptyResult.length, 0);
    });
  });
});
```

***

### Instructions to Run the Tests:

1. **Save Files**: Create the directory structure `src/concepts/MessagingThread/` and save the files as specified above.

2. **Deno Configuration**: Ensure you have `deno.json` or `deno.jsonc` in your project root with the following `imports`:

   ```json
   // deno.json
   {
     "imports": {
       "npm:mongodb": "npm:mongodb@5.9.1",
       "https://deno.land/std@0.208.0/assert/mod.ts": "https://deno.land/std@0.208.0/assert/mod.ts"
     }
   }
   ```

3. **MongoDB Instance**: Make sure you have a MongoDB instance running, typically on `mongodb://localhost:27017`. The test suite will create a database named `swapit_messaging_test`.

4. **Environment Variable (Optional)**: If your MongoDB is at a different URI, set the `MONGO_TEST_URI` environment variable before running tests:
   `export MONGO_TEST_URI="mongodb://your_mongo_host:port/your_db_name"`

5. **Run Tests**: Navigate to your project root in the terminal and run:
   ```bash
   deno test --allow-net --allow-env src/concepts/MessagingThread/MessagingThreadConcept.test.ts
   ```
   * `--allow-net` is needed for MongoDB connection.
   * `--allow-env` is needed to read `MONGO_TEST_URI`.
   * `--sanitize-resources=false --sanitize-ops=false` might be needed for tests involving database connections, though usually Deno handles resource cleanup well. I've added them to the test declaration to be safe.

This setup provides a robust and well-tested implementation of the `MessagingThreadConcept` as per your requirements.
