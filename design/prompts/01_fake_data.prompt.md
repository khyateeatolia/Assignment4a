# Generate Fake Testing Data for UserAccount

## Context
We have implemented the UserAccount concept with the following structure:
- Email verification system with school domain validation
- User profile management (avatar, bio)
- Event-driven architecture with UserVerified/UserDeleted events
- MongoDB integration with proper indexing

Here is the testing document that we have created so far: 

## Current Test Structure

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

    // ... more test cases for confirm_verification, edit_avatar, edit_bio, delete_account, view_profile
    // ... operational principles and interesting scenarios
});
```

## Test Categories Covered:
- **request_verification**: Valid/invalid emails, rate limiting, token invalidation
- **confirm_verification**: Valid tokens, expired tokens, used tokens, username conflicts
- **edit_avatar**: Success cases, user not found, unverified users
- **edit_bio**: Success cases, user not found, unverified users  
- **delete_account**: Success cases, user not found, event emission
- **view_profile**: Success cases, user not found
- **Operational Principles**: Re-verification, username immutability, token security


## Request
Please generate comprehensive fake testing data that can be used to populate the system for realistic testing scenarios. We want to test both the general cases and rare cases.

**Requirements:**
- Generate realistic fake data for all UserAccount fields (emails, usernames, avatars, bios)
- Include various school domains (.edu, .ac.uk, etc.)
- Create diverse user profiles with different characteristics
- Include edge cases (very long bios, special characters in usernames, etc.)
- Generate data that would be useful for testing the full user lifecycle

**Output format:**
- Provide the data in a structured format (JSON or TypeScript objects)
- Include at least 20-30 fake user records
- Organize by different user types (new users, verified users, users with profiles, etc.)
- Include sample verification tokens and timestamps
- Make it easy to import and use in tests

**Data categories to include:**
1. School email addresses (various domains)
2. Usernames (diverse, realistic)
3. Avatar URLs (fake but realistic)
4. Bio text (various lengths and styles)
5. Verification tokens (expired, active, used)
6. Timestamps (realistic date ranges)
7. User states (pending verification, verified, with profiles)

Please generate this fake data in a format that can be easily imported and used in our Deno test suite.
