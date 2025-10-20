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
  listingId?: ObjectId | null; // IMPORTANT: Changed to explicitly allow null
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