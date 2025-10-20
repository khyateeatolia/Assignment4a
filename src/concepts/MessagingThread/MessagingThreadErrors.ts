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