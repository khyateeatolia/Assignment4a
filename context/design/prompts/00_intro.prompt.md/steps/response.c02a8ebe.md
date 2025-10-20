---
timestamp: 'Thu Oct 16 2025 14:10:11 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_141011.b944c17a.md]]'
content_id: c02a8ebed6acec4596e2f0b08a4aec03f9cc6bf588ace6202bd72213b6a13271
---

# response:

### Assumptions

* **MongoDB ObjectIds for IDs:** `UserId`, `ListingId`, `BidId`, `ThreadId`, `MessageId` are assumed to be MongoDB `ObjectId` strings for uniqueness and consistency. `VerificationToken` will be a cryptographically secure string.
* **Email Sending Interface:** An abstract `EmailService` interface is used for sending verification emails. A concrete mock implementation will be used in tests.
* **Event Bus Implementation:** A simple in-memory `EventBus` is implemented for emitting `UserVerified` and `UserDeleted` events. In a real-world scenario, this would likely be a more robust pub/sub system.
* **Rate Limiting Implementation:** A basic in-memory rate limiter is implemented for `request_verification` per email and IP address.
* **Configuration Loading:** Configuration values (e.g., `TOKEN_SECRET`, `ALLOWED_SCHOOL_DOMAINS`) are loaded from `Deno.env`.
* **SSO Integration:** It's assumed that the `userId` provided to actions like `edit_avatar`, `edit_bio`, and `delete_account` has already been authenticated via an upstream SSO provider. `request_verification` and `confirm_verification` are solely for initial email verification and profile setup.
* **Profile List Synchronization:** The `listings`, `bids`, and `threads` arrays within the user `profile` document are managed by *other* concepts via events. The `UserAccountConcept`'s actions themselves (e.g., `confirm_verification`) will initialize these as empty and `view_profile` will return their current state, but the `UserAccountConcept` does not directly mutate them through its own exposed actions in this iteration. This means `UserAccount` would need internal event listeners for `ListingCreated`, `BidPlaced`, etc., which are outside the scope of *this* prompt (focused on its own *actions*).
* **Soft vs. Hard Delete:** `delete_account` performs a hard delete of the user and profile records from the database.
* **`Url` Type:** Assumed to be a `string` representing a valid URL.

***

```typescript
// src/concepts/UserAccount/UserAccountConcept.ts
import { Collection, Db, ObjectId } from "https://deno.land/x/mongo@v0.32.0/mod.ts";
import { createHmac } from "https://deno.land/std@0.178.0/node/crypto.ts"; // Deno.createHmac in newer Deno, but for wider compat, use node:crypto polyfill if needed

// --- Types ---

export type EmailAddress = string;
export type UserId = string; // ObjectId string
export type Username = string;
export type VerificationToken = string; // HMAC-signed JWT-like string
export type Url = string;
export type Timestamp = Date;

// Internal DTOs for state management
interface PendingVerification {
    _id: VerificationToken; // The token itself
    email: EmailAddress;
    expiry: Timestamp;
    createdAt: Timestamp;
    ipAddress?: string;
    attempts: number;
    status: 'pending' | 'used' | 'expired';
}

export interface User {
    _id: ObjectId;
    email: EmailAddress;
    username: Username;
    avatarUrl?: Url;
    verifiedAt: Timestamp;
    createdAt: Timestamp;
}

export interface Profile {
    _id: ObjectId; // Corresponds to UserId
    bio?: string;
    listings: string[]; // List<ListingId>
    bids: string[]; // List<BidId>
    threads: string[]; // List<ThreadId>
}

export interface ProfileView {
    userId: UserId;
    email: EmailAddress;
    username: Username;
    avatarUrl?: Url;
    bio?: string;
    verifiedAt: Timestamp;
    listings: string[];
    bids: string[];
    threads: string[];
}

// --- Events ---
export interface UserVerifiedEvent {
    userId: UserId;
    timestamp: Timestamp;
}

export interface UserDeletedEvent {
    userId: UserId;
    timestamp: Timestamp;
}

export type UserAccountEvent = UserVerifiedEvent | UserDeletedEvent;

export interface EventBus {
    emit(event: "UserVerified", data: UserVerifiedEvent): void;
    emit(event: "UserDeleted", data: UserDeletedEvent): void;
    // Potentially add 'on' method if UserAccount needs to listen to its own events, or external ones
    // on(event: "ListingCreated", handler: (data: any) => void): void;
    // on(event: "BidPlaced", handler: (data: any) => void): void;
}

// --- External Service Interfaces ---
export interface EmailService {
    sendVerificationEmail(to: EmailAddress, token: VerificationToken, username?: Username): Promise<void>;
}

export interface RateLimiter {
    // Returns true if allowed, false if rate-limited
    attempt(key: string, limit: number, windowMs: number): Promise<boolean>;
    reset(key: string): Promise<void>;
}

// --- Configuration ---
export interface UserAccountConfig {
    TOKEN_SECRET: string;
    TOKEN_TTL_MINUTES: number;
    ALLOWED_SCHOOL_DOMAINS: string[];
    APP_BASE_URL: string; // Base URL for constructing verification links
}

// --- Errors ---
export class UserAccountError extends Error {
    constructor(message: string, public code: string = 'GENERIC_ERROR') {
        super(message);
        this.name = 'UserAccountError';
    }
}

export class InvalidEmailError extends UserAccountError { constructor() { super("Invalid school email address.", "INVALID_EMAIL"); } }
export class TokenExpiredError extends UserAccountError { constructor() { super("Verification token has expired.", "TOKEN_EXPIRED"); } }
export class TokenUsedError extends UserAccountError { constructor() { super("Verification token has already been used.", "TOKEN_USED"); } }
export class InvalidTokenError extends UserAccountError { constructor() { super("Invalid verification token.", "INVALID_TOKEN"); } }
export class UsernameTakenError extends UserAccountError { constructor() { super("Username is already taken.", "USERNAME_TAKEN"); } }
export class UserNotFoundError extends UserAccountError { constructor() { super("User not found.", "USER_NOT_FOUND"); } }
export class UnverifiedUserError extends UserAccountError { constructor() { super("User is not verified.", "UNVERIFIED_USER"); } }
export class RateLimitExceededError extends UserAccountError { constructor() { super("Too many requests. Please try again later.", "RATE_LIMIT_EXCEEDED"); } }


// --- Concept Implementation ---
export class UserAccountConcept {
    private users: Collection<User>;
    private profiles: Collection<Profile>;
    private pendingVerifications: Collection<PendingVerification>;
    private config: UserAccountConfig;
    private emailService: EmailService;
    private eventBus: EventBus;
    private rateLimiter: RateLimiter;

    constructor(
        db: Db,
        config: UserAccountConfig,
        emailService: EmailService,
        eventBus: EventBus,
        rateLimiter: RateLimiter,
    ) {
        this.users = db.collection<User>("users");
        this.profiles = db.collection<Profile>("profiles");
        this.pendingVerifications = db.collection<PendingVerification>("pending_verifications");
        this.config = config;
        this.emailService = emailService;
        this.eventBus = eventBus;
        this.rateLimiter = rateLimiter;

        // Ensure indexes for performance and uniqueness
        this.users.createIndex({ email: 1 }, { unique: true });
        this.users.createIndex({ username: 1 }, { unique: true });
        this.pendingVerifications.createIndex({ expiry: 1 }, { expireAfterSeconds: 0 }); // TTL index for pending verifications
    }

    private generateVerificationToken(email: EmailAddress, expiry: Timestamp): VerificationToken {
        const payload = JSON.stringify({ email, expiry: expiry.toISOString() });
        const hmac = createHmac('sha256', this.config.TOKEN_SECRET);
        hmac.update(payload);
        return `${payload}.${hmac.digest('hex')}`;
    }

    private verifyAndDecodeToken(token: VerificationToken): { email: EmailAddress, expiry: Timestamp } {
        const parts = token.split('.');
        if (parts.length !== 2) throw new InvalidTokenError();
        const [payloadStr, signature] = parts;

        const hmac = createHmac('sha256', this.config.TOKEN_SECRET);
        hmac.update(payloadStr);
        if (hmac.digest('hex') !== signature) throw new InvalidTokenError();

        const payload = JSON.parse(payloadStr);
        const expiry = new Date(payload.expiry);
        const email = payload.email;

        if (!email || !expiry) throw new InvalidTokenError();

        return { email, expiry };
    }

    private isSchoolEmail(email: EmailAddress): boolean {
        const domain = email.split('@')[1];
        if (!domain) return false;
        return this.config.ALLOWED_SCHOOL_DOMAINS.some(allowedDomain =>
            domain.endsWith(allowedDomain) || allowedDomain === domain
        );
    }

    /**
     * `request_verification(email: EmailAddress, ipAddress?: string) -> VerificationToken`
     * Requests an email verification link to be sent.
     * @param email The student's email address.
     * @param ipAddress The IP address of the requesting user for rate limiting.
     * @returns The generated verification token (for internal use, not sent to client directly).
     */
    async request_verification(email: EmailAddress, ipAddress?: string): Promise<VerificationToken> {
        if (!this.isSchoolEmail(email)) {
            throw new InvalidEmailError();
        }

        // Apply rate limiting
        const emailRateKey = `email_verify:${email}`;
        const ipRateKey = `ip_verify:${ipAddress || 'unknown'}`;
        const emailAllowed = await this.rateLimiter.attempt(emailRateKey, 3, 60 * 60 * 1000); // 3 requests per email per hour
        const ipAllowed = await this.rateLimiter.attempt(ipRateKey, 10, 60 * 60 * 1000); // 10 requests per IP per hour

        if (!emailAllowed || !ipAllowed) {
            throw new RateLimitExceededError();
        }

        const expiry = new Date(Date.now() + this.config.TOKEN_TTL_MINUTES * 60 * 1000);
        const token = this.generateVerificationToken(email, expiry);
        const createdAt = new Date();

        // Invalidate any other active tokens for this email
        await this.pendingVerifications.updateMany(
            { email: email, status: 'pending' },
            { $set: { status: 'expired' } } // Mark as expired so they can't be used
        );

        await this.pendingVerifications.insertOne({
            _id: token,
            email,
            expiry,
            createdAt,
            ipAddress,
            attempts: 0,
            status: 'pending',
        });

        const verificationLink = `${this.config.APP_BASE_URL}/verify?token=${encodeURIComponent(token)}`;
        await this.emailService.sendVerificationEmail(email, verificationLink);

        return token;
    }

    /**
     * `confirm_verification(token: VerificationToken, username: Username) -> UserId`
     * Confirms the email verification using the provided token and sets a username.
     * @param token The verification token received by email.
     * @param username The desired username (immutable after this action).
     * @returns The UserId of the newly verified user.
     */
    async confirm_verification(token: VerificationToken, username: Username): Promise<UserId> {
        if (!username || username.trim() === '') {
            throw new UserAccountError("Username cannot be empty.", "EMPTY_USERNAME");
        }

        const verificationRecord = await this.pendingVerifications.findOne({ _id: token });

        if (!verificationRecord) {
            throw new InvalidTokenError();
        }

        if (verificationRecord.status !== 'pending') {
            throw new TokenUsedError(); // Or expired, or already used
        }

        if (verificationRecord.expiry < new Date()) {
            await this.pendingVerifications.updateOne({ _id: token }, { $set: { status: 'expired' } });
            throw new TokenExpiredError();
        }

        // Verify the HMAC signature
        const decoded = this.verifyAndDecodeToken(token);
        if (decoded.email !== verificationRecord.email) {
             // This indicates a mismatch between the token payload and the stored record, which shouldn't happen
             // if token generation/storage is correct. Could be an attempt to use a valid token with wrong email.
             throw new InvalidTokenError();
        }

        // Check if username is already taken
        const existingUserWithUsername = await this.users.findOne({ username });
        if (existingUserWithUsername) {
            throw new UsernameTakenError();
        }

        // Check if an account with this email already exists and is verified
        const existingVerifiedUser = await this.users.findOne({ email: verificationRecord.email, verifiedAt: { $ne: null } });
        if (existingVerifiedUser) {
            // Account already verified, just mark this token as used and return existing user ID.
            await this.pendingVerifications.updateOne({ _id: token }, { $set: { status: 'used' } });
            // Invalidate other pending tokens for this email again just in case
            await this.pendingVerifications.updateMany(
                { email: verificationRecord.email, status: 'pending' },
                { $set: { status: 'expired' } }
            );
            this.eventBus.emit("UserVerified", { userId: existingVerifiedUser._id.toHexString(), timestamp: new Date() });
            return existingVerifiedUser._id.toHexString();
        }

        const userId = new ObjectId();
        const now = new Date();

        const user: User = {
            _id: userId,
            email: verificationRecord.email,
            username,
            verifiedAt: now,
            createdAt: now,
        };

        const profile: Profile = {
            _id: userId,
            bio: undefined,
            listings: [],
            bids: [],
            threads: [],
        };

        await this.users.insertOne(user);
        await this.profiles.insertOne(profile);

        // Mark token as used
        await this.pendingVerifications.updateOne({ _id: token }, { $set: { status: 'used' } });

        // Invalidate any other active tokens for this email
        await this.pendingVerifications.updateMany(
            { email: verificationRecord.email, status: 'pending' },
            { $set: { status: 'expired' } }
        );
        
        this.eventBus.emit("UserVerified", { userId: userId.toHexString(), timestamp: now });

        return userId.toHexString();
    }

    /**
     * `edit_avatar(userId: UserId, newAvatar: Url)`
     * Updates the user's avatar URL.
     * @param userId The ID of the user.
     * @param newAvatar The new URL for the avatar.
     */
    async edit_avatar(userId: UserId, newAvatar: Url): Promise<void> {
        const userObjectId = new ObjectId(userId);
        const user = await this.users.findOne({ _id: userObjectId });

        if (!user) throw new UserNotFoundError();
        if (!user.verifiedAt) throw new UnverifiedUserError();

        await this.users.updateOne(
            { _id: userObjectId },
            { $set: { avatarUrl: newAvatar } }
        );
    }

    /**
     * `edit_bio(userId: UserId, bio: String)`
     * Updates the user's biography.
     * @param userId The ID of the user.
     * @param bio The new biography text.
     */
    async edit_bio(userId: UserId, bio: string): Promise<void> {
        const userObjectId = new ObjectId(userId);
        const user = await this.users.findOne({ _id: userObjectId });

        if (!user) throw new UserNotFoundError();
        if (!user.verifiedAt) throw new UnverifiedUserError();

        await this.profiles.updateOne(
            { _id: userObjectId },
            { $set: { bio: bio } }
        );
    }

    /**
     * `delete_account(userId: UserId)`
     * Deletes a user account and their associated profile.
     * Emits `UserDeleted` event.
     * @param userId The ID of the user to delete.
     */
    async delete_account(userId: UserId): Promise<void> {
        const userObjectId = new ObjectId(userId);

        const userExists = await this.users.findOne({ _id: userObjectId });
        if (!userExists) {
            throw new UserNotFoundError(); // Or silently ignore if idempotency is preferred
        }

        await this.users.deleteOne({ _id: userObjectId });
        await this.profiles.deleteOne({ _id: userObjectId });
        await this.pendingVerifications.deleteMany({ email: userExists.email }); // Clean up any pending verifications

        this.eventBus.emit("UserDeleted", { userId, timestamp: new Date() });
    }

    /**
     * `view_profile(userId: UserId) -> ProfileView`
     * Retrieves the public profile view of a user.
     * @param userId The ID of the user whose profile to view.
     * @returns A ProfileView object.
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
            verifiedAt: user.verifiedAt,
            listings: profile.listings,
            bids: profile.bids,
            threads: profile.threads,
        };
    }
}

// --- Minimal In-Memory EventBus and EmailService for local testing/bootstrapping ---
// In a production system, these would be more robust or integrated with external services.

export class InMemoryEventBus implements EventBus {
    private listeners: Map<string, ((data: any) => void)[]>;

    constructor() {
        this.listeners = new Map();
    }

    emit(event: "UserVerified" | "UserDeleted", data: any): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(data);
            }
        }
    }

    on(event: "UserVerified" | "UserDeleted", handler: (data: any) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(handler);
    }

    clear() {
        this.listeners.clear();
    }
}

export class MockEmailService implements EmailService {
    public sentEmails: { to: EmailAddress, token: VerificationToken, link: string }[] = [];

    async sendVerificationEmail(to: EmailAddress, link: string): Promise<void> {
        // In a real service, this would call an API (e.g., Resend, SendGrid)
        // For testing, we just record the email being "sent"
        this.sentEmails.push({ to, token: link.split('?token=')[1], link });
        console.log(`[MockEmailService] Sent verification email to ${to} with link: ${link}`);
    }

    clear() {
        this.sentEmails = [];
    }
}

export class InMemoryRateLimiter implements RateLimiter {
    private attempts: Map<string, { count: number, firstAttempt: number }>; // key -> { count, timestamp }
    private cleanupInterval: number;

    constructor(cleanupIntervalMs: number = 60 * 60 * 1000) { // Default cleanup every hour
        this.attempts = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    }

    async attempt(key: string, limit: number, windowMs: number): Promise<boolean> {
        const now = Date.now();
        const record = this.attempts.get(key);

        if (!record || (now - record.firstAttempt > windowMs)) {
            this.attempts.set(key, { count: 1, firstAttempt: now });
            return true;
        }

        if (record.count < limit) {
            record.count++;
            this.attempts.set(key, record);
            return true;
        }

        return false;
    }

    async reset(key: string): Promise<void> {
        this.attempts.delete(key);
    }

    private cleanup() {
        const now = Date.now();
        for (const [key, record] of this.attempts.entries()) {
            // Assuming default windowMs as the cleanup window
            // In a more robust system, each key could have its own window
            // For now, if no activity for an hour, clear it.
            if (now - record.firstAttempt > (this.cleanupInterval || 60 * 60 * 1000)) {
                this.attempts.delete(key);
            }
        }
        // console.log("[RateLimiter] Cleaned up old records. Current active keys:", this.attempts.size);
    }

    close() {
        clearInterval(this.cleanupInterval);
    }
}

```

```typescript
// src/concepts/UserAccount/UserAccountConcept.test.ts
import {
    assert,
    assertEquals,
    assertExists,
    assertNotEquals,
    assertRejects,
    assertStringIncludes,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { describe, beforeAll, beforeEach, afterAll, it } from "https://deno.land/std@0.178.0/testing/bdd.ts";
import { MongoClient, Db } from "https://deno.land/x/mongo@v0.32.0/mod.ts";

import {
    UserAccountConcept,
    UserAccountConfig,
    InMemoryEventBus,
    MockEmailService,
    InMemoryRateLimiter,
    InvalidEmailError,
    TokenExpiredError,
    TokenUsedError,
    InvalidTokenError,
    UsernameTakenError,
    UserNotFoundError,
    UnverifiedUserError,
    RateLimitExceededError,
    EmailAddress,
    UserId,
    VerificationToken,
} from "./UserAccountConcept.ts";

// --- Mock Deno.env for testing ---
const MOCK_TOKEN_SECRET = "super_secret_test_key_1234567890abcdef";
const MOCK_ALLOWED_SCHOOL_DOMAINS = ["example.edu", "mycollege.edu", "deno.land"];
const MOCK_APP_BASE_URL = "http://localhost:8000";

const config: UserAccountConfig = {
    TOKEN_SECRET: MOCK_TOKEN_SECRET,
    TOKEN_TTL_MINUTES: 5,
    ALLOWED_SCHOOL_DOMAINS: MOCK_ALLOWED_SCHOOL_DOMAINS,
    APP_BASE_URL: MOCK_APP_BASE_URL,
};

// --- MongoDB Test Setup ---
const mongoClient = new MongoClient();
const MONGODB_TEST_URI = Deno.env.get("MONGODB_TEST_URI") || "mongodb://localhost:27017";
const DB_NAME = `campuscloset_test_${crypto.randomUUID().substring(0, 8)}`; // Unique DB for each test run

let db: Db;
let userAccountConcept: UserAccountConcept;
let mockEmailService: MockEmailService;
let inMemoryEventBus: InMemoryEventBus;
let inMemoryRateLimiter: InMemoryRateLimiter;

describe("UserAccountConcept", () => {
    beforeAll(async () => {
        await mongoClient.connect(MONGODB_TEST_URI);
        db = mongoClient.database(DB_NAME);
        console.log(`Connected to MongoDB test database: ${DB_NAME}`);
    });

    beforeEach(async () => {
        mockEmailService = new MockEmailService();
        inMemoryEventBus = new InMemoryEventBus();
        inMemoryRateLimiter = new InMemoryRateLimiter(5 * 1000); // Cleanup every 5 seconds for tests

        userAccountConcept = new UserAccountConcept(
            db,
            config,
            mockEmailService,
            inMemoryEventBus,
            inMemoryRateLimiter,
        );

        // Clear all collections before each test
        for (const collectionName of await db.listCollectionNames()) {
            await db.collection(collectionName).deleteMany({});
        }
        mockEmailService.clear();
        inMemoryEventBus.clear();
        await inMemoryRateLimiter.reset('*'); // Reset all rate limits
    });

    afterAll(async () => {
        await db.drop(); // Clean up the test database
        await mongoClient.close();
        inMemoryRateLimiter.close(); // Close the rate limiter interval
        console.log(`Dropped MongoDB test database: ${DB_NAME}`);
    });

    // --- request_verification tests ---
    it("should successfully request verification for a valid school email", async () => {
        const email: EmailAddress = "test@example.edu";
        const token = await userAccountConcept.request_verification(email);

        assertExists(token);
        assertEquals(mockEmailService.sentEmails.length, 1);
        assertEquals(mockEmailService.sentEmails[0].to, email);
        assertStringIncludes(mockEmailService.sentEmails[0].link, MOCK_APP_BASE_URL);
        assertStringIncludes(mockEmailService.sentEmails[0].link, encodeURIComponent(token));

        const pendingVerification = await db.collection("pending_verifications").findOne({ _id: token });
        assertExists(pendingVerification);
        assertEquals(pendingVerification.email, email);
        assertEquals(pendingVerification.status, 'pending');
        assert(pendingVerification.expiry > new Date());
    });

    it("should reject verification request for an invalid (non-school) email", async () => {
        const email: EmailAddress = "invalid@gmail.com";
        await assertRejects(
            async () => await userAccountConcept.request_verification(email),
            InvalidEmailError,
            "Invalid school email address."
        );
        assertEquals(mockEmailService.sentEmails.length, 0);
    });

    it("should reject verification request if rate limit is exceeded for email", async () => {
        const email: EmailAddress = "limit@example.edu";
        // Attempt 3 times within the window (3 attempts per hour as per concept)
        await userAccountConcept.request_verification(email, "127.0.0.1");
        await userAccountConcept.request_verification(email, "127.0.0.1");
        await userAccountConcept.request_verification(email, "127.0.0.1");

        await assertRejects(
            async () => await userAccountConcept.request_verification(email, "127.0.0.1"),
            RateLimitExceededError,
            "Too many requests. Please try again later."
        );
        assertEquals(mockEmailService.sentEmails.length, 3);
    });

    it("should invalidate previous pending tokens when a new request is made for the same email", async () => {
        const email: EmailAddress = "multiple@example.edu";
        const token1 = await userAccountConcept.request_verification(email);
        const token2 = await userAccountConcept.request_verification(email);

        const record1 = await db.collection("pending_verifications").findOne({ _id: token1 });
        const record2 = await db.collection("pending_verifications").findOne({ _id: token2 });

        assertExists(record1);
        assertExists(record2);
        assertEquals(record1.status, 'expired'); // First token should be expired
        assertEquals(record2.status, 'pending'); // Second token should be pending
        assertEquals(mockEmailService.sentEmails.length, 2);
    });

    // --- confirm_verification tests ---
    it("should successfully confirm verification with a valid token and unique username", async () => {
        const email: EmailAddress = "verify@example.edu";
        const username: Username = "verifiedUser";
        const token = await userAccountConcept.request_verification(email);

        let emittedUserId: UserId | null = null;
        inMemoryEventBus.on("UserVerified", (data) => {
            emittedUserId = data.userId;
        });

        const userId = await userAccountConcept.confirm_verification(token, username);

        assertExists(userId);
        assertNotEquals(emittedUserId, null);
        assertEquals(emittedUserId, userId);

        const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
        assertExists(user);
        assertEquals(user.email, email);
        assertEquals(user.username, username);
        assertExists(user.verifiedAt);

        const profile = await db.collection("profiles").findOne({ _id: new ObjectId(userId) });
        assertExists(profile);
        assertEquals(profile.listings.length, 0);
        assertEquals(profile.bids.length, 0);
        assertEquals(profile.threads.length, 0);

        const pendingVerification = await db.collection("pending_verifications").findOne({ _id: token });
        assertExists(pendingVerification);
        assertEquals(pendingVerification.status, 'used');
    });

    it("should reject confirmation with an expired token", async () => {
        const email: EmailAddress = "expired@example.edu";
        const username: Username = "expiredUser";
        const expiredConfig = { ...config, TOKEN_TTL_MINUTES: -1 }; // Make token expire immediately

        const expiredConcept = new UserAccountConcept(
            db,
            expiredConfig,
            mockEmailService,
            inMemoryEventBus,
            inMemoryRateLimiter
        );
        const token = await expiredConcept.request_verification(email);

        // Simulate a small delay if needed to ensure expiry (though -1 min should be instant)
        await new Promise(resolve => setTimeout(resolve, 10));

        await assertRejects(
            async () => await expiredConcept.confirm_verification(token, username),
            TokenExpiredError,
            "Verification token has expired."
        );

        const pendingVerification = await db.collection("pending_verifications").findOne({ _id: token });
        assertExists(pendingVerification);
        assertEquals(pendingVerification.status, 'expired');
    });

    it("should reject confirmation with an already used token", async () => {
        const email: EmailAddress = "used@example.edu";
        const username1: Username = "userOne";
        const username2: Username = "userTwo";
        const token = await userAccountConcept.request_verification(email);

        await userAccountConcept.confirm_verification(token, username1); // First use

        await assertRejects(
            async () => await userAccountConcept.confirm_verification(token, username2),
            TokenUsedError,
            "Verification token has already been used."
        );
    });

    it("should reject confirmation with an invalid token", async () => {
        await assertRejects(
            async () => await userAccountConcept.confirm_verification("invalid.token.signature", "badUser"),
            InvalidTokenError,
            "Invalid verification token."
        );
    });

    it("should reject confirmation if username is already taken", async () => {
        const email1: EmailAddress = "first@example.edu";
        const email2: EmailAddress = "second@example.edu";
        const username: Username = "takenUsername";

        const token1 = await userAccountConcept.request_verification(email1);
        await userAccountConcept.confirm_verification(token1, username); // User1 takes the username

        const token2 = await userAccountConcept.request_verification(email2);
        await assertRejects(
            async () => await userAccountConcept.confirm_verification(token2, username),
            UsernameTakenError,
            "Username is already taken."
        );
    });

    it("should reject confirmation if username is empty", async () => {
        const email: EmailAddress = "empty@example.edu";
        const token = await userAccountConcept.request_verification(email);
        await assertRejects(
            async () => await userAccountConcept.confirm_verification(token, " "),
            Error, // UserAccountError
            "Username cannot be empty."
        );
    });

    // --- edit_avatar tests ---
    it("should successfully edit user avatar", async () => {
        const email = "avatar@example.edu";
        const username = "avatarUser";
        const token = await userAccountConcept.request_verification(email);
        const userId = await userAccountConcept.confirm_verification(token, username);

        const newAvatarUrl = "http://example.com/new_avatar.jpg";
        await userAccountConcept.edit_avatar(userId, newAvatarUrl);

        const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
        assertExists(user);
        assertEquals(user.avatarUrl, newAvatarUrl);
    });

    it("should reject editing avatar for a non-existent user", async () => {
        await assertRejects(
            async () => await userAccountConcept.edit_avatar(new ObjectId().toHexString(), "http://fake.com/pic.jpg"),
            UserNotFoundError,
            "User not found."
        );
    });

    it("should reject editing avatar for an unverified user", async () => {
        const email = "unverified@example.edu";
        const unverifiedUserId = new ObjectId().toHexString();
        // Manually insert an unverified user
        await db.collection("users").insertOne({
            _id: new ObjectId(unverifiedUserId),
            email,
            username: "unverified",
            verifiedAt: null!, // No verifiedAt means unverified
            createdAt: new Date(),
        });
        await db.collection("profiles").insertOne({
            _id: new ObjectId(unverifiedUserId),
            bio: "test", listings: [], bids: [], threads: [],
        });

        await assertRejects(
            async () => await userAccountConcept.edit_avatar(unverifiedUserId, "http://fake.com/pic.jpg"),
            UnverifiedUserError,
            "User is not verified."
        );
    });

    // --- edit_bio tests ---
    it("should successfully edit user bio", async () => {
        const email = "bio@example.edu";
        const username = "bioUser";
        const token = await userAccountConcept.request_verification(email);
        const userId = await userAccountConcept.confirm_verification(token, username);

        const newBio = "This is my new biography.";
        await userAccountConcept.edit_bio(userId, newBio);

        const profile = await db.collection("profiles").findOne({ _id: new ObjectId(userId) });
        assertExists(profile);
        assertEquals(profile.bio, newBio);
    });

    it("should reject editing bio for a non-existent user", async () => {
        await assertRejects(
            async () => await userAccountConcept.edit_bio(new ObjectId().toHexString(), "Non-existent bio"),
            UserNotFoundError,
            "User not found."
        );
    });

    it("should reject editing bio for an unverified user", async () => {
        const email = "unverifiedbio@example.edu";
        const unverifiedUserId = new ObjectId().toHexString();
        await db.collection("users").insertOne({
            _id: new ObjectId(unverifiedUserId),
            email,
            username: "unverifiedbio",
            verifiedAt: null!,
            createdAt: new Date(),
        });
        await db.collection("profiles").insertOne({
            _id: new ObjectId(unverifiedUserId),
            bio: "test", listings: [], bids: [], threads: [],
        });

        await assertRejects(
            async () => await userAccountConcept.edit_bio(unverifiedUserId, "Unverified bio change attempt"),
            UnverifiedUserError,
            "User is not verified."
        );
    });

    // --- delete_account tests ---
    it("should successfully delete a user account and emit UserDeleted event", async () => {
        const email = "delete@example.edu";
        const username = "deleteUser";
        const token = await userAccountConcept.request_verification(email);
        const userId = await userAccountConcept.confirm_verification(token, username);

        let emittedUserId: UserId | null = null;
        inMemoryEventBus.on("UserDeleted", (data) => {
            emittedUserId = data.userId;
        });

        await userAccountConcept.delete_account(userId);

        const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
        assertEquals(user, undefined); // User should be deleted
        const profile = await db.collection("profiles").findOne({ _id: new ObjectId(userId) });
        assertEquals(profile, undefined); // Profile should be deleted

        assertExists(emittedUserId);
        assertEquals(emittedUserId, userId);
    });

    it("should reject deleting a non-existent user account", async () => {
        await assertRejects(
            async () => await userAccountConcept.delete_account(new ObjectId().toHexString()),
            UserNotFoundError,
            "User not found."
        );
    });

    // --- view_profile tests ---
    it("should successfully retrieve a user profile", async () => {
        const email = "view@example.edu";
        const username = "viewUser";
        const bio = "I love Deno!";
        const avatarUrl = "http://example.com/view_avatar.png";
        const token = await userAccountConcept.request_verification(email);
        const userId = await userAccountConcept.confirm_verification(token, username);

        await userAccountConcept.edit_bio(userId, bio);
        await userAccountConcept.edit_avatar(userId, avatarUrl);

        const profileView = await userAccountConcept.view_profile(userId);

        assertEquals(profileView.userId, userId);
        assertEquals(profileView.email, email);
        assertEquals(profileView.username, username);
        assertEquals(profileView.bio, bio);
        assertEquals(profileView.avatarUrl, avatarUrl);
        assertExists(profileView.verifiedAt);
        assertEquals(profileView.listings.length, 0);
        assertEquals(profileView.bids.length, 0);
        assertEquals(profileView.threads.length, 0);
    });

    it("should reject retrieving profile for a non-existent user", async () => {
        await assertRejects(
            async () => await userAccountConcept.view_profile(new ObjectId().toHexString()),
            UserNotFoundError,
            "User not found."
        );
    });

    // --- Operational Principles & Interesting Scenarios ---
    it("should prevent a verified user from re-verifying with the same email", async () => {
        const email = "reverify@example.edu";
        const username = "reverifyUser";
        const token1 = await userAccountConcept.request_verification(email);
        const userId = await userAccountConcept.confirm_verification(token1, username);

        // Request verification again
        const token2 = await userAccountConcept.request_verification(email);
        const pendingVerification2 = await db.collection("pending_verifications").findOne({ _id: token2 });
        assertExists(pendingVerification2);
        assertEquals(pendingVerification2.status, 'pending'); // New token is pending

        // Attempt to confirm verification again with the new token
        // Should succeed but return the existing userId
        const userIdAgain = await userAccountConcept.confirm_verification(token2, username);
        assertEquals(userIdAgain, userId); // Should return the original userId

        const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
        assertExists(user);
        assertEquals(user.username, username); // Username should remain the same
        assertEquals(user.email, email);

        const pendingVerificationAfter = await db.collection("pending_verifications").findOne({ _id: token2 });
        assertExists(pendingVerificationAfter);
        assertEquals(pendingVerificationAfter.status, 'used');
    });

    it("should handle username immutability (confirmation should fail if username already used elsewhere)", async () => {
        const email1 = "user1@example.edu";
        const email2 = "user2@example.edu";
        const username = "immutableUser";

        const token1 = await userAccountConcept.request_verification(email1);
        await userAccountConcept.confirm_verification(token1, username);

        const token2 = await userAccountConcept.request_verification(email2);
        await assertRejects(
            async () => await userAccountConcept.confirm_verification(token2, username),
            UsernameTakenError,
            "Username is already taken."
        );
    });

    it("should correctly handle token invalidation (signature mismatch)", async () => {
        const email = "mismatch@example.edu";
        await userAccountConcept.request_verification(email);
        const badToken = "some_random_payload.wrongsignature";

        await assertRejects(
            async () => await userAccountConcept.confirm_verification(badToken, "mismatchUser"),
            InvalidTokenError,
            "Invalid verification token."
        );
    });

    it("should clean up pending verification records via TTL index after expiry", async () => {
        const email: EmailAddress = "ttl@example.edu";
        const ttlConfig = { ...config, TOKEN_TTL_MINUTES: 0.001 }; // Very short TTL (approx 60ms)

        const ttlConcept = new UserAccountConcept(
            db,
            ttlConfig,
            mockEmailService,
            inMemoryEventBus,
            inMemoryRateLimiter,
        );
        const token = await ttlConcept.request_verification(email);

        // Wait for TTL to expire and MongoDB to clean up
        await new Promise(resolve => setTimeout(resolve, 500)); // Give Mongo some time to process TTL

        const pendingVerification = await db.collection("pending_verifications").findOne({ _id: token });
        assertEquals(pendingVerification, undefined); // Should be cleaned up by TTL
    });
});

```
