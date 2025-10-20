// mock-services.ts
import { MongoClient, Db } from "npm:mongodb";

/**
 * Interface for the EventBus, consistent with existing concepts.
 */
export interface EventBus {
    publish<T = unknown>(topic: string, event: T): void;
    subscribe<T = unknown>(topic: string, handler: (event: T) => void): () => void;
}

/**
 * A mock implementation of the EventBus for testing purposes.
 * It captures published events for later inspection.
 */
export class MockEventBus implements EventBus {
    private publishedEvents: { topic: string; event: any }[] = [];
    private subscriptions: Map<string, Function[]> = new Map();

    publish<T = unknown>(topic: string, event: T): void {
        this.publishedEvents.push({ topic, event });
        // Simulate event handling for any subscribers
        if (this.subscriptions.has(topic)) {
            this.subscriptions.get(topic)?.forEach(handler => handler(event));
        }
    }

    subscribe<T = unknown>(topic: string, handler: (event: T) => void): () => void {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, []);
        }
        this.subscriptions.get(topic)?.push(handler);
        // Return an unsubscribe function
        return () => {
            const handlers = this.subscriptions.get(topic);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
            }
        };
    }

    /**
     * Retrieves all events published since the last reset or initialization.
     * @returns An array of published events.
     */
    getPublishedEvents(): { topic: string; event: any }[] {
        return this.publishedEvents;
    }

    /**
     * Clears all recorded published events.
     */
    clearEvents(): void {
        this.publishedEvents = [];
    }

    /**
     * Retrieves published events for a specific topic.
     * @param topic The topic to filter events by.
     * @returns An array of events published on the specified topic.
     */
    getEventsByTopic<T = unknown>(topic: string): T[] {
        return this.publishedEvents
            .filter(e => e.topic === topic)
            .map(e => e.event as T);
    }
}

/**
 * Global variables for the MongoDB test client and database.
 */
let testClient: MongoClient | null = null;
let testDb: Db | null = null;

/**
 * Connects to a MongoDB test database and returns the client and database instance.
 * Ensures only one connection is made globally for tests.
 * @returns A tuple containing the MongoClient and Db instances.
 */
export async function getMongoTestClientAndDb(): Promise<{ client: MongoClient; db: Db }> {
    if (!testClient || !testDb) {
        const mongoUri = Deno.env.get("MONGODB_URL");
        if (!mongoUri) {
            throw new Error("MONGODB_URL environment variable not set for testing.");
        }
        const dbName = Deno.env.get("DB_NAME") || "swapit_test_bidding";

        testClient = new MongoClient(mongoUri);
        await testClient.connect();
        testDb = testClient.db(dbName);
    }
    return { client: testClient, db: testDb };
}

/**
 * Disconnects the MongoDB test client if it's connected.
 */
export async function disconnectMongoTestClient(): Promise<void> {
    if (testClient) {
        await testClient.close();
        testClient = null;
        testDb = null;
    }
}
