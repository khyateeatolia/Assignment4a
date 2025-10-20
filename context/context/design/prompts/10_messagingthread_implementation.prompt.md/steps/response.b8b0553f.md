---
timestamp: 'Sun Oct 19 2025 18:17:45 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_181745.10581272.md]]'
content_id: b8b0553fa21bfa2ef2d47fff121745c6d3410ddb25a5674b0bc1c37d960cefd5
---

# response:

The `MessagingThread` concept for the SwapIt marketplace system has been implemented following the specified requirements and patterns. This implementation focuses on structured communication around listings, integrating with MongoDB, an Event Bus, and custom error handling, alongside a comprehensive test suite.

***

### File: `src/types.ts`

This file defines all shared interfaces, types, and enums used across the concept, including MongoDB document structures, event payloads, and service interfaces.

```typescript
// src/types.ts
import { ObjectId } from 'mongodb';

/**
 * Event Bus Interface
 * Defines the contract for an event bus system used for emitting notifications.
 */
export interface IEventBus {
    emit<T extends string, P>(eventName: T, payload: P): void;
    on<T extends string, P>(eventName: T, handler: (payload: P) => void): void;
    off<T extends string, P>(eventName: T, handler: (payload: P) => void): void;
}

/**
 * Listing Service Interface
 * Defines the contract for retrieving listing-related information, specifically the owner.
 * This is crucial for initializing a communication thread between an interested user and the listing owner.
 */
export interface IListingService {
    getListingOwner(listingId: ObjectId): Promise<ObjectId | null>;
}

// Type aliases for clarity, all IDs are MongoDB ObjectIds
export type ThreadId = ObjectId;
export type ListingId = ObjectId;
export type UserId = ObjectId;
export type MessageId = ObjectId;
export type Timestamp = Date;
export type Url = string; // For attachments

/**
 * Enum for Thread Status
 * Represents the current state of a communication thread.
 */
export enum ThreadStatus {
    ACTIVE = 'active',
    PICKUP_COMPLETED = 'pickup_completed', // Indicates a transaction milestone
    ARCHIVED = 'archived' // Thread is no longer active for messaging
}

/**
 * Message Interface
 * Represents a single message within a communication thread.
 * Corresponds to a document in the 'messages' MongoDB collection.
 */
export interface Message {
    _id?: MessageId; // MongoDB ObjectId, generated upon insertion
    threadId: ThreadId; // Links message to its parent thread
    sender: UserId; // The user who sent the message
    text: string; // The content of the message
    attachments?: Url[]; // Optional list of URLs for attachments
    timestamp: Timestamp; // When the message was sent
    flagged?: boolean; // True if the message has been flagged for moderation
    flaggedBy?: UserId; // The user who flagged the message
    flagReason?: string; // The reason provided for flagging
}

/**
 * Thread Interface
 * Represents a communication thread between users regarding a specific listing.
 * Corresponds to a document in the 'threads' MongoDB collection.
 */
export interface Thread {
    _id?: ThreadId; // MongoDB ObjectId, generated upon insertion
    listingId: ListingId; // The listing this thread is about
    participants: UserId[]; // Array of UserIds involved in the thread
    messages: MessageId[]; // Array of MessageIds, storing references to messages
    status: ThreadStatus; // Current status of the thread
    createdAt: Timestamp; // When the thread was created
    updatedAt: Timestamp; // Last time the thread was updated (e.g., new message, status change)
}

/**
 * NewMessageEventPayload
 * Data structure for the 'NewMessage' event.
 */
export interface NewMessageEventPayload {
    threadId: ThreadId;
    messageId: MessageId;
    senderId: UserId;
    listingId: ListingId;
    text: string;
    attachments?: Url[];
    timestamp: Timestamp;
}

/**
 * MessageFlaggedEventPayload
 * Data structure for the 'MessageFlagged' event.
 */
export interface MessageFlaggedEventPayload {
    threadId: ThreadId;
    messageId: MessageId;
    flaggedBy: UserId;
    reason: string;
    timestamp: Timestamp;
}
```

***

### File: `src/MessagingThreadErrors.ts`

This file defines custom error classes for the `MessagingThread` concept, providing specific error types for better error handling and debugging.

```typescript
// src/MessagingThreadErrors.ts

/**
 * Base error class for MessagingThread concept.
 */
export class MessagingThreadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, new.target.prototype); // Restore prototype chain
    }
}

/**
 * Error thrown when a specified thread is not found.
 */
export class ThreadNotFoundError extends MessagingThreadError {
    constructor(threadId: string) {
        super(`Thread with ID ${threadId} not found.`);
    }
}

/**
 * Error thrown when a specified message is not found.
 */
export class MessageNotFoundError extends MessagingThreadError {
    constructor(messageId: string) {
        super(`Message with ID ${messageId} not found.`);
    }
}

/**
 * Error thrown when a user attempts an action (e.g., posting a message)
 * but is not a participant in the specified thread.
 */
export class UserNotParticipantError extends MessagingThreadError {
    constructor(userId: string, threadId: string) {
        super(`User ${userId} is not a participant in thread ${threadId}.`);
    }
}

/**
 * Error thrown when an invalid input is provided, e.g., empty text, invalid URL.
 */
export class InvalidInputError extends MessagingThreadError {
    constructor(message: string) {
        super(`Invalid input: ${message}`);
    }
}

/**
 * Error thrown when a requested state transition for a thread is not allowed.
 */
export class InvalidThreadStateError extends MessagingThreadError {
    constructor(threadId: string, currentStatus: string, action: string) {
        super(`Thread ${threadId} (status: ${currentStatus}) cannot perform action: ${action}.`);
    }
}

/**
 * Error thrown when the listing owner cannot be retrieved for a given listing.
 * This can happen if the listing ID is invalid or the listing doesn't exist.
 */
export class ListingOwnerNotFoundError extends MessagingThreadError {
    constructor(listingId: string) {
        super(`Could not find owner for listing ID ${listingId}.`);
    }
}

/**
 * Error thrown when an attempt is made to perform an action on a message
 * that does not belong to the specified thread.
 */
export class MessageThreadMismatchError extends MessagingThreadError {
    constructor(messageId: string, threadId: string) {
        super(`Message ${messageId} does not belong to thread ${threadId}.`);
    }
}
```

***

### File: `src/mock-services.ts`

This file provides mock implementations for `IEventBus` and `IListingService` to facilitate testing without requiring actual external dependencies. It also includes database setup utilities.

```typescript
// src/mock-services.ts
import { Collection, Db, MongoClient, ObjectId } from 'mongodb';
import { IEventBus, IListingService, Thread, Message } from './types';

// --- Mock Event Bus Implementation ---
export class MockEventBus implements IEventBus {
    private listeners: Map<string, Function[]>;
    public emittedEvents: { eventName: string; payload: any }[];

    constructor() {
        this.listeners = new Map();
        this.emittedEvents = []; // To track emitted events in tests
    }

    emit<T extends string, P>(eventName: T, payload: P): void {
        this.emittedEvents.push({ eventName, payload });
        const handlers = this.listeners.get(eventName) || [];
        handlers.forEach(handler => handler(payload));
    }

    on<T extends string, P>(eventName: T, handler: (payload: P) => void): void {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName)!.push(handler);
    }

    off<T extends string, P>(eventName: T, handler: (payload: P) => void): void {
        const handlers = this.listeners.get(eventName);
        if (handlers) {
            this.listeners.set(eventName, handlers.filter(h => h !== handler));
        }
    }

    // Helper for tests to clear emitted events
    clearEmittedEvents(): void {
        this.emittedEvents = [];
    }
}

// --- Mock Listing Service Implementation ---
export class MockListingService implements IListingService {
    private listingOwners: Map<string, ObjectId>; // Map<listingId.toString(), ownerId>

    constructor() {
        this.listingOwners = new Map();
    }

    /**
     * Sets a known listing owner for a given listing ID.
     * @param listingId The ID of the listing.
     * @param ownerId The ID of the owner.
     */
    setListingOwner(listingId: ObjectId, ownerId: ObjectId): void {
        this.listingOwners.set(listingId.toHexString(), ownerId);
    }

    /**
     * Retrieves the owner ID for a given listing ID.
     * @param listingId The ID of the listing.
     * @returns The owner's ObjectId or null if not found.
     */
    async getListingOwner(listingId: ObjectId): Promise<ObjectId | null> {
        return Promise.resolve(this.listingOwners.get(listingId.toHexString()) || null);
    }

    // Helper for tests to clear owners
    clearListingOwners(): void {
        this.listingOwners.clear();
    }
}

// --- Database Setup Utilities for Testing ---
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017';
const TEST_DB_NAME = 'swapit_test_messaging';

let client: MongoClient;
let db: Db;

/**
 * Connects to the MongoDB test database.
 * @returns A promise that resolves with the connected Db instance.
 */
export const connectToTestDB = async (): Promise<Db> => {
    if (!client || !client.topology || !client.topology.isConnected()) {
        client = new MongoClient(MONGODB_TEST_URI);
        await client.connect();
        db = client.db(TEST_DB_NAME);
    }
    return db;
};

/**
 * Closes the MongoDB test database connection.
 */
export const closeTestDB = async (): Promise<void> => {
    if (client && client.topology && client.topology.isConnected()) {
        await client.close();
    }
};

/**
 * Cleans up the test database by dropping all collections.
 */
export const cleanupTestDB = async (): Promise<void> => {
    if (db) {
        const collections = await db.listCollections().toArray();
        for (const collection of collections) {
            await db.collection(collection.name).drop();
        }
    }
};

/**
 * Helper to get a collection with the correct type.
 */
export const getCollection = <T>(collectionName: string): Collection<T> => {
    if (!db) {
        throw new Error("Database not connected. Call connectToTestDB first.");
    }
    return db.collection<T>(collectionName);
};
```

***

### File: `src/fake-data.ts`

This file provides functions to generate realistic-looking fake data, which is essential for comprehensive testing of the `MessagingThread` concept.

```typescript
// src/fake-data.ts
import { ObjectId } from 'mongodb';
import { Thread, Message, ThreadStatus, UserId, ListingId, ThreadId, MessageId } from './types';

/**
 * Generates a random ObjectId.
 */
export const generateObjectId = (): ObjectId => new ObjectId();

/**
 * Generates a fake UserId.
 */
export const generateUserId = (): UserId => generateObjectId();

/**
 * Generates a fake ListingId.
 */
export const generateListingId = (): ListingId => generateObjectId();

/**
 * Generates a fake ThreadId.
 */
export const generateThreadId = (): ThreadId => generateObjectId();

/**
 * Generates a fake MessageId.
 */
export const generateMessageId = (): MessageId => generateObjectId();

/**
 * Generates a random URL.
 */
export const generateRandomUrl = (base: string = 'https://example.com/attachments/'): string => {
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = Math.random() < 0.5 ? '.jpg' : '.pdf';
    return `${base}${randomString}${fileExtension}`;
};

/**
 * Generates a fake message object.
 */
export const generateFakeMessage = (
    threadId: ThreadId,
    sender: UserId,
    text: string = `Hello from ${sender.toHexString()}! This is a test message.`,
    attachments?: string[],
    flagged: boolean = false,
    flaggedBy?: UserId,
    flagReason?: string,
    timestamp: Date = new Date()
): Message => ({
    _id: generateMessageId(),
    threadId,
    sender,
    text,
    attachments,
    timestamp,
    flagged,
    flaggedBy,
    flagReason
});

/**
 * Generates a fake thread object.
 */
export const generateFakeThread = (
    listingId: ListingId,
    participants: UserId[],
    status: ThreadStatus = ThreadStatus.ACTIVE,
    messages: MessageId[] = [],
    createdAt: Date = new Date(),
    updatedAt: Date = new Date()
): Thread => ({
    _id: generateThreadId(),
    listingId,
    participants,
    messages,
    status,
    createdAt,
    updatedAt
});

/**
 * Generates a list of fake URLs.
 */
export const generateFakeUrls = (count: number = 2): string[] => {
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
        urls.push(generateRandomUrl());
    }
    return urls;
};
```

***

### File: `src/MessagingThreadConcept.ts`

This is the core implementation of the `MessagingThread` concept, containing the class definition, action methods, and internal helpers.

```typescript
// src/MessagingThreadConcept.ts
import { Collection, Db, ObjectId } from 'mongodb';
import {
    IEventBus,
    IListingService,
    Message,
    Thread,
    ThreadId,
    MessageId,
    UserId,
    ListingId,
    ThreadStatus,
    Url,
    NewMessageEventPayload,
    MessageFlaggedEventPayload
} from './types';
import {
    ThreadNotFoundError,
    MessageNotFoundError,
    UserNotParticipantError,
    InvalidInputError,
    InvalidThreadStateError,
    ListingOwnerNotFoundError,
    MessageThreadMismatchError
} from './MessagingThreadErrors';

const THREADS_COLLECTION = 'threads';
const MESSAGES_COLLECTION = 'messages';

/**
 * Implementation of the MessagingThread concept for SwapIt marketplace.
 * Manages communication threads between users concerning specific listings.
 */
export class MessagingThreadConcept {
    private threads: Collection<Thread>;
    private messages: Collection<Message>;
    private eventBus: IEventBus;
    private listingService: IListingService;

    constructor(db: Db, eventBus: IEventBus, listingService: IListingService) {
        this.threads = db.collection<Thread>(THREADS_COLLECTION);
        this.messages = db.collection<Message>(MESSAGES_COLLECTION);
        this.eventBus = eventBus;
        this.listingService = listingService;
        this.initializeIndexes();
    }

    /**
     * Initializes MongoDB indexes for efficient querying.
     * Ensures uniqueness and speeds up common lookup operations.
     */
    private async initializeIndexes() {
        await this.threads.createIndex({ listingId: 1 });
        await this.threads.createIndex({ participants: 1 });
        await this.threads.createIndex({ status: 1 });
        await this.threads.createIndex({ updatedAt: -1 }); // For sorting recent threads

        await this.messages.createIndex({ threadId: 1 });
        await this.messages.createIndex({ sender: 1 });
        await this.messages.createIndex({ timestamp: -1 }); // For sorting recent messages
        await this.messages.createIndex({ flagged: 1 });
    }

    // --- Input Validation Helpers ---

    private validateObjectId(id: ObjectId, name: string): void {
        if (!id || !ObjectId.isValid(id)) {
            throw new InvalidInputError(`${name} must be a valid ObjectId.`);
        }
    }

    private validateMessageText(text: string): void {
        if (!text || text.trim().length === 0) {
            throw new InvalidInputError('Message text cannot be empty.');
        }
    }

    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    }

    private validateAttachments(attachments?: Url[]): void {
        if (attachments && (!Array.isArray(attachments) || attachments.some(url => !this.isValidUrl(url)))) {
            throw new InvalidInputError('Attachments must be an array of valid URLs.');
        }
    }

    private validateReason(reason: string): void {
        if (!reason || reason.trim().length === 0) {
            throw new InvalidInputError('Reason for flagging cannot be empty.');
        }
    }

    // --- Core Actions ---

    /**
     * Starts a new communication thread between an initiator and the listing owner.
     * @param initiatorId The UserId of the user initiating the thread.
     * @param listingId The ListingId the thread is about.
     * @returns The ThreadId of the newly created thread.
     * @throws {InvalidInputError} If provided IDs are invalid.
     * @throws {ListingOwnerNotFoundError} If the listing owner cannot be determined.
     */
    public async start_thread(initiatorId: UserId, listingId: ListingId): Promise<ThreadId> {
        this.validateObjectId(initiatorId, 'Initiator ID');
        this.validateObjectId(listingId, 'Listing ID');

        const listingOwnerId = await this.listingService.getListingOwner(listingId);
        if (!listingOwnerId) {
            throw new ListingOwnerNotFoundError(listingId.toHexString());
        }

        // Ensure unique participants (initiator and owner)
        const participants = Array.from(new Set([initiatorId, listingOwnerId]));

        const now = new Date();
        const newThread: Thread = {
            listingId,
            participants,
            messages: [],
            status: ThreadStatus.ACTIVE,
            createdAt: now,
            updatedAt: now
        };

        const result = await this.threads.insertOne(newThread);
        return result.insertedId;
    }

    /**
     * Posts a new message to an existing thread.
     * @param threadId The ID of the thread to post to.
     * @param user The UserId of the sender.
     * @param text The message content.
     * @param attachments Optional array of URLs for attachments.
     * @returns The MessageId of the newly posted message.
     * @throws {InvalidInputError} If message text or attachments are invalid.
     * @throws {ThreadNotFoundError} If the thread does not exist.
     * @throws {UserNotParticipantError} If the user is not a participant in the thread.
     * @throws {InvalidThreadStateError} If the thread is not in an active state.
     */
    public async post_message(
        threadId: ThreadId,
        user: UserId,
        text: string,
        attachments?: Url[]
    ): Promise<MessageId> {
        this.validateObjectId(threadId, 'Thread ID');
        this.validateObjectId(user, 'User ID');
        this.validateMessageText(text);
        this.validateAttachments(attachments);

        const thread = await this.threads.findOne({ _id: threadId });
        if (!thread) {
            throw new ThreadNotFoundError(threadId.toHexString());
        }

        if (!thread.participants.some(p => p.equals(user))) {
            throw new UserNotParticipantError(user.toHexString(), threadId.toHexString());
        }

        if (thread.status !== ThreadStatus.ACTIVE) {
            throw new InvalidThreadStateError(threadId.toHexString(), thread.status, 'post message');
        }

        const now = new Date();
        const newMessage: Message = {
            threadId,
            sender: user,
            text,
            attachments,
            timestamp: now
        };

        // Insert message
        const messageResult = await this.messages.insertOne(newMessage);
        const messageId = messageResult.insertedId;

        // Update thread with new message ID and updated timestamp
        const updateResult = await this.threads.updateOne(
            { _id: threadId },
            {
                $push: { messages: messageId },
                $set: { updatedAt: now }
            }
        );

        if (updateResult.modifiedCount === 0) {
            // This case indicates the thread might have been deleted concurrently,
            // or the push failed for some reason. Message is orphaned.
            // In a real system, you might add retry logic or a cleanup mechanism.
            console.error(`Failed to update thread ${threadId.toHexString()} with new message ${messageId.toHexString()}. Message might be orphaned.`);
            // Optionally, delete the orphaned message or throw a more specific error
            throw new MessagingThreadError(`Failed to link message to thread ${threadId.toHexString()}.`);
        }

        // Emit NewMessage event
        this.eventBus.emit('NewMessage', {
            threadId,
            messageId,
            senderId: user,
            listingId: thread.listingId,
            text,
            attachments,
            timestamp: now
        } as NewMessageEventPayload);

        return messageId;
    }

    /**
     * Flags a specific message within a thread for moderation.
     * @param threadId The ID of the thread the message belongs to.
     * @param messageId The ID of the message to flag.
     * @param flaggingUser The UserId of the user flagging the message.
     * @param reason The reason for flagging the message.
     * @throws {InvalidInputError} If IDs or reason are invalid.
     * @throws {MessageNotFoundError} If the message does not exist.
     * @throws {MessageThreadMismatchError} If the message does not belong to the specified thread.
     */
    public async flag_message(
        threadId: ThreadId,
        messageId: MessageId,
        flaggingUser: UserId,
        reason: string
    ): Promise<void> {
        this.validateObjectId(threadId, 'Thread ID');
        this.validateObjectId(messageId, 'Message ID');
        this.validateObjectId(flaggingUser, 'Flagging User ID');
        this.validateReason(reason);

        const message = await this.messages.findOne({ _id: messageId });
        if (!message) {
            throw new MessageNotFoundError(messageId.toHexString());
        }

        if (!message.threadId.equals(threadId)) {
            throw new MessageThreadMismatchError(messageId.toHexString(), threadId.toHexString());
        }

        // Update the message as flagged
        const updateResult = await this.messages.updateOne(
            { _id: messageId },
            {
                $set: {
                    flagged: true,
                    flaggedBy: flaggingUser,
                    flagReason: reason
                }
            }
        );

        if (updateResult.modifiedCount === 0) {
            // This might happen if message was already flagged, or not found concurrently.
            // For idempotentcy, we don't throw if it was already flagged.
            // If message was genuinely not found, findOne would have caught it.
            // console.warn(`Message ${messageId.toHexString()} was not updated by flag_message. Already flagged or concurrent issue?`);
        }

        // Emit MessageFlagged event for moderation system
        this.eventBus.emit('MessageFlagged', {
            threadId,
            messageId,
            flaggedBy: flaggingUser,
            reason,
            timestamp: new Date()
        } as MessageFlaggedEventPayload);
    }

    /**
     * Marks a thread as 'pickup complete'. This indicates a transaction milestone.
     * @param threadId The ID of the thread to mark.
     * @param user The UserId of the user marking the pickup complete.
     * @throws {InvalidInputError} If IDs are invalid.
     * @throws {ThreadNotFoundError} If the thread does not exist.
     * @throws {UserNotParticipantError} If the user is not a participant in the thread.
     * @throws {InvalidThreadStateError} If the thread is not in an active state.
     */
    public async mark_pickup_complete(threadId: ThreadId, user: UserId): Promise<void> {
        this.validateObjectId(threadId, 'Thread ID');
        this.validateObjectId(user, 'User ID');

        const thread = await this.threads.findOne({ _id: threadId });
        if (!thread) {
            throw new ThreadNotFoundError(threadId.toHexString());
        }

        if (!thread.participants.some(p => p.equals(user))) {
            throw new UserNotParticipantError(user.toHexString(), threadId.toHexString());
        }

        if (thread.status !== ThreadStatus.ACTIVE) {
            throw new InvalidThreadStateError(threadId.toHexString(), thread.status, 'mark pickup complete');
        }

        const updateResult = await this.threads.updateOne(
            { _id: threadId },
            { $set: { status: ThreadStatus.PICKUP_COMPLETED, updatedAt: new Date() } }
        );

        if (updateResult.modifiedCount === 0) {
            // This could happen if another user concurrently marked it complete, or thread was deleted.
            // For idempotentcy, if status is already PICKUP_COMPLETED, we might not want to throw.
            // However, the `if (thread.status !== ThreadStatus.ACTIVE)` check prevents this for now.
            throw new MessagingThreadError(`Failed to update thread ${threadId.toHexString()} status.`);
        }
    }

    // --- Query Methods (Helpers for testing and external access) ---

    /**
     * Retrieves a thread by its ID.
     * @param threadId The ID of the thread.
     * @returns The Thread object or null if not found.
     */
    public async getThread(threadId: ThreadId): Promise<Thread | null> {
        this.validateObjectId(threadId, 'Thread ID');
        return this.threads.findOne({ _id: threadId });
    }

    /**
     * Retrieves a message by its ID.
     * @param messageId The ID of the message.
     * @returns The Message object or null if not found.
     */
    public async getMessage(messageId: MessageId): Promise<Message | null> {
        this.validateObjectId(messageId, 'Message ID');
        return this.messages.findOne({ _id: messageId });
    }

    /**
     * Retrieves messages within a specific thread, with pagination.
     * @param threadId The ID of the thread.
     * @param limit Maximum number of messages to retrieve.
     * @param skip Number of messages to skip.
     * @returns An array of Message objects.
     */
    public async getMessagesInThread(threadId: ThreadId, limit: number = 50, skip: number = 0): Promise<Message[]> {
        this.validateObjectId(threadId, 'Thread ID');
        return this.messages
            .find({ threadId })
            .sort({ timestamp: 1 }) // Oldest first
            .skip(skip)
            .limit(limit)
            .toArray();
    }

    /**
     * Retrieves threads involving a specific participant.
     * @param userId The ID of the participant.
     * @param status Optional filter by thread status.
     * @returns An array of Thread objects.
     */
    public async getThreadsByParticipant(userId: UserId, status?: ThreadStatus): Promise<Thread[]> {
        this.validateObjectId(userId, 'User ID');
        const query: any = { participants: userId };
        if (status) {
            query.status = status;
        }
        return this.threads.find(query).sort({ updatedAt: -1 }).toArray();
    }
}
```

***

### File: `src/MessagingThreadConcept.test.ts`

This file contains the comprehensive test suite for the `MessagingThreadConcept`, covering all 6 test principles specified (Correctness, Robustness, Performance, Usability, Maintainability, Testability) using the LikertSurvey format.

```typescript
// src/MessagingThreadConcept.test.ts
import { Collection, Db, ObjectId } from 'mongodb';
import {
    MockEventBus,
    MockListingService,
    connectToTestDB,
    closeTestDB,
    cleanupTestDB,
    getCollection
} from './mock-services';
import {
    generateUserId,
    generateListingId,
    generateFakeMessage,
    generateFakeThread,
    generateFakeUrls,
    generateThreadId
} from './fake-data';
import { MessagingThreadConcept } from './MessagingThreadConcept';
import {
    MessagingThreadError,
    ThreadNotFoundError,
    MessageNotFoundError,
    UserNotParticipantError,
    InvalidInputError,
    InvalidThreadStateError,
    ListingOwnerNotFoundError,
    MessageThreadMismatchError
} from './MessagingThreadErrors';
import { Thread, Message, ThreadStatus, NewMessageEventPayload, MessageFlaggedEventPayload } from './types';

describe('MessagingThreadConcept', () => {
    let db: Db;
    let eventBus: MockEventBus;
    let listingService: MockListingService;
    let messagingConcept: MessagingThreadConcept;
    let threadsCollection: Collection<Thread>;
    let messagesCollection: Collection<Message>;

    // Setup and Teardown
    beforeAll(async () => {
        db = await connectToTestDB();
        threadsCollection = getCollection<Thread>('threads');
        messagesCollection = getCollection<Message>('messages');
    });

    beforeEach(async () => {
        await cleanupTestDB(); // Clean DB before each test
        eventBus = new MockEventBus();
        listingService = new MockListingService();
        messagingConcept = new MessagingThreadConcept(db, eventBus, listingService);

        // Ensure indexes are initialized (important for performance tests)
        await (messagingConcept as any).initializeIndexes();
    });

    afterAll(async () => {
        await closeTestDB();
    });

    // --- LikertSurvey Test Principles ---

    // 1. Correctness - Core functionality (thread creation, messaging, flagging)
    describe('1. Correctness', () => {
        const user1 = generateUserId();
        const user2 = generateUserId();
        const listingId = generateListingId();

        beforeEach(() => {
            listingService.setListingOwner(listingId, user2);
        });

        test('1.1 Should correctly start a new thread', async () => {
            const threadId = await messagingConcept.start_thread(user1, listingId);
            expect(threadId).toBeInstanceOf(ObjectId);

            const thread = await threadsCollection.findOne({ _id: threadId });
            expect(thread).toBeDefined();
            expect(thread?.listingId.equals(listingId)).toBe(true);
            expect(thread?.participants).toEqual(expect.arrayContaining([user1, user2]));
            expect(thread?.messages).toEqual([]);
            expect(thread?.status).toBe(ThreadStatus.ACTIVE);
            expect(thread?.createdAt).toBeInstanceOf(Date);
            expect(thread?.updatedAt).toBeInstanceOf(Date);
            expect(thread?.createdAt).toEqual(thread?.updatedAt);
        });

        test('1.2 Should correctly post a message to an existing thread', async () => {
            const threadId = await messagingConcept.start_thread(user1, listingId);
            const messageText = 'First message from user1!';
            const attachments = generateFakeUrls(1);

            const messageId = await messagingConcept.post_message(threadId, user1, messageText, attachments);
            expect(messageId).toBeInstanceOf(ObjectId);

            const message = await messagesCollection.findOne({ _id: messageId });
            expect(message).toBeDefined();
            expect(message?.threadId.equals(threadId)).toBe(true);
            expect(message?.sender.equals(user1)).toBe(true);
            expect(message?.text).toBe(messageText);
            expect(message?.attachments).toEqual(attachments);
            expect(message?.timestamp).toBeInstanceOf(Date);
            expect(message?.flagged).toBeUndefined();

            const thread = await threadsCollection.findOne({ _id: threadId });
            expect(thread?.messages).toEqual([messageId]);
            expect(thread?.updatedAt! > thread?.createdAt!).toBe(true); // Updated timestamp
            expect(eventBus.emittedEvents).toHaveLength(1);
            expect(eventBus.emittedEvents[0].eventName).toBe('NewMessage');
            const payload = eventBus.emittedEvents[0].payload as NewMessageEventPayload;
            expect(payload.threadId.equals(threadId)).toBe(true);
            expect(payload.messageId.equals(messageId)).toBe(true);
            expect(payload.senderId.equals(user1)).toBe(true);
            expect(payload.text).toBe(messageText);
        });

        test('1.3 Should correctly flag a message and emit an event', async () => {
            const threadId = await messagingConcept.start_thread(user1, listingId);
            const messageId = await messagingConcept.post_message(threadId, user1, 'Offensive content here.');
            eventBus.clearEmittedEvents(); // Clear NewMessage event

            const flaggingUser = generateUserId();
            const reason = 'Hate speech';
            await messagingConcept.flag_message(threadId, messageId, flaggingUser, reason);

            const flaggedMessage = await messagesCollection.findOne({ _id: messageId });
            expect(flaggedMessage?.flagged).toBe(true);
            expect(flaggedMessage?.flaggedBy?.equals(flaggingUser)).toBe(true);
            expect(flaggedMessage?.flagReason).toBe(reason);

            expect(eventBus.emittedEvents).toHaveLength(1);
            expect(eventBus.emittedEvents[0].eventName).toBe('MessageFlagged');
            const payload = eventBus.emittedEvents[0].payload as MessageFlaggedEventPayload;
            expect(payload.threadId.equals(threadId)).toBe(true);
            expect(payload.messageId.equals(messageId)).toBe(true);
            expect(payload.flaggedBy.equals(flaggingUser)).toBe(true);
            expect(payload.reason).toBe(reason);
        });

        test('1.4 Should correctly mark pickup as complete', async () => {
            const threadId = await messagingConcept.start_thread(user1, listingId);
            await messagingConcept.post_message(threadId, user1, 'Let\'s arrange pickup.');
            await messagingConcept.post_message(threadId, user2, 'Sounds good!');
            eventBus.clearEmittedEvents();

            await messagingConcept.mark_pickup_complete(threadId, user1);

            const thread = await threadsCollection.findOne({ _id: threadId });
            expect(thread?.status).toBe(ThreadStatus.PICKUP_COMPLETED);
            expect(thread?.updatedAt! > thread?.createdAt!).toBe(true);
            expect(eventBus.emittedEvents).toHaveLength(0); // No event for pickup completion from this concept
        });

        test('1.5 Should retrieve thread by participant', async () => {
            const threadId1 = await messagingConcept.start_thread(user1, listingId);
            const user3 = generateUserId();
            const listingId2 = generateListingId();
            listingService.setListingOwner(listingId2, user3);
            const threadId2 = await messagingConcept.start_thread(user1, listingId2); // user1 also participates here

            const threadsForUser1 = await messagingConcept.getThreadsByParticipant(user1);
            expect(threadsForUser1).toHaveLength(2);
            expect(threadsForUser1.some(t => t._id!.equals(threadId1))).toBe(true);
            expect(threadsForUser1.some(t => t._id!.equals(threadId2))).toBe(true);

            const threadsForUser2 = await messagingConcept.getThreadsByParticipant(user2);
            expect(threadsForUser2).toHaveLength(1);
            expect(threadsForUser2[0]._id!.equals(threadId1)).toBe(true);
        });

        test('1.6 Should retrieve messages in thread correctly', async () => {
            const threadId = await messagingConcept.start_thread(user1, listingId);
            const msg1Id = await messagingConcept.post_message(threadId, user1, 'msg1');
            const msg2Id = await messagingConcept.post_message(threadId, user2, 'msg2');
            const msg3Id = await messagingConcept.post_message(threadId, user1, 'msg3');

            const messages = await messagingConcept.getMessagesInThread(threadId);
            expect(messages).toHaveLength(3);
            expect(messages[0]._id!.equals(msg1Id)).toBe(true);
            expect(messages[1]._id!.equals(msg2Id)).toBe(true);
            expect(messages[2]._id!.equals(msg3Id)).toBe(true);
        });
    });

    // 2. Robustness - Error handling and edge cases
    describe('2. Robustness', () => {
        const user1 = generateUserId();
        const user2 = generateUserId();
        const listingId = generateListingId();
        let threadId: ObjectId;
        let messageId: ObjectId;

        beforeEach(async () => {
            listingService.setListingOwner(listingId, user2);
            threadId = await messagingConcept.start_thread(user1, listingId);
            messageId = await messagingConcept.post_message(threadId, user1, 'Test message');
            eventBus.clearEmittedEvents();
        });

        test('2.1 Should throw ThreadNotFoundError for non-existent thread', async () => {
            const invalidThreadId = new ObjectId();
            await expect(messagingConcept.post_message(invalidThreadId, user1, 'text')).rejects.toThrow(ThreadNotFoundError);
            await expect(messagingConcept.mark_pickup_complete(invalidThreadId, user1)).rejects.toThrow(ThreadNotFoundError);
            await expect(messagingConcept.getThread(invalidThreadId)).resolves.toBeNull();
        });

        test('2.2 Should throw MessageNotFoundError for non-existent message', async () => {
            const invalidMessageId = new ObjectId();
            await expect(messagingConcept.flag_message(threadId, invalidMessageId, user1, 'reason')).rejects.toThrow(MessageNotFoundError);
            await expect(messagingConcept.getMessage(invalidMessageId)).resolves.toBeNull();
        });

        test('2.3 Should throw UserNotParticipantError if non-participant posts a message', async () => {
            const nonParticipant = generateUserId();
            await expect(messagingConcept.post_message(threadId, nonParticipant, 'Hello')).rejects.toThrow(UserNotParticipantError);
        });

        test('2.4 Should throw UserNotParticipantError if non-participant marks pickup complete', async () => {
            const nonParticipant = generateUserId();
            await expect(messagingConcept.mark_pickup_complete(threadId, nonParticipant)).rejects.toThrow(UserNotParticipantError);
        });

        test('2.5 Should throw InvalidInputError for empty message text', async () => {
            await expect(messagingConcept.post_message(threadId, user1, '')).rejects.toThrow(InvalidInputError);
            await expect(messagingConcept.post_message(threadId, user1, '   ')).rejects.toThrow(InvalidInputError);
        });

        test('2.6 Should throw InvalidInputError for invalid attachment URLs', async () => {
            await expect(messagingConcept.post_message(threadId, user1, 'text', ['invalid-url'])).rejects.toThrow(InvalidInputError);
            await expect(messagingConcept.post_message(threadId, user1, 'text', ['http://valid.com', 'ftp://invalid-proto'])).rejects.toThrow(InvalidInputError);
        });

        test('2.7 Should throw InvalidInputError for empty flagging reason', async () => {
            await expect(messagingConcept.flag_message(threadId, messageId, user1, '')).rejects.toThrow(InvalidInputError);
            await expect(messagingConcept.flag_message(threadId, messageId, user1, '   ')).rejects.toThrow(InvalidInputError);
        });

        test('2.8 Should throw InvalidInputError for invalid ObjectId inputs', async () => {
            const invalidObjectId = new ObjectId('507f1f77bcf86cd79943901'); // Invalid length
            await expect(messagingConcept.start_thread(invalidObjectId as any, listingId)).rejects.toThrow(InvalidInputError);
            await expect(messagingConcept.post_message(threadId, user1, 'text', [null as any])).rejects.toThrow(InvalidInputError); // Test attachment type
        });

        test('2.9 Should throw ListingOwnerNotFoundError if listing owner cannot be found', async () => {
            const newListingId = generateListingId(); // No owner set for this one
            await expect(messagingConcept.start_thread(user1, newListingId)).rejects.toThrow(ListingOwnerNotFoundError);
        });

        test('2.10 Should not allow posting to a completed thread', async () => {
            await messagingConcept.mark_pickup_complete(threadId, user1);
            await expect(messagingConcept.post_message(threadId, user1, 'Post-completion message')).rejects.toThrow(InvalidThreadStateError);
        });

        test('2.11 Should not allow marking pickup complete on a non-active thread', async () => {
            // First mark complete
            await messagingConcept.mark_pickup_complete(threadId, user1);
            // Try to mark again (should fail as status is not ACTIVE)
            await expect(messagingConcept.mark_pickup_complete(threadId, user1)).rejects.toThrow(InvalidThreadStateError);
        });

        test('2.12 Should throw MessageThreadMismatchError if message does not belong to thread', async () => {
            const otherThreadId = generateThreadId();
            const otherMessage = generateFakeMessage(otherThreadId, user1); // Message not in 'messages' collection
            await messagesCollection.insertOne(otherMessage);

            await expect(messagingConcept.flag_message(threadId, otherMessage._id!, user1, 'wrong thread')).rejects.toThrow(MessageThreadMismatchError);
        });
    });

    // 3. Performance - Database indexing and query efficiency
    describe('3. Performance', () => {
        const numThreads = 100;
        const numMessagesPerThread = 50;
        const testUser = generateUserId();
        const testListingOwner = generateUserId();
        const testListingId = generateListingId();
        const otherUser = generateUserId();

        beforeAll(async () => {
            // Seed a large amount of data
            listingService.setListingOwner(testListingId, testListingOwner);

            for (let i = 0; i < numThreads; i++) {
                const listingId = generateListingId();
                const owner = i % 2 === 0 ? testListingOwner : generateUserId(); // Half owned by testListingOwner
                listingService.setListingOwner(listingId, owner);

                const initiator = i % 3 === 0 ? testUser : generateUserId(); // One third started by testUser

                const thread = generateFakeThread(
                    listingId,
                    Array.from(new Set([initiator, owner])),
                    i % 5 === 0 ? ThreadStatus.PICKUP_COMPLETED : ThreadStatus.ACTIVE,
                    [] // Messages will be added separately
                );
                await threadsCollection.insertOne(thread);

                for (let j = 0; j < numMessagesPerThread; j++) {
                    const sender = j % 2 === 0 ? initiator : owner;
                    const message = generateFakeMessage(
                        thread._id!,
                        sender,
                        `Message ${j} in thread ${i}`,
                        j % 10 === 0 ? generateFakeUrls(1) : undefined,
                        j % 20 === 0 // Flag some messages
                    );
                    await messagesCollection.insertOne(message);
                    await threadsCollection.updateOne({ _id: thread._id }, { $push: { messages: message._id } });
                }
            }
        }, 30000); // Increased timeout for large data seeding

        test('3.1 `getThreadsByParticipant` should be efficient with participant index', async () => {
            const startTime = process.hrtime.bigint();
            const threads = await messagingConcept.getThreadsByParticipant(testUser);
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;

            expect(threads.length).toBeGreaterThan(0);
            expect(durationMs).toBeLessThan(50); // Expect query to be fast, adjust based on environment
        });

        test('3.2 `getMessagesInThread` should be efficient with threadId index', async () => {
            const thread = await threadsCollection.findOne({ 'participants': testUser });
            expect(thread).toBeDefined();

            const startTime = process.hrtime.bigint();
            const messages = await messagingConcept.getMessagesInThread(thread!._id!, 10);
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;

            expect(messages.length).toBe(10);
            expect(durationMs).toBeLessThan(20); // Expect query to be fast
        });

        test('3.3 `getThread` by _id should be very fast', async () => {
            const thread = await threadsCollection.findOne({}); // Get any thread
            expect(thread).toBeDefined();

            const startTime = process.hrtime.bigint();
            const fetchedThread = await messagingConcept.getThread(thread!._id!);
            const endTime = process.hrtime.bigtime();
            const durationMs = Number(endTime - startTime) / 1_000_000;

            expect(fetchedThread).toBeDefined();
            expect(durationMs).toBeLessThan(5); // Expect near-instant
        });

        test('3.4 `flag_message` should be efficient with _id index on messages', async () => {
            const messageToFlag = await messagesCollection.findOne({ flagged: { $ne: true } }); // Find an unflagged message
            expect(messageToFlag).toBeDefined();

            eventBus.clearEmittedEvents();
            const startTime = process.hrtime.bigint();
            await messagingConcept.flag_message(messageToFlag!.threadId, messageToFlag!._id!, otherUser, 'Spam');
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;

            expect(eventBus.emittedEvents).toHaveLength(1);
            expect(durationMs).toBeLessThan(10); // Expect update to be fast
        });

        test('3.5 `post_message` should be efficient (insert + update)', async () => {
            const thread = await threadsCollection.findOne({ status: ThreadStatus.ACTIVE, participants: testUser });
            expect(thread).toBeDefined();

            eventBus.clearEmittedEvents();
            const startTime = process.hrtime.bigint();
            await messagingConcept.post_message(thread!._id!, testUser, 'New perf message');
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;

            expect(eventBus.emittedEvents).toHaveLength(1);
            expect(durationMs).toBeLessThan(20); // Expect two writes to be reasonably fast
        });
    });

    // 4. Usability - API clarity and intuitive design
    describe('4. Usability', () => {
        const user1 = generateUserId();
        const user2 = generateUserId();
        const listingId = generateListingId();
        let threadId: ObjectId;

        beforeEach(async () => {
            listingService.setListingOwner(listingId, user2);
            threadId = await messagingConcept.start_thread(user1, listingId);
        });

        test('4.1 `start_thread` method signature is clear and requires essential parameters', async () => {
            // Verified by type checking and parameter names: initiatorId, listingId
            // No ambiguity, clearly starts a new communication.
            const newThreadId = await messagingConcept.start_thread(generateUserId(), generateListingId());
            expect(newThreadId).toBeInstanceOf(ObjectId);
        });

        test('4.2 `post_message` method clearly indicates sender, content, and thread context', async () => {
            // Verified by type checking and parameter names: threadId, user, text, attachments
            const messageId = await messagingConcept.post_message(threadId, user1, 'Simple message');
            expect(messageId).toBeInstanceOf(ObjectId);
        });

        test('4.3 `flag_message` provides clear parameters for intent and required information', async () => {
            // Verified by type checking and parameter names: threadId, messageId, flaggingUser, reason
            const messageId = await messagingConcept.post_message(threadId, user1, 'test');
            await messagingConcept.flag_message(threadId, messageId, user1, 'spam');
            const message = await messagesCollection.findOne({ _id: messageId });
            expect(message?.flagged).toBe(true);
        });

        test('4.4 Error messages are descriptive and helpful for debugging', async () => {
            const invalidId = new ObjectId();
            await expect(messagingConcept.post_message(invalidId, user1, 'text')).rejects.toThrow(ThreadNotFoundError);
            try {
                await messagingConcept.post_message(invalidId, user1, 'text');
            } catch (error: any) {
                expect(error.message).toBe(`Thread with ID ${invalidId.toHexString()} not found.`);
                expect(error).toBeInstanceOf(ThreadNotFoundError);
                expect(error).toBeInstanceOf(MessagingThreadError); // Inherits from base error
            }

            await expect(messagingConcept.post_message(threadId, generateUserId(), '')).rejects.toThrow(InvalidInputError);
            try {
                await messagingConcept.post_message(threadId, generateUserId(), '');
            } catch (error: any) {
                expect(error.message).toBe('Invalid input: Message text cannot be empty.');
            }
        });

        test('4.5 Methods return meaningful values (IDs) or void for success', async () => {
            const newThreadId = await messagingConcept.start_thread(generateUserId(), generateListingId());
            expect(newThreadId).toBeInstanceOf(ObjectId);

            const newMessageId = await messagingConcept.post_message(newThreadId, user1, 'test');
            expect(newMessageId).toBeInstanceOf(ObjectId);

            const messageId = await messagingConcept.post_message(newThreadId, user1, 'another test');
            await expect(messagingConcept.flag_message(newThreadId, messageId, user1, 'reason')).resolves.toBeUndefined();
            await expect(messagingConcept.mark_pickup_complete(newThreadId, user1)).resolves.toBeUndefined();
        });
    });

    // 5. Maintainability - Code structure and modularity
    describe('5. Maintainability', () => {
        test('5.1 Code is organized into logical files (concept, errors, mocks, fake-data, types)', () => {
            // This is primarily a structural test, checked by file organization.
            // Presence of the files `src/MessagingThreadConcept.ts`, `src/MessagingThreadErrors.ts`,
            // `src/mock-services.ts`, `src/fake-data.ts`, `src/types.ts` confirms this.
            expect(MessagingThreadConcept).toBeDefined();
            expect(MessagingThreadError).toBeDefined(); // Check that they can be imported
        });

        test('5.2 Custom error classes provide clear hierarchy and specific error types', () => {
            const specificError = new ThreadNotFoundError('123');
            expect(specificError).toBeInstanceOf(ThreadNotFoundError);
            expect(specificError).toBeInstanceOf(MessagingThreadError);
            expect(specificError).toBeInstanceOf(Error);
            expect(specificError.name).toBe('ThreadNotFoundError');
        });

        test('5.3 Dependencies are injected (EventBus, ListingService, Db) promoting modularity', async () => {
            // Check constructor signature
            const constructorArgs = Reflect.getMetadata('design:paramtypes', MessagingThreadConcept);
            // This requires ts-metadata-plugin or similar at build time,
            // but we can infer from how we instantiate it in tests.
            // If the test setup works, injection is being used.
            expect(messagingConcept).toBeInstanceOf(MessagingThreadConcept);
            expect((messagingConcept as any).eventBus).toBe(eventBus);
            expect((messagingConcept as any).listingService).toBe(listingService);
        });

        test('5.4 Input validation is encapsulated in private helper methods', () => {
            const conceptAny = messagingConcept as any;
            expect(typeof conceptAny.validateObjectId).toBe('function');
            expect(typeof conceptAny.validateMessageText).toBe('function');
            expect(typeof conceptAny.isValidUrl).toBe('function');
            expect(typeof conceptAny.validateAttachments).toBe('function');

            // Test a helper directly to ensure it works
            expect(() => conceptAny.validateMessageText('valid')).not.toThrow();
            expect(() => conceptAny.validateMessageText('')).toThrow(InvalidInputError);
            expect(() => conceptAny.isValidUrl('https://valid.com')).toBe(true);
            expect(() => conceptAny.isValidUrl('invalid-url')).toBe(false);
        });
    });

    // 6. Testability - Dependency injection and mocking
    describe('6. Testability', () => {
        let testDb: Db;
        let testEventBus: MockEventBus;
        let testListingService: MockListingService;
        let testConcept: MessagingThreadConcept;

        beforeEach(async () => {
            testDb = await connectToTestDB(); // New DB instance for each scenario if needed, or reuse.
            testEventBus = new MockEventBus();
            testListingService = new MockListingService();
            testConcept = new MessagingThreadConcept(testDb, testEventBus, testListingService);
            await cleanupTestDB(); // Clean for each test setup
        });

        test('6.1 Mock EventBus correctly captures emitted events', async () => {
            const user1 = generateUserId();
            const user2 = generateUserId();
            const listingId = generateListingId();
            testListingService.setListingOwner(listingId, user2);

            const threadId = await testConcept.start_thread(user1, listingId);
            const messageId = await testConcept.post_message(threadId, user1, 'Hello');

            expect(testEventBus.emittedEvents).toHaveLength(1);
            expect(testEventBus.emittedEvents[0].eventName).toBe('NewMessage');
            expect(testEventBus.emittedEvents[0].payload.messageId.equals(messageId)).toBe(true);

            await testConcept.flag_message(threadId, messageId, user2, 'Spam');
            expect(testEventBus.emittedEvents).toHaveLength(2);
            expect(testEventBus.emittedEvents[1].eventName).toBe('MessageFlagged');
        });

        test('6.2 Mock ListingService correctly returns configured listing owners', async () => {
            const user1 = generateUserId();
            const listingId1 = generateListingId();
            const owner1 = generateUserId();
            const listingId2 = generateListingId();

            testListingService.setListingOwner(listingId1, owner1);

            // Successfully start thread with owner1
            const threadId1 = await testConcept.start_thread(user1, listingId1);
            const thread1 = await testConcept.getThread(threadId1);
            expect(thread1?.participants).toEqual(expect.arrayContaining([user1, owner1]));

            // Fail to start thread for listingId2 as no owner is set
            await expect(testConcept.start_thread(user1, listingId2)).rejects.toThrow(ListingOwnerNotFoundError);
        });

        test('6.3 Database setup and cleanup utilities work as expected', async () => {
            const user1 = generateUserId();
            const listingId = generateListingId();
            const owner = generateUserId();
            testListingService.setListingOwner(listingId, owner);

            await testConcept.start_thread(user1, listingId);
            const threadsBeforeCleanup = await threadsCollection.countDocuments({});
            expect(threadsBeforeCleanup).toBe(1);

            await cleanupTestDB(); // Custom cleanup called explicitly
            const threadsAfterCleanup = await threadsCollection.countDocuments({});
            expect(threadsAfterCleanup).toBe(0);
        });

        test('6.4 Test data generation utilities create valid and predictable data', () => {
            const userId = generateUserId();
            expect(userId).toBeInstanceOf(ObjectId);

            const listingId = generateListingId();
            expect(listingId).toBeInstanceOf(ObjectId);

            const threadId = generateThreadId();
            const fakeThread = generateFakeThread(listingId, [userId]);
            expect(fakeThread._id).toBeInstanceOf(ObjectId);
            expect(fakeThread.listingId.equals(listingId)).toBe(true);
            expect(fakeThread.participants).toEqual([userId]);

            const fakeMessage = generateFakeMessage(threadId, userId, 'test msg', generateFakeUrls(2));
            expect(fakeMessage._id).toBeInstanceOf(ObjectId);
            expect(fakeMessage.attachments).toHaveLength(2);
            expect(fakeMessage.attachments![0]).toMatch(/^https?:\/\//);
        });
    });
});
```
