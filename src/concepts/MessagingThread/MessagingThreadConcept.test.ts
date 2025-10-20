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
  generateListingId,
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

Deno.test("MessagingThreadConcept Tests", { sanitizeResources: false, sanitizeOps: false }, async (t) => {

  await t.step("Correctness: start_thread", async (t_step) => {
    // Clear collections before test
    await clearCollections(db, collectionNames);
    eventBus.clearEmittedEvents();
    
    const [user1, user2, user3] = generateFakeUsers(3);
    const listingId = generateListingId();

    await t_step.step("should create a general thread between two users", async () => {
      const threadId = await messagingThreadConcept.start_thread(user1, user2);
      assertExists(threadId);
      const thread = await messagingThreadConcept.get_thread(threadId);
      assertExists(thread);
      assertEquals(thread.participants.map((p) => p.toHexString()).sort(), [user1, user2].sort());
      assert(thread.listingId === undefined || thread.listingId === null);
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
      // Create a fresh thread for this test
      const [testUser1, testUser2] = generateFakeUsers(2);
      const threadId1 = await messagingThreadConcept.start_thread(testUser1, testUser2);
      const thread1 = await messagingThreadConcept.get_thread(threadId1);
      assertExists(thread1);

      // Attempt to start same thread with participants swapped
      await assertRejects(
        () => messagingThreadConcept.start_thread(testUser2, testUser1),
        DuplicateThreadError,
        `A thread already exists between ${testUser2} and ${testUser1}`,
      );
    });

    await t_step.step("should handle participants order consistently for listing-specific threads", async () => {
      // Create fresh users and listing for this test
      const [testUser1, testUser2] = generateFakeUsers(2);
      const testListingId = generateListingId();
      const threadId1 = await messagingThreadConcept.start_thread(testUser1, testUser2, testListingId);
      const thread1 = await messagingThreadConcept.get_thread(threadId1);
      assertExists(thread1);

      // Attempt to start same thread with participants swapped
      await assertRejects(
        () => messagingThreadConcept.start_thread(testUser2, testUser1, testListingId),
        DuplicateThreadError,
        `A thread already exists between ${testUser2} and ${testUser1} for listing ${testListingId}`,
      );
    });
  });

  await t.step("Correctness: post_message", async (t_step) => {
    // Clear collections before test
    await clearCollections(db, collectionNames);
    eventBus.clearEmittedEvents();
    
    const [user1, user2, user3] = generateFakeUsers(3);
    const threadId = await messagingThreadConcept.start_thread(user1, user2);
    // Clear events after creating the thread to start fresh for post_message tests
    eventBus.clearEmittedEvents();

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

      // Clear events after this sub-step to prevent leakage into the next sub-step
      eventBus.clearEmittedEvents();
    });

        await t_step.step("should allow another participant to post a message", async () => {
          // Clear events before this test step to ensure clean state
          eventBus.clearEmittedEvents();
          
          const messageId1 = await messagingThreadConcept.post_message(threadId, user1, "First message");
          const messageId2 = await messagingThreadConcept.post_message(threadId, user2, "Second message");

          assertExists(messageId1);
          assertExists(messageId2);

          const messages = await messagingThreadConcept.get_messages_in_thread(threadId);
          // FIX: The thread state (messages in DB) persists across sub-steps in the same parent t.step.
          // 1 message from the previous sub-step + 2 messages from this sub-step = 3 total.
          assertEquals(messages.length, 3);
          // Adjust sender assertions to match the cumulative order of messages
          assertEquals(messages[0].sender, user1); // This is the message from the first sub-step
          assertEquals(messages[1].sender, user1); // This is the first message posted in this sub-step
          assertEquals(messages[2].sender, user2); // This is the second message posted in this sub-step

          // Check event emission for both messages (should be 2 total events from this test step)
          assertEquals(eventBus.emittedEvents.length, 2);
          assertEquals(eventBus.emittedEvents[0].eventName, "NewMessage");
          assertEquals(eventBus.emittedEvents[1].eventName, "NewMessage");

          // Clear events again at the end of this sub-step
          eventBus.clearEmittedEvents();
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
    // Clear collections before test
    await clearCollections(db, collectionNames);
    eventBus.clearEmittedEvents();
    
    const [user1, user2, user3] = generateFakeUsers(3);
    const threadId = await messagingThreadConcept.start_thread(user1, user2);
    const messageId = await messagingThreadConcept.post_message(threadId, user1, "This message is problematic.");
    // Clear event bus after message post, so we only track flag_message events
    eventBus.clearEmittedEvents();

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
          // Clear events before this test step to ensure clean state
          eventBus.clearEmittedEvents();
          
          const reason = "Spam content";
          await messagingThreadConcept.flag_message(threadId, messageId, reason);

          const message = await messagingThreadConcept.get_message(messageId);
          assertExists(message);
          assertEquals(message.flagged, true);
          assertEquals(message.flaggedReason, reason);

          assertEquals(eventBus.emittedEvents.length, 1);
          const eventPayload = eventBus.emittedEvents[0].payload as MessageFlaggedEventPayload;
          assertEquals(eventPayload.flaggedBy, undefined);
        });
  });

  await t.step("Robustness: Error Handling", async (t_step) => {
    // Clear collections before test
    await clearCollections(db, collectionNames);
    eventBus.clearEmittedEvents();
    
    const [user1, user2, user3] = generateFakeUsers(3);
    const nonExistentId = new ObjectId().toHexString(); // Guaranteed not to exist
    const threadId = await messagingThreadConcept.start_thread(user1, user2);
    const messageId = await messagingThreadConcept.post_message(threadId, user1, "Test message.");
    eventBus.clearEmittedEvents();

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
      // Use fresh users to avoid duplicate thread issues
      const [freshUser1, freshUser2] = generateFakeUsers(2);
      const thread2Id = await messagingThreadConcept.start_thread(freshUser1, freshUser2);
      const message2Id = await messagingThreadConcept.post_message(thread2Id, freshUser1, "Another thread's message");

      await assertRejects(
        () => messagingThreadConcept.flag_message(threadId, message2Id, "reason"), // message2Id is not in threadId
        MessageNotFoundError,
        `Message with ID ${message2Id} in thread ${threadId} not found.`,
      );
    });
  });

  await t.step("Performance: Basic checks (conceptual)", async (t_step) => {
    // Clear collections before test
    await clearCollections(db, collectionNames);
    eventBus.clearEmittedEvents();
    
    const [user1, user2] = generateFakeUsers(2);
    const threadId = await messagingThreadConcept.start_thread(user1, user2);

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
      assert(duration < 10000, `Creating 100 threads took too long: ${duration}ms`); // Relaxed threshold for remote DB
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
      assert(duration < 10000, `Posting 100 messages took too long: ${duration}ms`); // Relaxed threshold for remote DB
    });
  });

  await t.step("Usability & Maintainability: Code structure and helpers", async (t_step) => {
    // Clear collections before test
    await clearCollections(db, collectionNames);
    eventBus.clearEmittedEvents();
    
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