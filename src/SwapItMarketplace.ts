/**
 * SwapIt Marketplace System - Unified Implementation
 * 
 * This file contains the complete implementation of all five marketplace concepts
 * in a single cohesive TypeScript module. Individual concept files are maintained
 * separately for modular development and testing.
 * 
 * Concepts:
 * - UserAccount: SSO-based authentication and user management
 * - ItemListing: Item lifecycle management from creation to sale
 * - Bidding: Bid management with transparent history
 * - MessagingThread: Private two-user communication
 * - Feed: Efficient listing discovery with filtering
 */

import { Collection, Db, MongoClient, ObjectId } from "npm:mongodb";

// ============================================================================
// SHARED TYPES AND INTERFACES
// ============================================================================

export type UserId = string;
export type ListingId = string;
export type BidId = string;
export type ThreadId = string;
export type MessageId = string;
export type SessionId = string;
export type EmailAddress = string;
export type Username = string;
export type SSOToken = string;
export type SSOProvider = string;
export type Url = string;
export type Tag = string;
export type CurrencyAmount = number;

// ============================================================================
// USER ACCOUNT CONCEPT
// ============================================================================

export interface User {
    _id: ObjectId;
    email: EmailAddress;
    username: Username;
    ssoProvider: SSOProvider;
    ssoId: string;
    avatarUrl?: Url;
    createdAt: Date;
    lastLoginAt: Date;
    isActive: boolean;
}

export interface Profile {
    _id: ObjectId;
    bio?: string;
    listings: string[];
    bids: string[];
    threads: string[];
}

export interface Session {
    _id: ObjectId;
    userId: UserId;
    createdAt: Date;
    expiresAt: Date;
    ipAddress: string;
    userAgent: string;
    isValid: boolean;
}

export interface ProfileView {
    userId: UserId;
    email: EmailAddress;
    username: Username;
    avatarUrl?: Url;
    bio?: string;
    createdAt: Date;
    lastLoginAt: Date;
    listings: string[];
    bids: string[];
    threads: string[];
}

export interface SSOValidationService {
    validateToken(ssoProvider: SSOProvider, ssoToken: SSOToken): Promise<{
        ssoId: string;
        email: string;
        username: string;
        avatarUrl?: string;
    }>;
}

export interface UserAccountConfig {
    SESSION_DURATION_HOURS: number;
    MAX_SESSIONS_PER_USER: number;
    BIO_MAX_LENGTH: number;
}

export class UserAccountError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = "UserAccountError";
    }
}

export class AuthenticationFailedError extends UserAccountError {
    constructor() {
        super("Authentication failed", "AUTH_FAILED");
    }
}

export class SessionNotFoundError extends UserAccountError {
    constructor() {
        super("Session not found", "SESSION_NOT_FOUND");
    }
}

export class InvalidSessionError extends UserAccountError {
    constructor() {
        super("Invalid session", "INVALID_SESSION");
    }
}

export class UsernameTakenError extends UserAccountError {
    constructor() {
        super("Username is already taken", "USERNAME_TAKEN");
    }
}

export class UserNotFoundError extends UserAccountError {
    constructor() {
        super("User not found", "USER_NOT_FOUND");
    }
}

export class BioTooLongError extends UserAccountError {
    constructor() {
        super("Bio exceeds maximum length", "BIO_TOO_LONG");
    }
}

export class UserAccountConcept {
    private users: Collection<User>;
    private profiles: Collection<Profile>;
    private sessions: Collection<Session>;
    private config: UserAccountConfig;
    private ssoValidationService: SSOValidationService;
    private eventBus: EventBus;

    constructor(
        db: Db,
        config: UserAccountConfig,
        ssoValidationService: SSOValidationService,
        eventBus: EventBus,
    ) {
        this.users = db.collection<User>("users");
        this.profiles = db.collection<Profile>("profiles");
        this.sessions = db.collection<Session>("sessions");
        this.config = config;
        this.ssoValidationService = ssoValidationService;
        this.eventBus = eventBus;
    }

    private async generateUniqueUsername(baseUsername: Username): Promise<Username> {
        let username = baseUsername;
        let counter = 1;
        
        while (await this.users.findOne({ username })) {
            username = `${baseUsername}${counter}`;
            counter++;
        }
        
        return username;
    }

    private async createSession(userId: UserId, ipAddress: string, userAgent: string): Promise<SessionId> {
        const sessionId = new ObjectId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.config.SESSION_DURATION_HOURS * 60 * 60 * 1000);

        const session: Session = {
            _id: sessionId,
            userId,
            createdAt: now,
            expiresAt,
            ipAddress,
            userAgent,
            isValid: true,
        };

        await this.sessions.insertOne(session);
        return sessionId.toHexString();
    }

    async register_or_login(ssoProvider: SSOProvider, ssoToken: SSOToken, ipAddress: string, userAgent: string): Promise<{ userId: UserId, sessionId: SessionId }> {
        try {
            const ssoData = await this.ssoValidationService.validateToken(ssoProvider, ssoToken);
        
            const existingUser = await this.users.findOne({ 
                ssoProvider, 
                ssoId: ssoData.ssoId 
            });

            let userId: UserId;
            let isNewUser = false;

            if (existingUser) {
                userId = existingUser._id.toHexString();
                await this.users.updateOne(
                    { _id: existingUser._id },
                    { 
                        $set: { 
                            lastLoginAt: new Date(),
                            isActive: true 
                        } 
                    }
                );
                this.eventBus.emit("UserLoggedIn", { userId, timestamp: new Date() });
            } else {
                isNewUser = true;
                const userObjectId = new ObjectId();
                const now = new Date();
                
                const username = await this.generateUniqueUsername(ssoData.username);
                
                const user: User = {
                    _id: userObjectId,
                    email: ssoData.email,
                    username,
                    ssoProvider,
                    ssoId: ssoData.ssoId,
                    avatarUrl: ssoData.avatarUrl,
                    createdAt: now,
                    lastLoginAt: now,
                    isActive: true,
                };

                const profile: Profile = {
                    _id: userObjectId,
                    bio: undefined,
                    listings: [],
                    bids: [],
                    threads: [],
                };

                await this.users.insertOne(user);
                await this.profiles.insertOne(profile);
                
                userId = userObjectId.toHexString();
                this.eventBus.emit("UserRegistered", { userId, timestamp: now });
                this.eventBus.emit("UserLoggedIn", { userId, timestamp: now });
            }

            const sessionId = await this.createSession(userId, ipAddress, userAgent);
            return { userId, sessionId };
        } catch (error) {
            throw new AuthenticationFailedError();
        }
    }

    async logout(sessionId: SessionId): Promise<void> {
        const sessionObjectId = new ObjectId(sessionId);
        const session = await this.sessions.findOne({ _id: sessionObjectId });

        if (!session || !session.isValid) {
            throw new SessionNotFoundError();
        }

        await this.sessions.updateOne(
            { _id: sessionObjectId },
            { $set: { isValid: false } }
        );

        this.eventBus.emit("UserLoggedOut", { userId: session.userId, timestamp: new Date() });
    }

    async change_avatar(userId: UserId, newAvatar: Url): Promise<void> {
        const userObjectId = new ObjectId(userId);
        const user = await this.users.findOne({ _id: userObjectId });

        if (!user) throw new UserNotFoundError();
        if (!user.isActive) throw new UserAccountError("Account is deactivated.", "ACCOUNT_DEACTIVATED");

        await this.users.updateOne(
            { _id: userObjectId },
            { $set: { avatarUrl: newAvatar } }
        );

        this.eventBus.emit("ProfileUpdated", { userId, timestamp: new Date() });
    }

    async change_bio(userId: UserId, bio: string): Promise<void> {
        if (bio.length > this.config.BIO_MAX_LENGTH) {
            throw new BioTooLongError();
        }

        const userObjectId = new ObjectId(userId);
        const user = await this.users.findOne({ _id: userObjectId });

        if (!user) throw new UserNotFoundError();
        if (!user.isActive) throw new UserAccountError("Account is deactivated.", "ACCOUNT_DEACTIVATED");

        await this.profiles.updateOne(
            { _id: userObjectId },
            { $set: { bio } }
        );

        this.eventBus.emit("ProfileUpdated", { userId, timestamp: new Date() });
    }

    async delete_account(userId: UserId): Promise<void> {
        const userObjectId = new ObjectId(userId);
        const user = await this.users.findOne({ _id: userObjectId });

        if (!user) throw new UserNotFoundError();

        await this.sessions.deleteMany({ userId });
        await this.users.deleteOne({ _id: userObjectId });
        await this.profiles.deleteOne({ _id: userObjectId });

        this.eventBus.emit("UserDeleted", { userId, timestamp: new Date() });
    }

    async view_profile(userId: UserId): Promise<ProfileView> {
        const userObjectId = new ObjectId(userId);
        const user = await this.users.findOne({ _id: userObjectId });
        const profile = await this.profiles.findOne({ _id: userObjectId });

        if (!user || !profile) {
            throw new UserNotFoundError();
        }

        return {
            userId: user._id.toHexString(),
            email: user.email,
            username: user.username,
            avatarUrl: user.avatarUrl,
            bio: profile.bio,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
            listings: profile.listings,
            bids: profile.bids,
            threads: profile.threads,
        };
    }

    async validate_session(sessionId: SessionId): Promise<UserId> {
        const sessionObjectId = new ObjectId(sessionId);
        const session = await this.sessions.findOne({ _id: sessionObjectId });

        if (!session) {
            throw new SessionNotFoundError();
        }

        if (!session.isValid) {
            throw new InvalidSessionError();
        }

        if (session.expiresAt < new Date()) {
            throw new InvalidSessionError();
        }

        return session.userId;
    }
}

// ============================================================================
// ITEM LISTING CONCEPT
// ============================================================================

export enum ListingStatus {
    Active = "Active",
    Sold = "Sold",
    Withdrawn = "Withdrawn",
}

export interface ItemListing {
    _id: ObjectId;
    seller: ObjectId;
    title: string;
    description: string;
    photos: string[];
    tags: Tag[];
    minAsk?: CurrencyAmount;
    createdAt: Date;
    status: ListingStatus;
    currentHighestBid?: ObjectId;
    bidLog: ObjectId[];
}

export class ListingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ListingError";
    }
}

export class ListingNotFoundError extends ListingError {
    constructor(listingId: ObjectId) {
        super(`Listing with ID ${listingId.toHexString()} not found.`);
        this.name = "ListingNotFoundError";
    }
}

export class UnauthorizedListingAccessError extends ListingError {
    constructor(userId: ObjectId, listingId: ObjectId, action: string) {
        super(
            `User ${userId.toHexString()} is not authorized to ${action} listing ${listingId.toHexString()}.`,
        );
        this.name = "UnauthorizedListingAccessError";
    }
}

export class InvalidListingStatusError extends ListingError {
    constructor(
        listingId: ObjectId,
        currentStatus: ListingStatus,
        action: string,
    ) {
        super(
            `Cannot ${action} listing ${listingId.toHexString()}. Current status is ${currentStatus}.`,
        );
        this.name = "InvalidListingStatusError";
    }
}

export class ListingValidationError extends ListingError {
    constructor(message: string) {
        super(`Validation failed: ${message}`);
        this.name = "ListingValidationError";
    }
}

export class ItemListingConcept {
    private listingsCollection: Collection<ItemListing>;
    private eventBus: EventBus;

    constructor(mongoClient: MongoClient, eventBus: EventBus, dbName: string) {
        const db: Db = mongoClient.db(dbName);
        this.listingsCollection = db.collection<ItemListing>("listings");
        this.eventBus = eventBus;
    }

    private validateCommonListingFields(
        seller: ObjectId,
        title: string,
        description: string,
        photos: string[],
        tags: Tag[],
        minAsk?: CurrencyAmount,
    ): void {
        if (!seller || !(seller instanceof ObjectId)) {
            throw new ListingValidationError("Seller ID must be a valid ObjectId.");
        }
        if (!title || title.trim().length === 0) {
            throw new ListingValidationError("Title cannot be empty.");
        }
        if (title.length > 200) {
            throw new ListingValidationError("Title cannot exceed 200 characters.");
        }
        if (!description || description.trim().length === 0) {
            throw new ListingValidationError("Description cannot be empty.");
        }
        if (description.length > 2000) {
            throw new ListingValidationError(
                "Description cannot exceed 2000 characters.",
            );
        }
        if (!Array.isArray(photos)) {
            throw new ListingValidationError("Photos must be an array of URLs.");
        }
        if (
            photos.some((url) =>
                typeof url !== "string" || url.trim().length === 0 || !URL.canParse(url)
            )
        ) {
            throw new ListingValidationError("All photo URLs must be valid and non-empty strings.");
        }
        if (photos.length > 10) {
            throw new ListingValidationError("A maximum of 10 photos is allowed.");
        }
        if (!Array.isArray(tags)) {
            throw new ListingValidationError("Tags must be an array of strings.");
        }
        if (
            tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0)
        ) {
            throw new ListingValidationError("All tags must be valid non-empty strings.");
        }
        if (tags.length > 10) {
            throw new ListingValidationError("A maximum of 10 tags is allowed.");
        }
        if (minAsk !== undefined && (typeof minAsk !== "number" || minAsk < 0)) {
            throw new ListingValidationError(
                "Minimum asking price must be a non-negative number.",
            );
        }
    }

    async create_listing(
        seller: ObjectId,
        title: string,
        description: string,
        photos: string[],
        tags: Tag[],
        minAsk?: CurrencyAmount,
    ): Promise<ObjectId> {
        this.validateCommonListingFields(
            seller,
            title,
            description,
            photos,
            tags,
            minAsk,
        );

        const newListing: ItemListing = {
            _id: new ObjectId(),
            seller,
            title: title.trim(),
            description: description.trim(),
            photos,
            tags: tags.map((tag) => tag.trim()),
            minAsk,
            createdAt: new Date(),
            status: ListingStatus.Active,
            bidLog: [],
        };

        try {
            await this.listingsCollection.insertOne(newListing);
            this.eventBus.emit("ListingCreated", {
                listingId: newListing._id,
                sellerId: newListing.seller,
            });
            return newListing._id;
        } catch (error) {
            console.error("Error creating listing:", error);
            throw new ListingError("Failed to create listing due to an internal error.");
        }
    }

    async get_listing(listingId: ObjectId): Promise<ItemListing | null> {
        if (!listingId || !(listingId instanceof ObjectId)) {
            throw new ListingValidationError("Invalid listing ID format.");
        }
        return await this.listingsCollection.findOne({ _id: listingId });
    }

    async update_listing(
        listingId: ObjectId,
        updaterId: ObjectId,
        fieldsToUpdate: {
            title?: string;
            description?: string;
            photos?: string[];
            tags?: Tag[];
            minAsk?: CurrencyAmount;
        },
    ): Promise<void> {
        if (!listingId || !(listingId instanceof ObjectId)) {
            throw new ListingValidationError("Invalid listing ID format.");
        }
        if (!updaterId || !(updaterId instanceof ObjectId)) {
            throw new ListingValidationError("Updater ID must be a valid ObjectId.");
        }
        if (Object.keys(fieldsToUpdate).length === 0) {
            return;
        }

        const listing = await this.get_listing(listingId);
        if (!listing) {
            throw new ListingNotFoundError(listingId);
        }

        if (!listing.seller.equals(updaterId)) {
            throw new UnauthorizedListingAccessError(updaterId, listingId, "update");
        }

        if (listing.status !== ListingStatus.Active) {
            throw new InvalidListingStatusError(
                listingId,
                listing.status,
                "update",
            );
        }

        const updateDoc: { [key: string]: any } = {};
        const updatedFields: string[] = [];

        if (fieldsToUpdate.title !== undefined) {
            const trimmedTitle = fieldsToUpdate.title.trim();
            if (trimmedTitle.length === 0) {
                throw new ListingValidationError("Title cannot be empty.");
            }
            if (trimmedTitle.length > 200) {
                throw new ListingValidationError("Title cannot exceed 200 characters.");
            }
            if (trimmedTitle !== listing.title) {
                updateDoc.title = trimmedTitle;
                updatedFields.push("title");
            }
        }

        if (fieldsToUpdate.description !== undefined) {
            const trimmedDescription = fieldsToUpdate.description.trim();
            if (trimmedDescription.length === 0) {
                throw new ListingValidationError("Description cannot be empty.");
            }
            if (trimmedDescription.length > 2000) {
                throw new ListingValidationError(
                    "Description cannot exceed 2000 characters.",
                );
            }
            if (trimmedDescription !== listing.description) {
                updateDoc.description = trimmedDescription;
                updatedFields.push("description");
            }
        }

        if (fieldsToUpdate.photos !== undefined) {
            if (!Array.isArray(fieldsToUpdate.photos)) {
                throw new ListingValidationError("Photos must be an array of URLs.");
            }
            if (
                fieldsToUpdate.photos.some((url) =>
                    typeof url !== "string" || url.trim().length === 0 || !URL.canParse(url)
                )
            ) {
                throw new ListingValidationError("All photo URLs must be valid and non-empty strings.");
            }
            if (fieldsToUpdate.photos.length > 10) {
                throw new ListingValidationError("A maximum of 10 photos is allowed.");
            }
            if (
                JSON.stringify(fieldsToUpdate.photos) !== JSON.stringify(listing.photos)
            ) {
                updateDoc.photos = fieldsToUpdate.photos;
                updatedFields.push("photos");
            }
        }

        if (fieldsToUpdate.tags !== undefined) {
            if (!Array.isArray(fieldsToUpdate.tags)) {
                throw new ListingValidationError("Tags must be an array of strings.");
            }
            const trimmedTags = fieldsToUpdate.tags.map((tag) => tag.trim());
            if (
                trimmedTags.some((tag) => typeof tag !== "string" || tag.length === 0)
            ) {
                throw new ListingValidationError("All tags must be valid non-empty strings.");
            }
            if (trimmedTags.length > 10) {
                throw new ListingValidationError("A maximum of 10 tags is allowed.");
            }
            if (JSON.stringify(trimmedTags) !== JSON.stringify(listing.tags)) {
                updateDoc.tags = trimmedTags;
                updatedFields.push("tags");
            }
        }

        if (fieldsToUpdate.minAsk !== undefined) {
            if (
                typeof fieldsToUpdate.minAsk !== "number" || fieldsToUpdate.minAsk < 0
            ) {
                throw new ListingValidationError(
                    "Minimum asking price must be a non-negative number.",
                );
            }
            if (fieldsToUpdate.minAsk !== listing.minAsk) {
                updateDoc.minAsk = fieldsToUpdate.minAsk;
                updatedFields.push("minAsk");
            }
        }

        if (Object.keys(updateDoc).length === 0) {
            return;
        }

        try {
            const result = await this.listingsCollection.updateOne(
                { _id: listingId, seller: updaterId },
                { $set: updateDoc },
            );

            if (result.matchedCount === 0) {
                throw new ListingNotFoundError(listingId);
            }

            this.eventBus.emit("ListingUpdated", {
                listingId: listingId,
                sellerId: listing.seller,
                updatedFields: updatedFields,
            });
        } catch (error) {
            if (error instanceof ListingError) throw error;
            console.error(`Error updating listing ${listingId.toHexString()}:`, error);
            throw new ListingError("Failed to update listing due to an internal error.");
        }
    }

    async withdraw_listing(listingId: ObjectId, sellerId: ObjectId): Promise<void> {
        if (!listingId || !(listingId instanceof ObjectId)) {
            throw new ListingValidationError("Invalid listing ID format.");
        }
        if (!sellerId || !(sellerId instanceof ObjectId)) {
            throw new ListingValidationError("Seller ID must be a valid ObjectId.");
        }

        const listing = await this.get_listing(listingId);
        if (!listing) {
            throw new ListingNotFoundError(listingId);
        }

        if (!listing.seller.equals(sellerId)) {
            throw new UnauthorizedListingAccessError(sellerId, listingId, "withdraw");
        }

        if (listing.status !== ListingStatus.Active) {
            throw new InvalidListingStatusError(
                listingId,
                listing.status,
                "withdraw",
            );
        }

        try {
            const result = await this.listingsCollection.updateOne(
                { _id: listingId, seller: sellerId, status: ListingStatus.Active },
                { $set: { status: ListingStatus.Withdrawn } },
            );

            if (result.matchedCount === 0) {
                const currentListing = await this.get_listing(listingId);
                if (currentListing && currentListing.status !== ListingStatus.Active) {
                    throw new InvalidListingStatusError(
                        listingId,
                        currentListing.status,
                        "withdraw",
                    );
                }
                throw new ListingNotFoundError(listingId);
            }

            this.eventBus.emit("ListingWithdrawn", {
                listingId: listingId,
                sellerId: sellerId,
            });
        } catch (error) {
            if (error instanceof ListingError) throw error;
            console.error(`Error withdrawing listing ${listingId.toHexString()}:`, error);
            throw new ListingError("Failed to withdraw listing due to an internal error.");
        }
    }

    async accept_bid(
        listingId: ObjectId,
        sellerId: ObjectId,
        bidId: ObjectId,
    ): Promise<void> {
        if (!listingId || !(listingId instanceof ObjectId)) {
            throw new ListingValidationError("Invalid listing ID format.");
        }
        if (!sellerId || !(sellerId instanceof ObjectId)) {
            throw new ListingValidationError("Seller ID must be a valid ObjectId.");
        }
        if (!bidId || !(bidId instanceof ObjectId)) {
            throw new ListingValidationError("Bid ID must be a valid ObjectId.");
        }

        const listing = await this.get_listing(listingId);
        if (!listing) {
            throw new ListingNotFoundError(listingId);
        }

        if (!listing.seller.equals(sellerId)) {
            throw new UnauthorizedListingAccessError(sellerId, listingId, "accept bid");
        }

        if (listing.status !== ListingStatus.Active) {
            throw new InvalidListingStatusError(
                listingId,
                listing.status,
                "accept bid",
            );
        }

        try {
            const result = await this.listingsCollection.updateOne(
                { _id: listingId, seller: sellerId, status: ListingStatus.Active },
                {
                    $set: { status: ListingStatus.Sold, currentHighestBid: bidId },
                    $push: { bidLog: bidId },
                },
            );

            if (result.matchedCount === 0) {
                const currentListing = await this.get_listing(listingId);
                if (currentListing && currentListing.status !== ListingStatus.Active) {
                    throw new InvalidListingStatusError(
                        listingId,
                        currentListing.status,
                        "accept bid",
                    );
                }
                throw new ListingNotFoundError(listingId);
            }

            this.eventBus.emit("ListingSold", {
                listingId: listingId,
                sellerId: sellerId,
                acceptedBidId: bidId,
            });
        } catch (error) {
            if (error instanceof ListingError) throw error;
            console.error(`Error accepting bid for listing ${listingId.toHexString()}:`, error);
            throw new ListingError("Failed to accept bid for listing due to an internal error.");
        }
    }
}

// ============================================================================
// BIDDING CONCEPT
// ============================================================================

export enum BidStatus {
    Active = "Active",
    Withdrawn = "Withdrawn",
}

export interface BidRecord {
    id: string;
    bidderId: string;
    listingId: string;
    amount: CurrencyAmount;
    timestamp: Date;
    status: BidStatus;
}

export interface BidRecordDBO {
    _id: ObjectId;
    bidderId: ObjectId;
    listingId: ObjectId;
    amount: CurrencyAmount;
    timestamp: Date;
    status: BidStatus;
}

export class BidAlreadyWithdrawnError extends Error {
    constructor(bidId: string) {
        super(`Bid ${bidId} has already been withdrawn.`);
        this.name = "BidAlreadyWithdrawnError";
    }
}

export class BidNotFoundError extends Error {
    constructor(bidId: string) {
        super(`Bid ${bidId} not found.`);
        this.name = "BidNotFoundError";
    }
}

export class BidWithdrawalFailedUnexpectedlyError extends Error {
    constructor(bidId: string, reason: string) {
        super(`Bid ${bidId} withdrawal failed unexpectedly: ${reason}`);
        this.name = "BidWithdrawalFailedUnexpectedlyError";
    }
}

export class InvalidBidAmountError extends Error {
    constructor(amount: number) {
        super(`Invalid bid amount: ${amount}. Amount must be positive.`);
        this.name = "InvalidBidAmountError";
    }
}

export class UnauthorizedBidWithdrawalError extends Error {
    constructor(bidId: string, bidderId: string) {
        super(`User ${bidderId} is not authorized to withdraw bid ${bidId}.`);
        this.name = "UnauthorizedBidWithdrawalError";
    }
}

export class BiddingConcept {
    private bidsCollection: Collection<BidRecordDBO>;
    private eventBus: EventBus;

    constructor(db: Db, eventBus: EventBus) {
        this.bidsCollection = db.collection<BidRecordDBO>("bids");
        this.eventBus = eventBus;
        this.initializeIndexes();
    }

    private async initializeIndexes(): Promise<void> {
        try {
            await this.bidsCollection.createIndex({ listingId: 1 });
            await this.bidsCollection.createIndex({ listingId: 1, status: 1, amount: -1, timestamp: -1 });
            await this.bidsCollection.createIndex({ bidderId: 1 });
            console.log("BiddingConcept: MongoDB indexes initialized.");
        } catch (error) {
            console.warn("BiddingConcept: Index creation failed (may already exist):", error);
        }
    }

    private _mapDbToDomain(bidDBO: any): BidRecord {
        return {
            id: bidDBO._id.toHexString(),
            bidderId: bidDBO.bidderId.toHexString(),
            listingId: bidDBO.listingId.toHexString(),
            amount: bidDBO.amount,
            timestamp: bidDBO.timestamp,
            status: bidDBO.status,
        };
    }

    async place_bid(bidder: ObjectId, listingId: ObjectId, amount: CurrencyAmount): Promise<ObjectId> {
        if (amount <= 0 || !Number.isFinite(amount)) {
            throw new InvalidBidAmountError(amount);
        }

        const newBid: BidRecordDBO = {
            _id: new ObjectId(),
            bidderId: bidder,
            listingId: listingId,
            amount: amount,
            timestamp: new Date(),
            status: BidStatus.Active,
        };

        await this.bidsCollection.insertOne(newBid);

        this.eventBus.emit("BidPlaced", {
            listingId: listingId.toHexString(),
            bidId: newBid._id.toHexString(),
            bidderId: bidder.toHexString(),
            amount: amount,
            timestamp: newBid.timestamp,
        });

        return newBid._id;
    }

    async withdraw_bid(bidId: ObjectId, bidder: ObjectId): Promise<void> {
        const updateResult = await this.bidsCollection.findOneAndUpdate(
            { 
                _id: bidId,
                bidderId: bidder,
                status: BidStatus.Active
            },
            { $set: { status: BidStatus.Withdrawn } },
            { returnDocument: 'before' }
        );

        if (!updateResult) {
            const existingBid = await this.bidsCollection.findOne({ _id: bidId });
            
            if (!existingBid) {
                throw new BidNotFoundError(bidId.toHexString());
            }

            if (existingBid.status === BidStatus.Withdrawn) {
                throw new BidAlreadyWithdrawnError(bidId.toHexString());
            }
            
            if (!existingBid.bidderId.equals(bidder)) {
                throw new UnauthorizedBidWithdrawalError(bidId.toHexString(), bidder.toHexString());
            }
            
            throw new BidWithdrawalFailedUnexpectedlyError(bidId.toHexString(), "Atomic update failed without clear reason.");
        }

        const bid = updateResult;

        this.eventBus.emit("BidWithdrawn", {
            bidId: bid._id.toHexString(),
            listingId: bid.listingId.toHexString(),
            bidderId: bid.bidderId.toHexString(),
            amount: bid.amount,
            timestamp: new Date(),
        });
    }

    async get_bids(listingId: ObjectId): Promise<BidRecord[]> {
        const bids = await this.bidsCollection
            .find({
                listingId: listingId,
                status: BidStatus.Active,
            })
            .sort({ amount: -1, timestamp: -1 })
            .toArray();

        return bids.map(this._mapDbToDomain);
    }

    async get_current_high(listingId: ObjectId): Promise<ObjectId | null> {
        const highestBid = await this.bidsCollection
            .find({
                listingId: listingId,
                status: BidStatus.Active,
            })
            .sort({ amount: -1, timestamp: -1 })
            .limit(1)
            .toArray();

        return highestBid.length > 0 ? highestBid[0]._id : null;
    }
}

// ============================================================================
// MESSAGING THREAD CONCEPT
// ============================================================================

export interface Thread {
    _id: ObjectId;
    listingId?: ObjectId | null;
    participants: [ObjectId, ObjectId];
    messageIds: ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}

export interface StoredMessage {
    _id: ObjectId;
    threadId: ObjectId;
    sender: string;
    text: string;
    attachments?: string[];
    timestamp: Date;
    flagged: boolean;
    flaggedReason?: string;
}

export class MessagingThreadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MessagingThreadError";
    }
}

export class DuplicateThreadError extends MessagingThreadError {
    constructor(initiator: string, recipient: string, listingId?: string) {
        super(`Thread already exists between ${initiator} and ${recipient}${listingId ? ` for listing ${listingId}` : ""}`);
        this.name = "DuplicateThreadError";
    }
}

export class InvalidInputError extends MessagingThreadError {
    constructor(message: string) {
        super(`Invalid input: ${message}`);
        this.name = "InvalidInputError";
    }
}

export class MessageNotFoundError extends MessagingThreadError {
    constructor(messageId: string, threadId: string) {
        super(`Message ${messageId} not found in thread ${threadId}`);
        this.name = "MessageNotFoundError";
    }
}

export class SelfCommunicationError extends MessagingThreadError {
    constructor(userId: string) {
        super(`User ${userId} cannot start a thread with themselves`);
        this.name = "SelfCommunicationError";
    }
}

export class ThreadNotFoundError extends MessagingThreadError {
    constructor(threadId: string) {
        super(`Thread ${threadId} not found`);
        this.name = "ThreadNotFoundError";
    }
}

export class UnauthorizedActionError extends MessagingThreadError {
    constructor(userId: string, action: string, resource: string) {
        super(`User ${userId} is not authorized to ${action} on ${resource}`);
        this.name = "UnauthorizedActionError";
    }
}

export class MessagingThreadConcept {
    private threadsCollection: Collection<Thread>;
    private messagesCollection: Collection<StoredMessage>;
    private eventBus: EventBus;

    constructor(db: Db, eventBus: EventBus) {
        this.threadsCollection = db.collection<Thread>("messaging_threads");
        this.messagesCollection = db.collection<StoredMessage>("messaging_messages");
        this.eventBus = eventBus;

        this.threadsCollection.createIndex({ participants: 1, listingId: 1 }, { unique: true });
        this.threadsCollection.createIndex({ listingId: 1 });
        this.messagesCollection.createIndex({ threadId: 1 });
        this.messagesCollection.createIndex({ sender: 1 });
    }

    private isValidObjectId(id: string): boolean {
        return ObjectId.isValid(id) && new ObjectId(id).toHexString() === id;
    }

    private toObjectId(id: string): ObjectId {
        return new ObjectId(id);
    }

    private sortParticipants(p1: string, p2: string): [ObjectId, ObjectId] {
        const objId1 = this.toObjectId(p1);
        const objId2 = this.toObjectId(p2);
        return objId1.toHexString().localeCompare(objId2.toHexString()) < 0
            ? [objId1, objId2]
            : [objId2, objId1];
    }

    async start_thread(
        initiator: string,
        recipient: string,
        listingId?: string,
    ): Promise<string> {
        if (!this.isValidObjectId(initiator)) {
            throw new InvalidInputError(`Invalid initiator ID: ${initiator}`);
        }
        if (!this.isValidObjectId(recipient)) {
            throw new InvalidInputError(`Invalid recipient ID: ${recipient}`);
        }
        if (listingId && !this.isValidObjectId(listingId)) {
            throw new InvalidInputError(`Invalid listing ID: ${listingId}`);
        }
        if (initiator === recipient) {
            throw new SelfCommunicationError(initiator);
        }

        const sortedParticipants = this.sortParticipants(initiator, recipient);
        const now = new Date();

        const query: { participants: [ObjectId, ObjectId]; listingId?: ObjectId | null } = {
            participants: sortedParticipants,
        };

        if (listingId) {
            query.listingId = this.toObjectId(listingId);
        } else {
            query.listingId = null;
        }

        const existingThread = await this.threadsCollection.findOne(query);
        if (existingThread) {
            throw new DuplicateThreadError(initiator, recipient, listingId);
        }

        try {
            const newThread: Thread = {
                _id: new ObjectId(),
                listingId: listingId ? this.toObjectId(listingId) : null,
                participants: sortedParticipants,
                messageIds: [],
                createdAt: now,
                updatedAt: now,
            };

            await this.threadsCollection.insertOne(newThread);
            return newThread._id.toHexString();
        } catch (error) {
            if (error instanceof MessagingThreadError) throw error;
            throw new MessagingThreadError(`Failed to start thread: ${error.message}`);
        }
    }

    async post_message(
        threadId: string,
        user: string,
        text: string,
        attachments?: string[],
    ): Promise<string> {
        if (!this.isValidObjectId(threadId)) {
            throw new InvalidInputError(`Invalid thread ID: ${threadId}`);
        }
        if (!this.isValidObjectId(user)) {
            throw new InvalidInputError(`Invalid user ID: ${user}`);
        }
        if (!text || text.trim() === "") {
            throw new InvalidInputError("Message text cannot be empty.");
        }

        const threadObjectId = this.toObjectId(threadId);
        const userObjectId = this.toObjectId(user);

        const thread = await this.threadsCollection.findOne({ _id: threadObjectId });
        if (!thread) {
            throw new ThreadNotFoundError(threadId);
        }

        const isParticipant = thread.participants.some((p) => p.equals(userObjectId));
        if (!isParticipant) {
            throw new UnauthorizedActionError(user, "post a message", `thread ${threadId}`);
        }

        try {
            const now = new Date();
            const newMessage: StoredMessage = {
                _id: new ObjectId(),
                threadId: threadObjectId,
                sender: user,
                text: text,
                attachments: attachments,
                timestamp: now,
                flagged: false,
            };

            await this.messagesCollection.insertOne(newMessage);

            await this.threadsCollection.updateOne(
                { _id: threadObjectId },
                {
                    $push: { messageIds: newMessage._id },
                    $set: { updatedAt: now },
                },
            );

            await this.eventBus.emit("NewMessage", {
                threadId: threadId,
                messageId: newMessage._id.toHexString(),
                sender: newMessage.sender,
                text: newMessage.text,
                timestamp: newMessage.timestamp,
            });

            return newMessage._id.toHexString();
        } catch (error) {
            throw new MessagingThreadError(`Failed to post message: ${error.message}`);
        }
    }

    async flag_message(
        threadId: string,
        messageId: string,
        reason: string,
        flaggedBy?: string,
    ): Promise<void> {
        if (!this.isValidObjectId(threadId)) {
            throw new InvalidInputError(`Invalid thread ID: ${threadId}`);
        }
        if (!this.isValidObjectId(messageId)) {
            throw new InvalidInputError(`Invalid message ID: ${messageId}`);
        }
        if (!reason || reason.trim() === "") {
            throw new InvalidInputError("Flagging reason cannot be empty.");
        }
        if (flaggedBy && !this.isValidObjectId(flaggedBy)) {
            throw new InvalidInputError(`Invalid flaggedBy ID: ${flaggedBy}`);
        }

        const threadObjectId = this.toObjectId(threadId);
        const messageObjectId = this.toObjectId(messageId);

        const thread = await this.threadsCollection.findOne({ _id: threadObjectId });
        if (!thread) {
            throw new ThreadNotFoundError(threadId);
        }

        try {
            const result = await this.messagesCollection.updateOne(
                {
                    _id: messageObjectId,
                    threadId: threadObjectId,
                },
                {
                    $set: {
                        flagged: true,
                        flaggedReason: reason,
                    },
                },
            );

            if (result.matchedCount === 0) {
                throw new MessageNotFoundError(messageId, threadId);
            }

            await this.eventBus.emit("MessageFlagged", {
                threadId: threadId,
                messageId: messageId,
                reason: reason,
                flaggedBy: flaggedBy,
                timestamp: new Date(),
            });
        } catch (error) {
            if (error instanceof MessagingThreadError) throw error;
            throw new MessagingThreadError(`Failed to flag message: ${error.message}`);
        }
    }

    async get_thread(threadId: string): Promise<Thread | null> {
        if (!this.isValidObjectId(threadId)) {
            throw new InvalidInputError(`Invalid thread ID: ${threadId}`);
        }
        return await this.threadsCollection.findOne({ _id: this.toObjectId(threadId) });
    }

    async get_messages_in_thread(
        threadId: string,
        limit = 100,
        skip = 0,
    ): Promise<StoredMessage[]> {
        if (!this.isValidObjectId(threadId)) {
            throw new InvalidInputError(`Invalid thread ID: ${threadId}`);
        }

        return await this.messagesCollection.find({ threadId: this.toObjectId(threadId) })
            .sort({ timestamp: 1 })
            .skip(skip)
            .limit(limit)
            .toArray();
    }

    async get_message(messageId: string): Promise<StoredMessage | null> {
        if (!this.isValidObjectId(messageId)) {
            throw new InvalidInputError(`Invalid message ID: ${messageId}`);
        }
        return await this.messagesCollection.findOne({ _id: this.toObjectId(messageId) });
    }
}

// ============================================================================
// FEED CONCEPT
// ============================================================================

export interface ItemListing {
    id: string;
    title: string;
    description: string;
    price: { value: number; currency: string };
    tags: string[];
    imageUrl?: string;
    createdAt: Date;
    lastUpdatedAt: Date;
    status: "active" | "withdrawn" | "sold";
    ownerId: string;
}

export interface ListingSummary {
    id: string;
    title: string;
    description: string;
    price: { value: number; currency: string };
    tags: string[];
    imageUrl?: string;
    createdAt: Date;
    lastUpdatedAt: Date;
    status: "active" | "withdrawn" | "sold";
    ownerId: string;
}

export interface FeedIndexDoc {
    _id: ObjectId;
    listingId: string;
    title: string;
    description: string;
    price: { value: number; currency: string };
    tags: string[];
    imageUrl?: string;
    createdAt: Date;
    lastUpdatedAt: Date;
    status: "active" | "withdrawn" | "sold";
    ownerId: string;
}

export interface ItemListingService {
    getListing(listingId: string): Promise<ItemListing>;
    createListing(listing: Omit<ItemListing, "id" | "createdAt" | "lastUpdatedAt">): Promise<ItemListing>;
    updateListing(listingId: string, updates: Partial<ItemListing>): Promise<ItemListing>;
    withdrawListing(listingId: string, byUserId: string): Promise<void>;
    sellListing(listingId: string, buyerId: string): Promise<void>;
}

export class FeedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FeedError";
    }
}

export class InvalidInputError extends FeedError {
    constructor(message: string) {
        super(`Invalid input: ${message}`);
        this.name = "InvalidInputError";
    }
}

export class DatabaseError extends FeedError {
    constructor(message: string) {
        super(`Database error: ${message}`);
        this.name = "DatabaseError";
    }
}

export class ListingNotFoundError extends FeedError {
    constructor(listingId: string) {
        super(`Listing ${listingId} not found`);
        this.name = "ListingNotFoundError";
    }
}

export class ItemListingServiceError extends FeedError {
    constructor(message: string) {
        super(`ItemListing service error: ${message}`);
        this.name = "ItemListingServiceError";
    }
}

export class FeedConcept {
    private db: Db;
    private eventBus: EventBus;
    private listingService: ItemListingService;
    private feedCollection: Collection<FeedIndexDoc>;

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
            console.warn("Index creation failed (this might be expected if indexes already exist with different options):", error);
        }
    }

    private registerEventListeners() {
        this.eventBus.on("ListingCreatedEvent", async (event: any) => await this._handleListingCreated(event));
        this.eventBus.on("ListingUpdatedEvent", async (event: any) => await this._handleListingUpdated(event));
        this.eventBus.on("ListingWithdrawnEvent", async (event: any) => await this._handleListingWithdrawn(event));
        this.eventBus.on("ListingSoldEvent", async (event: any) => await this._handleListingSold(event));
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
            _id: new ObjectId(),
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

    private async _handleListingCreated(event: any) {
        try {
            const listing = await this._fetchListingDetails(event.listingId);
            if (listing) {
                const feedDoc = this._createFeedIndexDoc(listing);
                await this.feedCollection.insertOne(feedDoc);
                await this.eventBus.emit("FeedUpdatedEvent", { message: "New listing added to feed" });
            }
        } catch (error) {
            console.error(`Error handling ListingCreatedEvent for ${event.listingId}:`, error);
        }
    }

    private async _handleListingUpdated(event: any) {
        try {
            const listing = await this._fetchListingDetails(event.listingId);
            if (listing) {
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

    private async _handleListingWithdrawn(event: any) {
        try {
            await this.feedCollection.deleteOne({ listingId: event.listingId });
            await this.eventBus.emit("FeedUpdatedEvent", { message: "Listing withdrawn from feed" });
        } catch (error) {
            console.error(`Error handling ListingWithdrawnEvent for ${event.listingId}:`, error);
        }
    }

    private async _handleListingSold(event: any) {
        try {
            await this.feedCollection.deleteOne({ listingId: event.listingId });
            await this.eventBus.emit("FeedUpdatedEvent", { message: "Listing sold and removed from feed" });
        } catch (error) {
            console.error(`Error handling ListingSoldEvent for ${event.listingId}:`, error);
        }
    }

    private _validatePriceRange(min?: { value: number; currency: string }, max?: { value: number; currency: string }): void {
        if (min && min.value < 0) {
            throw new InvalidInputError("Minimum price must be a non-negative number.");
        }
        if (max && max.value < 0) {
            throw new InvalidInputError("Maximum price must be a non-negative number.");
        }
        if (min && max && min.value > max.value) {
            throw new InvalidInputError("Minimum price cannot be greater than maximum price.");
        }
    }

    private async _queryFeed(tags?: string[], minPrice?: { value: number; currency: string }, maxPrice?: { value: number; currency: string }): Promise<FeedIndexDoc[]> {
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

    async filter_by_price(min: { value: number; currency: string }, max: { value: number; currency: string }, n: number = 20): Promise<ListingSummary[]> {
        if (n <= 0) {
            throw new InvalidInputError("Page size (n) must be a positive integer.");
        }

        this._validatePriceRange(min, max);
        const docs = await this._queryFeed(undefined, min, max);
        return this._buildFeedView(docs.slice(0, n));
    }

    async filter_by_tags_and_price(tags: string[], min: { value: number; currency: string }, max: { value: number; currency: string }, n: number = 20): Promise<ListingSummary[]> {
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

// ============================================================================
// EVENT BUS INTERFACE
// ============================================================================

export interface EventBus {
    emit(eventName: string, data: any): void;
    on(eventName: string, callback: (data: any) => void | Promise<void>): void;
}

// ============================================================================
// MAIN MARKETPLACE CLASS
// ============================================================================

export class SwapItMarketplace {
    public userAccount: UserAccountConcept;
    public itemListing: ItemListingConcept;
    public bidding: BiddingConcept;
    public messagingThread: MessagingThreadConcept;
    public feed: FeedConcept;

    constructor(
        private mongoClient: MongoClient,
        private db: Db,
        private eventBus: EventBus,
        private userAccountConfig: UserAccountConfig,
        private ssoValidationService: SSOValidationService,
        private itemListingService: ItemListingService,
    ) {
        this.userAccount = new UserAccountConcept(db, userAccountConfig, ssoValidationService, eventBus);
        this.itemListing = new ItemListingConcept(mongoClient, eventBus, db.databaseName);
        this.bidding = new BiddingConcept(db, eventBus);
        this.messagingThread = new MessagingThreadConcept(db, eventBus);
        this.feed = new FeedConcept(db, eventBus, itemListingService);
    }

    // Convenience methods for common operations
    async createUserSession(ssoProvider: SSOProvider, ssoToken: SSOToken, ipAddress: string, userAgent: string) {
        return await this.userAccount.register_or_login(ssoProvider, ssoToken, ipAddress, userAgent);
    }

    async createListing(sellerId: string, title: string, description: string, photos: string[], tags: string[], minAsk?: number) {
        return await this.itemListing.create_listing(
            new ObjectId(sellerId),
            title,
            description,
            photos,
            tags,
            minAsk
        );
    }

    async placeBid(bidderId: string, listingId: string, amount: number) {
        return await this.bidding.place_bid(
            new ObjectId(bidderId),
            new ObjectId(listingId),
            amount
        );
    }

    async startMessageThread(initiatorId: string, recipientId: string, listingId?: string) {
        return await this.messagingThread.start_thread(initiatorId, recipientId, listingId);
    }

    async getLatestListings(count: number = 20) {
        return await this.feed.get_latest(count);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    // Re-export all types and classes for external use
    UserAccountConcept,
    ItemListingConcept,
    BiddingConcept,
    MessagingThreadConcept,
    FeedConcept,
    SwapItMarketplace,
    EventBus,
    SSOValidationService,
    ItemListingService,
    UserAccountConfig,
};
