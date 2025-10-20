// src/concepts/MessagingThread/mock-services.ts

import { Collection, Db, ObjectId } from "npm:mongodb";
import { EventBus } from "./types.ts";
import { testDb } from "../../utils/database.ts";

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

/**
 * Connects to MongoDB and returns the database instance.
 * Uses the shared testDb utility for consistent connection.
 */
export async function setupTestDatabase(): Promise<Db> {
  const [db, client] = await testDb();
  return db;
}

/**
 * Closes the MongoDB connection.
 * Note: The shared testDb utility handles connection management.
 */
export async function teardownTestDatabase(): Promise<void> {
  // The shared testDb utility handles connection cleanup
  console.log("Test database cleanup handled by shared utility.");
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