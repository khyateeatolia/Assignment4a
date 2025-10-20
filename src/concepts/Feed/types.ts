import { ObjectId } from "npm:mongodb";

export type ID = string;
export type ListingId = ID;
export type UserId = ID;

export interface CurrencyAmount {
  value: number;
  currency: string;
}

export interface ItemListing {
  id: ListingId;
  title: string;
  description: string;
  price: CurrencyAmount;
  tags: string[];
  imageUrl?: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  status: "active" | "withdrawn" | "sold";
  ownerId: UserId;
}

export interface ListingSummary {
  id: ListingId;
  title: string;
  description: string;
  price: CurrencyAmount;
  tags: string[];
  imageUrl?: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  status: "active" | "withdrawn" | "sold";
  ownerId: UserId;
}

export interface FeedIndexDoc {
  _id: ObjectId;
  listingId: ListingId;
  title: string;
  description: string;
  price: CurrencyAmount;
  tags: string[];
  imageUrl?: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  status: "active" | "withdrawn" | "sold";
  ownerId: UserId;
}

export interface EventBus {
  on(eventName: string, callback: (data: any) => void | Promise<void>): void;
  emit(eventName: string, data: any): Promise<void>;
}

export interface ItemListingService {
  getListing(listingId: ListingId): Promise<ItemListing>;
  createListing(listing: Omit<ItemListing, "id" | "createdAt" | "lastUpdatedAt">): Promise<ItemListing>;
  updateListing(listingId: ListingId, updates: Partial<ItemListing>): Promise<ItemListing>;
  withdrawListing(listingId: ListingId, byUserId: UserId): Promise<void>;
  sellListing(listingId: ListingId, buyerId: UserId): Promise<void>;
}

export interface ListingCreatedEvent {
  listingId: ListingId;
  timestamp: Date;
}

export interface ListingUpdatedEvent {
  listingId: ListingId;
  timestamp: Date;
}

export interface ListingWithdrawnEvent {
  listingId: ListingId;
  byUserId: UserId;
  timestamp: Date;
}

export interface ListingSoldEvent {
  listingId: ListingId;
  buyerId: UserId;
  timestamp: Date;
}

export interface FeedUpdatedEvent {
  message: string;
}