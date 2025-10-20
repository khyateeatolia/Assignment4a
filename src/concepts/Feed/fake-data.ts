import { ItemListing, CurrencyAmount } from "./types.ts";

export function generateId(): string {
  return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createMockListing(overrides: Partial<ItemListing> = {}): ItemListing {
  const id = overrides.id || generateId(); // Use provided ID if available
  const now = new Date();

  return {
    id,
    title: overrides.title || `Test Listing ${id}`,
    description: overrides.description || `Description for ${id}`,
    price: overrides.price || { value: Math.floor(Math.random() * 1000) + 10, currency: "USD" },
    tags: overrides.tags || ["general"], // Corrected: Removed duplicate 'tags' line
    imageUrl: overrides.imageUrl || `https://example.com/image_${id}.jpg`,
    createdAt: overrides.createdAt || now,
    lastUpdatedAt: overrides.lastUpdatedAt || now,
    status: overrides.status || "active",
    ownerId: overrides.ownerId || `user_${id}`
  };
}

export function createManyMockListings(count: number, overrides: Partial<ItemListing> = {}): ItemListing[] {
  return Array.from({ length: count }, (_, index) =>
    createMockListing({
      ...overrides,
      title: overrides.title ? `${overrides.title} ${index + 1}` : `Test Listing ${index + 1}`,
      // Stagger creation times to ensure natural chronological order for tests
      createdAt: new Date(Date.now() - (count - index) * 100) // Decreasing timestamp for older items first
    })
  );
}