// src/concepts/UserAccount/UserAccountConcept.ts
import { Collection, MongoClient, ObjectId } from "npm:mongodb";
import {
    UserAccountError,
    AuthenticationFailedError,
    SessionNotFoundError,
    InvalidSessionError,
    UsernameTakenError,
    UserNotFoundError,
    InvalidCredentialsError,
    BioTooLongError,
    PasswordTooShortError,
} from "./UserAccountErrors.ts";

// --- Types ---

export type EmailAddress = string;
export type UserId = string; // ObjectId string
export type Username = string;
export type SSOToken = string; // JWT token from SSO provider
export type SessionId = string; // ObjectId string
export type SSOProvider = string; // e.g., "university.edu", "google.edu"
export type Url = string;
export type Timestamp = Date;

// --- Data Models ---

export interface User {
    _id: ObjectId;
    email: EmailAddress;
    username: Username;
    ssoProvider: SSOProvider;
    ssoId: string;
    avatarUrl?: Url;
    createdAt: Timestamp;
    lastLoginAt: Timestamp;
    isActive: boolean;
}

export interface Profile {
    _id: ObjectId; // Corresponds to UserId
    bio?: string;
    listings: string[]; // List<ListingId>
    bids: string[]; // List<BidId>
    threads: string[]; // List<ThreadId>
}

export interface Session {
    _id: ObjectId;
    userId: UserId;
    createdAt: Timestamp;
    expiresAt: Timestamp;
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
    createdAt: Timestamp;
    lastLoginAt: Timestamp;
    listings: string[];
    bids: string[];
    threads: string[];
}

// --- Events ---

export interface UserRegisteredEvent {
    userId: UserId;
    timestamp: Timestamp;
}

export interface UserLoggedInEvent {
    userId: UserId;
    timestamp: Timestamp;
}

export interface UserLoggedOutEvent {
    userId: UserId;
    timestamp: Timestamp;
}

export interface UserDeletedEvent {
    userId: UserId;
    timestamp: Timestamp;
}

export interface ProfileUpdatedEvent {
    userId: UserId;
    timestamp: Timestamp;
}

export type UserAccountEvent = UserRegisteredEvent | UserLoggedInEvent | UserLoggedOutEvent | UserDeletedEvent | ProfileUpdatedEvent;

export interface EventBus {
    emit(event: "UserRegistered", data: UserRegisteredEvent): void;
    emit(event: "UserLoggedIn", data: UserLoggedInEvent): void;
    emit(event: "UserLoggedOut", data: UserLoggedOutEvent): void;
    emit(event: "UserDeleted", data: UserDeletedEvent): void;
    emit(event: "ProfileUpdated", data: ProfileUpdatedEvent): void;
}

// --- External Service Interfaces ---

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

// --- Concept Implementation ---

export class UserAccountConcept {
    private users: Collection<User>;
    private profiles: Collection<Profile>;
    private sessions: Collection<Session>;
    private config: UserAccountConfig;
    private ssoValidationService: SSOValidationService;
    private eventBus: EventBus;

    constructor(
        db: any, // Using any for now to avoid Db import issues
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

        // Ensure indexes for performance and uniqueness
        // Note: Index creation will be handled by MongoDB automatically or manually
        // this.users.createIndex({ email: 1 }, { unique: true });
        // this.users.createIndex({ username: 1 }, { unique: true });
        // this.users.createIndex({ ssoProvider: 1, ssoId: 1 }, { unique: true });
        // this.sessions.createIndex({ userId: 1 });
        // this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
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

    private async invalidateUserSessions(userId: UserId): Promise<void> {
        await this.sessions.updateMany(
            { userId, isValid: true },
            { $set: { isValid: false } }
        );
    }

    /**
     * `register_or_login(ssoProvider: SSOProvider, ssoToken: SSOToken) -> { userId: UserId, sessionId: SessionId }`
     * Handles both user registration and login via SSO authentication.
     */
    async register_or_login(ssoProvider: SSOProvider, ssoToken: SSOToken, ipAddress: string, userAgent: string): Promise<{ userId: UserId, sessionId: SessionId }> {
        try {
            // 1. Validate SSO token with external provider
            const ssoData = await this.ssoValidationService.validateToken(ssoProvider, ssoToken);
        
        // 2. Check if user already exists
        const existingUser = await this.users.findOne({ 
            ssoProvider, 
            ssoId: ssoData.ssoId 
        });

        let userId: UserId;
        let isNewUser = false;

        if (existingUser) {
            // Existing user - update lastLoginAt and ensure active
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
            // New user - create account
            isNewUser = true;
            const userObjectId = new ObjectId();
            const now = new Date();
            
            // Generate unique username
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

        // 3. Create new session
        const sessionId = await this.createSession(userId, ipAddress, userAgent);

        return { userId, sessionId };
        } catch (error) {
            throw new AuthenticationFailedError();
        }
    }

    /**
     * `logout(sessionId: SessionId) -> void`
     * Invalidates an active user session.
     */
    async logout(sessionId: SessionId): Promise<void> {
        const sessionObjectId = new ObjectId(sessionId);
        const session = await this.sessions.findOne({ _id: sessionObjectId });

        if (!session || !session.isValid) {
            throw new SessionNotFoundError();
        }

        // Invalidate session
        await this.sessions.updateOne(
            { _id: sessionObjectId },
            { $set: { isValid: false } }
        );

        this.eventBus.emit("UserLoggedOut", { userId: session.userId, timestamp: new Date() });
    }

    /**
     * `change_avatar(userId: UserId, newAvatar: Url) -> void`
     * Updates the user's avatar URL.
     */
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

    /**
     * `change_bio(userId: UserId, bio: String) -> void`
     * Updates the user's biography.
     */
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

    /**
     * `delete_account(userId: UserId) -> void`
     * Deletes a user account and all associated data.
     */
    async delete_account(userId: UserId): Promise<void> {
        const userObjectId = new ObjectId(userId);
        const user = await this.users.findOne({ _id: userObjectId });

        if (!user) throw new UserNotFoundError();

        // Delete all user sessions
        await this.sessions.deleteMany({ userId });

        // Delete user and profile
        await this.users.deleteOne({ _id: userObjectId });
        await this.profiles.deleteOne({ _id: userObjectId });

        this.eventBus.emit("UserDeleted", { userId, timestamp: new Date() });
    }

    /**
     * `view_profile(userId: UserId) -> ProfileView`
     * Retrieves the public profile view of a user.
     */
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

    /**
     * `validate_session(sessionId: SessionId) -> UserId`
     * Validates an active session and returns the associated user ID.
     */
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