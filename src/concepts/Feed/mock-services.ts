import { EventBus, ItemListingService, ItemListing, ListingId, UserId } from "./types.ts";
import { testDb } from "../../utils/database.ts"; // Import testDb directly

export class MockEventBus implements EventBus {
  // Map to store event listeners for each event name
  private listeners: Map<string, Array<(data: any) => void | Promise<void>>> = new Map();
  // Array to log emitted events for inspection in tests, if needed
  private emittedEvents: Array<{ eventName: string; data: any }> = [];

  on(eventName: string, callback: (data: any) => void | Promise<void>): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName)!.push(callback);
  }

  async emit(eventName: string, data: any): Promise<void> {
    this.emittedEvents.push({ eventName, data }); // Log emitted event
    const callbacks = this.listeners.get(eventName) || [];
    // Execute all registered callbacks. Use Promise.all to wait for all async callbacks.
    await Promise.all(callbacks.map(cb => Promise.resolve(cb(data))));
  }

  getEmittedEvents(): Array<{ eventName: string; data: any }> {
    return [...this.emittedEvents];
  }

  clearEmittedEvents(): void {
    this.emittedEvents = [];
  }
}

export class MockItemListingService implements ItemListingService {
  private listings: Map<ListingId, ItemListing> = new Map();

  async getListing(listingId: ListingId): Promise<ItemListing> {
    const listing = this.listings.get(listingId);
    if (!listing) {
      throw new Error(`Listing ${listingId} not found`);
    }
    return listing;
  }

  async createListing(listing: Omit<ItemListing, "id" | "createdAt" | "lastUpdatedAt">): Promise<ItemListing> {
    // Generate a unique ID if not provided by overrides (though createMockListing does this)
    const id = listing.id || `listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const newListing: ItemListing = {
      ...listing,
      id: id,
      createdAt: now,
      lastUpdatedAt: now
    };
    this.listings.set(newListing.id, newListing);
    return newListing;
  }

  async updateListing(listingId: ListingId, updates: Partial<ItemListing>): Promise<ItemListing> {
    const existing = this.listings.get(listingId);
    if (!existing) {
      throw new Error(`Listing ${listingId} not found`);
    }
    const updated = { ...existing, ...updates, lastUpdatedAt: new Date() };
    this.listings.set(listingId, updated);
    return updated;
  }

  async withdrawListing(listingId: ListingId, byUserId: UserId): Promise<void> {
    const existing = this.listings.get(listingId);
    if (!existing) {
      throw new Error(`Listing ${listingId} not found`);
    }
    // Update the status and lastUpdatedAt, but keep the listing in the service
    const updated = { ...existing, status: "withdrawn" as const, lastUpdatedAt: new Date() };
    this.listings.set(listingId, updated);
  }

  async sellListing(listingId: ListingId, buyerId: UserId): Promise<void> {
    const existing = this.listings.get(listingId);
    if (!existing) {
      throw new Error(`Listing ${listingId} not found`);
    }
    // Update the status and lastUpdatedAt, but keep the listing in the service
    const updated = { ...existing, status: "sold" as const, lastUpdatedAt: new Date() };
    this.listings.set(listingId, updated);
  }
}

// Keeping this function for consistency if other modules expect it,
// but the tests now directly import `testDb`.
export async function setupTestDatabase() {
  return await testDb();
}