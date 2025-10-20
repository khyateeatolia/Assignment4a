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
    // The unique index handles duplicate participant pairs with or without a specific listing.
    // MongoDB treats `undefined` or `null` values consistently for indexing.
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
    const query: { participants: [ObjectId, ObjectId]; listingId?: ObjectId | null } = {
      participants: sortedParticipants,
    };

    // IMPORTANT FIX: Use null to explicitly match threads without a listingId,
    // as MongoDB stores undefined values as null for indexed fields.
    if (listingId) {
      query.listingId = this.toObjectId(listingId);
    } else {
      query.listingId = null; // Match threads where listingId is explicitly null
    }

    const existingThread = await this.threadsCollection.findOne(query);
    if (existingThread) {
      throw new DuplicateThreadError(initiator, recipient, listingId);
    }

    try {
      const newThread: Thread = {
        _id: new ObjectId(),
        // IMPORTANT FIX: Ensure listingId is explicitly null if not provided,
        // to match the query logic and MongoDB's indexing behavior.
        listingId: listingId ? this.toObjectId(listingId) : null,
        participants: sortedParticipants,
        messageIds: [],
        createdAt: now,
        updatedAt: now,
      };

      await this.threadsCollection.insertOne(newThread);
      return newThread._id.toHexString();
    } catch (error) {
      // Re-throw if it's already a custom error, otherwise wrap in general MessagingThreadError
      if (error instanceof MessagingThreadError) throw error;
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