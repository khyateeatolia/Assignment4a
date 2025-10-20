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