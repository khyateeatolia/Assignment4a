// fake-data.ts

import { ObjectId } from "npm:mongodb";
import { ItemListing, ListingStatus, Tag, UserId } from "./ItemListingConcept.ts";

/**
 * Generates a new unique ObjectId.
 */
export function generateObjectId(): ObjectId {
  return new ObjectId();
}

/**
 * Generates a random alphanumeric string of a given length.
 */
export function generateRandomString(length: number): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Generates a random URL.
 */
export function generateRandomUrl(): string {
  return `https://images.example.com/${generateRandomString(10)}.jpg`;
}

/**
 * Generates an array of random URLs.
 * @param count The number of URLs to generate.
 * @returns An array of random URL strings.
 */
export function generateRandomUrls(count: number): string[] {
  return Array.from({ length: count }, () => generateRandomUrl());
}

/**
 * Generates an array of random tags from a predefined list.
 * @param count The number of tags to generate.
 * @returns An array of random tag strings.
 */
export function generateRandomTags(count: number): Tag[] {
  const commonTags = [
    "electronics",
    "books",
    "clothing",
    "furniture",
    "accessories",
    "decor",
    "sports",
    "tools",
    "vintage",
    "collectibles",
    "games",
    "home",
    "kitchen",
    "auto",
    "garden",
    "toys",
  ];
  const tags: Tag[] = [];
  // Ensure unique tags if count is less than commonTags.length
  const shuffledTags = commonTags.sort(() => 0.5 - Math.random());
  for (let i = 0; i < Math.min(count, shuffledTags.length); i++) {
    tags.push(shuffledTags[i]);
  }
  return tags;
}

/**
 * Generates a fake ItemListing object with sensible defaults, allowing overrides.
 * @param overrides Partial ItemListing object to override default values.
 * @returns A complete fake ItemListing object.
 */
export function generateFakeListing(
  overrides?: Partial<ItemListing>,
): ItemListing {
  const sellerId = overrides?.seller || generateObjectId();
  const listingId = overrides?._id || generateObjectId();
  const createdAt = overrides?.createdAt || new Date();
  const status = overrides?.status || ListingStatus.Active;

  return {
    _id: listingId,
    seller: sellerId,
    title: overrides?.title || `Fake Item: ${generateRandomString(15)}`,
    description: overrides?.description ||
      `This is a detailed description of the fake item listing. It's in great condition and ready for its new owner. Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${
        generateRandomString(50)
      }`,
    photos: overrides?.photos || generateRandomUrls(2),
    tags: overrides?.tags || generateRandomTags(3),
    minAsk: overrides?.minAsk,
    createdAt: createdAt,
    status: status,
    currentHighestBid: overrides?.currentHighestBid,
    bidLog: overrides?.bidLog || [],
  };
}

/**
 * Generates an array of fake ItemListing objects.
 * @param count The number of listings to generate.
 * @param sellerId An optional UserId to assign to all generated listings.
 * @returns An array of fake ItemListing objects.
 */
export function generateFakeListings(
  count: number,
  sellerId?: UserId,
): ItemListing[] {
  return Array.from({ length: count }, () =>
    generateFakeListing(sellerId ? { seller: sellerId } : undefined)
  );
}

// Pre-defined fake user IDs for consistent testing scenarios
export const fakeUserIds = {
  seller1: generateObjectId(),
  seller2: generateObjectId(),
  buyer1: generateObjectId(), // A user who might try to interact but isn't a seller
  admin: generateObjectId(), // An admin user (for potential future authorization tests)
  nonExistent: generateObjectId(), // For testing non-existent users
};

// Example listing data for various scenarios
export const fakeListingData = {
  activeListing: generateFakeListing({
    seller: fakeUserIds.seller1,
    title: "Vintage Bicycle",
    description:
      "Well-maintained vintage bicycle, perfect for city commutes. Some minor wear and tear.",
    photos: [
      "https://example.com/images/bike_front.jpg",
      "https://example.com/images/bike_side.jpg",
    ],
    tags: ["bicycle", "vintage", "transport"],
    minAsk: 150.00,
    status: ListingStatus.Active,
  }),
  anotherActiveListing: generateFakeListing({
    seller: fakeUserIds.seller2,
    title: "Textbook: Software Design Patterns",
    description:
      "Required textbook for COMP3000, 5th edition, excellent condition, no highlights.",
    photos: ["https://example.com/images/book_cover.jpg"],
    tags: ["textbook", "education", "comp3000"],
    minAsk: 75.50,
    status: ListingStatus.Active,
  }),
  withdrawnListing: generateFakeListing({
    seller: fakeUserIds.seller1,
    title: "Old Computer Monitor",
    description: "CRT monitor from 2005, still works but very heavy.",
    tags: ["electronics", "vintage"],
    status: ListingStatus.Withdrawn,
  }),
  soldListing: generateFakeListing({
    seller: fakeUserIds.seller2,
    title: "Handmade Ceramic Mug",
    description: "Unique ceramic mug, artisan crafted, perfect for coffee lovers.",
    tags: ["handmade", "homegoods", "kitchen"],
    minAsk: 20.00,
    status: ListingStatus.Sold,
    currentHighestBid: generateObjectId(),
    bidLog: [generateObjectId(), generateObjectId()], // Example bid history
  }),
  listingWithNoMinAsk: generateFakeListing({
    seller: fakeUserIds.seller1,
    title: "Free Couch (pickup only)",
    description: "Comfortable three-seater couch, needs to go by weekend. Minor stains.",
    tags: ["furniture", "free"],
    minAsk: undefined,
  }),
  listingWithManyTagsPhotos: generateFakeListing({
    seller: fakeUserIds.seller1,
    title: "Collectible Action Figure Set",
    description: "Rare collection of limited edition action figures, new in box.",
    photos: generateRandomUrls(8), // Many photos
    tags: generateRandomTags(9), // Many tags
  }),
};
