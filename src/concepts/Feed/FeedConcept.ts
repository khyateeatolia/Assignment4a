import { Collection, ObjectId, Db } from "npm:mongodb";
import { EventBus, ItemListingService, FeedIndexDoc, ListingSummary, CurrencyAmount, ListingCreatedEvent, ListingUpdatedEvent, ListingWithdrawnEvent, ListingSoldEvent, FeedUpdatedEvent } from "./types.ts";
import { InvalidInputError, DatabaseError, ListingNotFoundError, ItemListingServiceError } from "./FeedErrors.ts"; // Import custom errors

export class FeedConcept {
  private db: Db;
  private eventBus: EventBus;
  private listingService: ItemListingService;
  private feedCollection: Collection<FeedIndexDoc>; // Stronger typing

  constructor(db: Db, eventBus: EventBus, listingService: ItemListingService) {
    this.db = db;
    this.eventBus = eventBus;
    this.listingService = listingService;
    this.feedCollection = db.collection<FeedIndexDoc>("feed_index");
    this.initIndexes();
    this.registerEventListeners();
  }

  private async initIndexes() {
    try {
      await this.feedCollection.createIndex({ createdAt: -1 });
      await this.feedCollection.createIndex({ tags: 1 });
      await this.feedCollection.createIndex({ "price.value": 1 });
      await this.feedCollection.createIndex({ listingId: 1 }, { unique: true });
    } catch (error) {
      // Log index creation failures but don't prevent service from starting.
      // This can happen if indexes with conflicting options already exist.
      console.warn("Index creation failed (this might be expected if indexes already exist with different options):", error);
      // Depending on requirements, you might want to throw here if strict index adherence is critical.
    }
  }

  private registerEventListeners() {
    this.eventBus.on("ListingCreatedEvent", async (event: ListingCreatedEvent) => await this._handleListingCreated(event));
    this.eventBus.on("ListingUpdatedEvent", async (event: ListingUpdatedEvent) => await this._handleListingUpdated(event));
    this.eventBus.on("ListingWithdrawnEvent", async (event: ListingWithdrawnEvent) => await this._handleListingWithdrawn(event));
    this.eventBus.on("ListingSoldEvent", async (event: ListingSoldEvent) => await this._handleListingSold(event));
  }

  private async _fetchListingDetails(listingId: string): Promise<any> {
    try {
      const listing = await this.listingService.getListing(listingId);
      if (!listing) {
        throw new ListingNotFoundError(listingId);
      }
      return listing;
    } catch (error) {
      console.error(`Failed to fetch listing ${listingId}:`, error);
      throw new ItemListingServiceError(`Could not retrieve listing details for ${listingId}: ${error.message}`);
    }
  }

  private _createFeedIndexDoc(listing: any): FeedIndexDoc {
    return {
      _id: new ObjectId(), // MongoDB's _id for the feed index document
      listingId: listing.id,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      tags: listing.tags,
      imageUrl: listing.imageUrl,
      createdAt: listing.createdAt,
      lastUpdatedAt: listing.lastUpdatedAt,
      status: listing.status,
      ownerId: listing.ownerId
    };
  }

  private async _handleListingCreated(event: ListingCreatedEvent) {
    try {
      const listing = await this._fetchListingDetails(event.listingId);
      if (listing) {
        const feedDoc = this._createFeedIndexDoc(listing);
        await this.feedCollection.insertOne(feedDoc);
        await this.eventBus.emit("FeedUpdatedEvent", { message: "New listing added to feed" });
      }
    } catch (error) {
      console.error(`Error handling ListingCreatedEvent for ${event.listingId}:`, error);
      // Consider more sophisticated error handling like retry mechanisms or dead-letter queues.
    }
  }

  private async _handleListingUpdated(event: ListingUpdatedEvent) {
    try {
      const listing = await this._fetchListingDetails(event.listingId);
      if (listing) {
        // Update the existing feed document.
        // We only update mutable fields and preserve the original _id and createdAt.
        await this.feedCollection.updateOne(
          { listingId: event.listingId },
          {
            $set: {
              title: listing.title,
              description: listing.description,
              price: listing.price,
              tags: listing.tags,
              imageUrl: listing.imageUrl,
              lastUpdatedAt: listing.lastUpdatedAt,
              status: listing.status,
              ownerId: listing.ownerId
            }
          }
        );
        await this.eventBus.emit("FeedUpdatedEvent", { message: "Listing updated in feed" });
      }
    } catch (error) {
      console.error(`Error handling ListingUpdatedEvent for ${event.listingId}:`, error);
    }
  }

  private async _handleListingWithdrawn(event: ListingWithdrawnEvent) {
    try {
      await this.feedCollection.deleteOne({ listingId: event.listingId });
      await this.eventBus.emit("FeedUpdatedEvent", { message: "Listing withdrawn from feed" });
    } catch (error) {
      console.error(`Error handling ListingWithdrawnEvent for ${event.listingId}:`, error);
    }
  }

  private async _handleListingSold(event: ListingSoldEvent) {
    try {
      await this.feedCollection.deleteOne({ listingId: event.listingId });
      await this.eventBus.emit("FeedUpdatedEvent", { message: "Listing sold and removed from feed" });
    } catch (error) {
      console.error(`Error handling ListingSoldEvent for ${event.listingId}:`, error);
    }
  }

  private _validatePriceRange(min?: CurrencyAmount, max?: CurrencyAmount): void {
    if (min && min.value < 0) {
      throw new InvalidInputError("Minimum price must be a non-negative number.");
    }
    if (max && max.value < 0) { // Added check for negative max price
      throw new InvalidInputError("Maximum price must be a non-negative number.");
    }
    if (min && max && min.value > max.value) {
      throw new InvalidInputError("Minimum price cannot be greater than maximum price.");
    }
  }

  private async _queryFeed(tags?: string[], minPrice?: CurrencyAmount, maxPrice?: CurrencyAmount): Promise<FeedIndexDoc[]> {
    const query: any = {};

    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    if (minPrice || maxPrice) {
      query["price.value"] = {};
      if (minPrice) query["price.value"].$gte = minPrice.value;
      if (maxPrice) query["price.value"].$lte = maxPrice.value;
    }

    try {
      return await this.feedCollection.find(query).sort({ createdAt: -1 }).toArray();
    } catch (error) {
      console.error("Database query failed:", error);
      throw new DatabaseError("Failed to query feed.");
    }
  }

  private _buildFeedView(docs: FeedIndexDoc[]): ListingSummary[] {
    return docs.map(doc => ({
      id: doc.listingId,
      title: doc.title,
      description: doc.description,
      price: doc.price,
      tags: doc.tags,
      imageUrl: doc.imageUrl,
      createdAt: doc.createdAt,
      lastUpdatedAt: doc.lastUpdatedAt,
      status: doc.status,
      ownerId: doc.ownerId
    }));
  }

  async get_latest(n: number = 20): Promise<ListingSummary[]> {
    if (n <= 0) {
      throw new InvalidInputError("Page size (n) must be a positive integer.");
    }

    const docs = await this.feedCollection.find({}).sort({ createdAt: -1 }).limit(n).toArray();
    return this._buildFeedView(docs);
  }

  async filter_by_tags(tags: string[], n: number = 20): Promise<ListingSummary[]> {
    if (n <= 0) {
      throw new InvalidInputError("Page size (n) must be a positive integer.");
    }

    const docs = await this._queryFeed(tags);
    return this._buildFeedView(docs.slice(0, n));
  }

  async filter_by_price(min: CurrencyAmount, max: CurrencyAmount, n: number = 20): Promise<ListingSummary[]> {
    if (n <= 0) {
      throw new InvalidInputError("Page size (n) must be a positive integer.");
    }

    this._validatePriceRange(min, max);
    const docs = await this._queryFeed(undefined, min, max);
    return this._buildFeedView(docs.slice(0, n));
  }

  async filter_by_tags_and_price(tags: string[], min: CurrencyAmount, max: CurrencyAmount, n: number = 20): Promise<ListingSummary[]> {
    if (n <= 0) {
      throw new InvalidInputError("Page size (n) must be a positive integer.");
    }

    this._validatePriceRange(min, max);
    const docs = await this._queryFeed(tags, min, max);
    return this._buildFeedView(docs.slice(0, n));
  }

  async refresh_feed(): Promise<void> {
    await this.eventBus.emit("FeedUpdatedEvent", { message: "Feed refreshed" });
  }
}