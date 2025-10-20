---
timestamp: 'Sun Oct 19 2025 15:04:04 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_150404.619401e0.md]]'
content_id: 4907517efd8d265285f5ac9fca3aa6d3dc5cec129bb95e1b5cc65b60a0eab1eb
---

# response:

Here are the comprehensive tests, fake data, and mock services for your SSO-based `UserAccountConcept` implementation, following the LikertSurvey test format and designed to be compatible with your actual code.

***

## Assumptions

1. **File Structure:**
   * The `UserAccountConcept` implementation is located at `src/concepts/UserAccount/UserAccountConcept.ts`.
   * The `UserAccountErrors` classes are at `src/concepts/UserAccount/UserAccountErrors.ts`.
   * The `testDb()` utility is at `src/utils/database.ts`.
   * The generated test files (`UserAccountConcept.test.ts`, `mock-services.ts`, `fake-data.ts`) will reside in the same directory as the `UserAccountConcept` implementation (i.e., `src/concepts/UserAccount/`).
2. **`testDb()` Functionality:** The `testDb()` function (from `src/utils/database.ts`) correctly provides a fresh MongoDB `Db` instance and `MongoClient` for each test, ensuring isolation, and handles connection/disconnection. It is assumed to use `deno.land/x/mongo`.
3. **`UserAccountConcept` Constructor:** The constructor expects parameters in the order: `db: Db`, `ssoValidationService: SSOValidationService`, `eventBus: EventBus`, `config: UserAccountConfig`.
4. **`SSOValidationService.validateToken()`:** This method returns a unique string identifier (`ssoId`, typically the user's email or a provider-specific ID) if the token is valid, and `null` otherwise.
5. **`userId` and `sessionId`:** These are returned as string representations of MongoDB `ObjectId`s.
6. **Password Hashing:** Password hashing and comparison are handled internally by `UserAccountConcept`. Plaintext passwords are provided as input to `register_or_login` (for hybrid auth) and `change_password`.
7. **`username` Handling:** Since `register_or_login` does not explicitly take `username` as a parameter, the `UserAccountConcept` is assumed to either derive a unique `username` (e.g., from `email` or `ssoId`, handling conflicts by appending numbers) or only validate/set it via other methods. The `UsernameTakenError` is addressed with this ambiguity in mind.
8. **Event Emission:** The `EventBus` mock records events; the tests verify that expected events are emitted.
9. **Error Classes:** The specified error classes (`UserAccountError`, `AuthenticationFailedError`, etc.) are correctly defined and thrown by the `UserAccountConcept`.

***

## 1. Mock Services

These mock implementations will simulate the behavior of external dependencies of `UserAccountConcept`.
**File:** `src/concepts/UserAccount/mock-services.ts`

```typescript
// src/concepts/UserAccount/mock-services.ts
import {
  EventBus,
  SSOValidationService,
  UserAccountConfig,
} from "./UserAccountConcept.ts"; // Import interfaces from the actual concept

/**
 * Mock implementation of SSOValidationService.
 * Configured with a map of "provider_token" to `ssoId` (e.g., email) for validation.
 */
interface SsoMapping {
  [provider_token: string]: string; // Maps "Google_valid_token_alice" to "alice@example.com"
}

export class MockSSOValidationService implements SSOValidationService {
  private mappings: SsoMapping;

  constructor(mappings: SsoMapping) {
    this.mappings = mappings;
  }

  async validateToken(
    ssoProvider: string,
    ssoToken: string,
  ): Promise<string | null> {
    const key = `${ssoProvider}_${ssoToken}`;
    const ssoId = this.mappings[key];
    return Promise.resolve(ssoId || null);
  }
}

/**
 * Mock implementation of EventBus.
 * Records all emitted events for verification in tests.
 */
export class MockEventBus implements EventBus {
  public emittedEvents: Array<{ eventName: string; payload: any }> = [];

  emit(eventName: string, payload: any): void {
    this.emittedEvents.push({ eventName, payload });
    // console.log(`[MockEventBus] Emitted: ${eventName}`, payload); // Uncomment for debugging
  }
}

/**
 * Mock implementation of UserAccountConfig.
 * Provides fixed configuration values for testing.
 */
export const mockUserAccountConfig: UserAccountConfig = {
  jwtSecret: "test-jwt-secret-for-user-accounts-testing-only", // Must be a string
  sessionExpiresInMs: 1000 * 60 * 60 * 24, // 24 hours for default test sessions
  passwordMinLength: 8,
  bioMaxLength: 200,
  // Assuming these exist based on common UserAccount features, adjust if your actual config differs
  usernameMinLength: 3,
  usernameMaxLength: 20,
  emailRegex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};
```

***

## 2. Fake Test Data

Comprehensive fake data covering various user scenarios, SSO tokens, and edge cases.
**File:** `src/concepts/UserAccount/fake-data.ts`

```typescript
// src/concepts/UserAccount/fake-data.ts

// Mappings for the MockSSOValidationService to simulate valid/invalid SSO tokens
export const fakeSsoMappings = {
  // Valid SSO tokens for registration/login
  "Google_valid_token_alice": "alice@example.com",
  "Google_valid_token_bob": "bob@example.com",
  "GitHub_valid_token_charlie": "charlie@github.com",
  "UniversityA_valid_token_diana": "diana@universitya.edu",
  "UniversityB_valid_token_eve": "eve@universityb.edu",
  "Google_valid_token_frank": "frank@example.com", // For password management tests
  "Google_valid_token_grace": "grace@example.com", // For account deletion tests

  // Invalid SSO tokens (will result in `null` from `validateToken`)
  "Google_invalid_token": null,
  "GitHub_expired_token": null,
};

// Various user profiles and related data for test scenarios
export const fakeUsers = {
  alice: {
    email: "alice@example.com",
    username: "alice_sso_user", // Username, might be autogenerated or provided by SSO
    ssoProvider: "Google",
    ssoToken: "valid_token_alice",
    ipAddress: "192.168.1.1",
    userAgent: "Chrome/Deno",
    newAvatar: "https://example.com/avatars/alice_new.jpg",
    newBio: "Alice is a digital explorer, fascinated by Deno and MongoDB.",
    longBio: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. This bio is intentionally made longer than the `bioMaxLength` defined in `mockUserAccountConfig` to test the `BioTooLongError`.",
  },
  bob: {
    email: "bob@example.com",
    username: "bob_session_tester",
    ssoProvider: "Google",
    ssoToken: "valid_token_bob",
    ipAddress: "192.168.1.2",
    userAgent: "Firefox/Deno",
  },
  charlie: {
    email: "charlie@github.com",
    username: "charlie_hybrid_auth",
    ssoProvider: "GitHub",
    ssoToken: "valid_token_charlie",
    ipAddress: "192.168.1.3",
    userAgent: "Safari/Deno",
    initialPassword: "OldStrongPassword123!", // For hybrid auth with local password
    newPassword: "NewSuperSecurePassword456@",
    tooShortPassword: "short", // To test PasswordTooShortError
    wrongPassword: "IncorrectPassword!", // To test InvalidCredentialsError
    newAvatar: "https://example.com/avatars/charlie_avatar.png",
    newBio: "Charlie, a developer who loves open-source contributions and secure systems.",
  },
  diana: {
    email: "diana@universitya.edu",
    username: "diana_account_lifecycle",
    ssoProvider: "UniversityA",
    ssoToken: "valid_token_diana",
    ipAddress: "192.168.1.4",
    userAgent: "Edge/Deno",
    initialAvatar: "https://example.com/avatars/diana_initial.webp",
    initialBio: "Diana is an aspiring data scientist specializing in astrophysics.",
  },
  frank: {
    email: "frank@example.com",
    username: "frank_password_user",
    ssoProvider: "Google",
    ssoToken: "valid_token_frank",
    ipAddress: "192.168.1.5",
    userAgent: "Opera/Deno",
    initialPassword: "FrankPassword123",
    newPassword: "FrankNewPassword456!",
    wrongPassword: "WrongPassword999",
  },
  grace: {
    email: "grace@example.com",
    username: "grace_deleter",
    ssoProvider: "Google",
    ssoToken: "valid_token_grace",
    ipAddress: "192.168.1.6",
    userAgent: "Brave/Deno",
  },
  nonExistent: {
    email: "nonexistent@example.com",
    username: "nonexistent_user",
    ssoProvider: "Google",
    ssoToken: "non_existent_token", // No mapping, so `validateToken` returns null
    ipAddress: "10.0.0.1",
    userAgent: "Test/Deno",
  },
  invalidSso: {
    email: "invalid@sso.com",
    username: "invalid_sso_user",
    ssoProvider: "Google",
    ssoToken: "invalid_token", // Explicitly mapped to null in fakeSsoMappings
    ipAddress: "10.0.0.2",
    userAgent: "Bad/Deno",
  },
  // Placeholder for a user whose derived/attempted username might conflict,
  // if `register_or_login` could throw `UsernameTakenError`.
  // As discussed, this depends on `UserAccountConcept`'s specific username handling.
  duplicateUsernameCandidate: {
    email: "duplicate@example.com",
    username: "alice_sso_user", // Aims for same username as Alice
    ssoProvider: "GitHub",
    ssoToken: "github_token_duplicate_user",
    ipAddress: "192.168.1.7",
    userAgent: "Safari/macOS",
  },
};

// Fake session IDs for testing non-existent/invalid sessions (these are just example strings,
// real ObjectIds will be created dynamically)
export const fakeSessionIds = {
  nonExistent: "60c72b2f9b1e8a001c8c4c7a", // Example ObjectId-like string
  malformed: "not-a-valid-objectid",
};
```

***

## 3. Complete Test File

This file implements the tests for the `UserAccountConcept` following the specified LikertSurvey format.
**File:** `src/concepts/UserAccount/UserAccountConcept.test.ts`

```typescript
// src/concepts/UserAccount/UserAccountConcept.test.ts
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
} from "jsr:@std/assert";
import { ObjectId } from "https://deno.land/x/mongo@v0.32.0/mod.ts"; // Assuming this version for ObjectId
import { testDb } from "../../utils/database.ts"; // Adjust path as per your project structure

// The actual UserAccountConcept implementation
import { UserAccountConcept } from "./UserAccountConcept.ts";
// Error classes defined by your implementation
import {
  AuthenticationFailedError,
  BioTooLongError,
  InvalidCredentialsError,
  InvalidSessionError,
  PasswordTooShortError,
  SessionNotFoundError,
  UserNotFoundError,
  // UsernameTakenError, // Kept commented due to ambiguity in `register_or_login` API
} from "./UserAccountErrors.ts";
// Mock services and fake data
import {
  MockEventBus,
  MockSSOValidationService,
  mockUserAccountConfig,
} from "./mock-services.ts";
import { fakeSsoMappings, fakeUsers, fakeSessionIds } from "./fake-data.ts";

// Helper function to convert session ID string to MongoDB ObjectId
function sessionIdToObjectId(sessionId: string): ObjectId {
  try {
    return new ObjectId(sessionId);
  } catch (e) {
    throw new Error(`Invalid sessionId format: ${sessionId}. Error: ${e.message}`);
  }
}

// Main test suite following the LikertSurvey principle-based format
Deno.test("UserAccountConcept Principles", async (t) => {
  // Principle 1: SSO Registration and Login Flow
  await t.step(
    "Principle: SSO Registration and Login Flow - First-time SSO login, account creation, profile setup, subsequent login",
    async () => {
      const { db, client } = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockSsoService,
          mockEventBus,
          mockUserAccountConfig,
        );

        const alice = fakeUsers.alice;

        // 1. First-time SSO registration
        console.log("   --> Scenario: First-time SSO registration for Alice.");
        const { userId: aliceUserId, sessionId: aliceSessionId } =
          await userAccountConcept.register_or_login(
            alice.ssoProvider,
            alice.ssoToken,
            alice.ipAddress,
            alice.userAgent,
          );

        assertExists(aliceUserId, "Alice's userId should be returned.");
        assertExists(aliceSessionId, "Alice's sessionId should be returned.");

        // Verify user and profile creation in DB
        const usersCollection = db.collection("users");
        const profilesCollection = db.collection("profiles");
        const sessionsCollection = db.collection("sessions");

        const dbUser = await usersCollection.findOne({ _id: aliceUserId });
        const dbProfile = await profilesCollection.findOne({ _id: aliceUserId });
        const dbSession = await sessionsCollection.findOne({
          _id: sessionIdToObjectId(aliceSessionId),
        });

        assertExists(dbUser, "Alice's user record should exist in DB.");
        assertEquals(dbUser.email, alice.email, "User email should match.");
        assertEquals(
          dbUser.ssoProvider,
          alice.ssoProvider,
          "User SSO provider should match.",
        );
        assertEquals(
          dbUser.ssoId,
          alice.email,
          "User SSO ID should match (mock uses email).",
        );
        assertExists(dbUser.createdAt, "createdAt timestamp should exist.");
        assertExists(dbUser.lastLoginAt, "lastLoginAt timestamp should exist.");
        assertEquals(dbUser.isActive, true, "User should be active.");
        assertExists(dbProfile, "Alice's profile record should exist in DB.");
        assertEquals(
          dbProfile._id.toString(),
          aliceUserId,
          "Profile _id should match userId.",
        );
        assertExists(dbSession, "Alice's session record should exist in DB.");
        assertEquals(
          dbSession.userId.toString(),
          aliceUserId,
          "Session userId should match Alice's userId.",
        );
        assertEquals(dbSession.isValid, true, "Session should be valid.");
        assertEquals(
          dbSession.ipAddress,
          alice.ipAddress,
          "Session IP address should match.",
        );
        assertEquals(
          dbSession.userAgent,
          alice.userAgent,
          "Session user agent should match.",
        );

        // Verify events emitted
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "user:registered" &&
            e.payload.userId === aliceUserId &&
            e.payload.email === alice.email
          ),
          "user:registered event should be emitted for Alice.",
        );
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "user:loggedIn" && e.payload.userId === aliceUserId
          ),
          "user:loggedIn event should be emitted for Alice.",
        );

        // Clear events for next scenario
        mockEventBus.emittedEvents = [];

        // 2. Existing SSO user login
        console.log("   --> Scenario: Existing SSO user login for Alice.");
        const { userId: aliceUserId2, sessionId: aliceSessionId2 } =
          await userAccountConcept.register_or_login(
            alice.ssoProvider,
            alice.ssoToken,
            "192.168.1.99", // Different IP to show session change
            "AnotherBrowser/Deno", // Different user agent
          );

        assertEquals(
          aliceUserId2,
          aliceUserId,
          "Logging in again should return the same userId.",
        );
        assertNotEquals(
          aliceSessionId2,
          aliceSessionId,
          "Logging in again should create a new sessionId.",
        );
        // Ensure old session is still valid for a brief moment, or marked invalid if per-user-single-session.
        // The implementation note says "Proper session lifecycle with isValid flag". A new login creating a new session is common.
        // The old session might stay valid until expiration or explicit logout if multi-session is allowed.
        // Assuming new login creates new session and doesn't invalidate old ones by default for simplicity.
        // If the implementation *does* invalidate previous sessions on new login, this assertion might change.

        const dbUserAfterLogin = await usersCollection.findOne({
          _id: aliceUserId,
        });
        assertNotEquals(
          dbUserAfterLogin?.lastLoginAt?.getTime(),
          dbUser?.lastLoginAt?.getTime(), // Compare timestamps
          "lastLoginAt should be updated after re-login.",
        );

        // Verify events emitted
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "user:loggedIn" && e.payload.userId === aliceUserId2
          ),
          "user:loggedIn event should be emitted again for Alice.",
        );

        // 3. Attempt to register/login with invalid SSO token
        console.log("   --> Scenario: Login with an invalid SSO token.");
        const invalidSsoUser = fakeUsers.invalidSso;
        await assertRejects(
          () =>
            userAccountConcept.register_or_login(
              invalidSsoUser.ssoProvider,
              invalidSsoUser.ssoToken,
              invalidSsoUser.ipAddress,
              invalidSsoUser.userAgent,
            ),
          AuthenticationFailedError,
          "Should reject with AuthenticationFailedError for invalid SSO token.",
        );
      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 2: Session Management
  await t.step(
    "Principle: Session Management - Login, session validation, logout, session invalidation",
    async () => {
      const { db, client } = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        // Configure config with a very short session duration for testing expiration quickly
        const shortSessionConfig = {
          ...mockUserAccountConfig,
          sessionExpiresInMs: 200, // 200ms for testing expiration
        };
        userAccountConcept = new UserAccountConcept(
          db,
          mockSsoService,
          mockEventBus,
          shortSessionConfig, // Use short session config for this principle
        );

        const bob = fakeUsers.bob;

        // 1. Login and validate a fresh session
        console.log("   --> Scenario: Login and successful session validation for Bob.");
        const { userId: bobUserId, sessionId: bobSessionId } =
          await userAccountConcept.register_or_login(
            bob.ssoProvider,
            bob.ssoToken,
            bob.ipAddress,
            bob.userAgent,
          );

        assertExists(bobUserId, "Bob's userId should be returned.");
        assertExists(bobSessionId, "Bob's sessionId should be returned.");

        let validatedUserId = await userAccountConcept.validate_session(
          bobSessionId,
        );
        assertEquals(
          validatedUserId,
          bobUserId,
          "Session should be valid and return correct userId.",
        );

        // 2. Test session expiration
        console.log("   --> Scenario: Session expiration after a short period.");
        // Wait for session to expire (based on shortSessionConfig)
        await new Promise((resolve) =>
          setTimeout(resolve, shortSessionConfig.sessionExpiresInMs + 50)
        ); // Wait a little extra to ensure it's definitely expired

        await assertRejects(
          () => userAccountConcept.validate_session(bobSessionId),
          InvalidSessionError,
          "Should reject with InvalidSessionError after session expires.",
        );

        // 3. Logout and session invalidation
        console.log("   --> Scenario: User logout and session invalidation.");
        // Re-login Bob to get a new valid session with the default (longer) expiry
        userAccountConcept = new UserAccountConcept( // Re-instantiate with default config
          db,
          mockSsoService,
          mockEventBus,
          mockUserAccountConfig,
        );
        const { userId: bobUserId2, sessionId: bobSessionId2 } =
          await userAccountConcept.register_or_login(
            bob.ssoProvider,
            bob.ssoToken,
            bob.ipAddress,
            bob.userAgent,
          );
        assertExists(bobUserId2);
        assertExists(bobSessionId2);
        mockEventBus.emittedEvents = []; // Clear events for fresh checks

        await userAccountConcept.logout(bobSessionId2);

        await assertRejects(
          () => userAccountConcept.validate_session(bobSessionId2),
          SessionNotFoundError, // Assuming logout explicitly marks as not found/invalidates
          "Should reject with SessionNotFoundError after explicit logout.",
        );

        const sessionsCollection = db.collection("sessions");
        const loggedOutSession = await sessionsCollection.findOne({
          _id: sessionIdToObjectId(bobSessionId2),
        });
        assertEquals(
          loggedOutSession?.isValid,
          false,
          "Session should be marked as invalid after logout.",
        );
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "user:loggedOut" &&
            e.payload.userId === bobUserId2 &&
            e.payload.sessionId === bobSessionId2
          ),
          "user:loggedOut event should be emitted for Bob.",
        );

        // 4. Attempt to logout a non-existent/invalid session ID
        console.log("   --> Scenario: Attempting to logout a non-existent session.");
        await assertRejects(
          () => userAccountConcept.logout(fakeSessionIds.nonExistent),
          SessionNotFoundError,
          "Should reject with SessionNotFoundError for non-existent session on logout.",
        );
        console.log("   --> Scenario: Attempting to validate a non-existent session ID.");
        await assertRejects(
            () => userAccountConcept.validate_session(fakeSessionIds.nonExistent),
            SessionNotFoundError,
            "Should reject with SessionNotFoundError for validating non-existent session.",
        );
      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 3: Profile Management
  await t.step(
    "Principle: Profile Management - Avatar editing, bio updates, password changes, view profile",
    async () => {
      const { db, client } = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockSsoService,
          mockEventBus,
          mockUserAccountConfig,
        );

        const charlie = fakeUsers.charlie;
        const frank = fakeUsers.frank; // User with local password (hybrid auth)

        // Initial registration for Charlie (SSO only)
        console.log("   --> Scenario: Initial SSO registration for Charlie.");
        const { userId: charlieUserId } =
          await userAccountConcept.register_or_login(
            charlie.ssoProvider,
            charlie.ssoToken,
            charlie.ipAddress,
            charlie.userAgent,
          );
        assertExists(charlieUserId);
        mockEventBus.emittedEvents = []; // Clear events

        // Initial registration for Frank (SSO + local password hybrid)
        console.log("   --> Scenario: Initial SSO registration for Frank (hybrid auth).");
        const { userId: frankUserId } =
          await userAccountConcept.register_or_login(
            frank.ssoProvider,
            frank.ssoToken,
            frank.ipAddress,
            frank.userAgent,
            frank.initialPassword, // Providing initial password during registration
          );
        assertExists(frankUserId);
        mockEventBus.emittedEvents = []; // Clear events

        const usersCollection = db.collection("users");
        const profilesCollection = db.collection("profiles");

        // 1. Change avatar
        console.log("   --> Scenario: Change avatar for Charlie.");
        await userAccountConcept.change_avatar(
          charlieUserId,
          charlie.newAvatar,
        );
        const charlieUserAfterAvatar = await usersCollection.findOne({
          _id: charlieUserId,
        });
        assertEquals(
          charlieUserAfterAvatar?.avatarUrl,
          charlie.newAvatar,
          "Charlie's avatarUrl should be updated.",
        );
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "user:avatarChanged" &&
            e.payload.userId === charlieUserId &&
            e.payload.newAvatarUrl === charlie.newAvatar
          ),
          "user:avatarChanged event should be emitted for Charlie.",
        );
        mockEventBus.emittedEvents = []; // Clear events

        // 2. Change bio
        console.log("   --> Scenario: Change bio for Charlie.");
        await userAccountConcept.change_bio(charlieUserId, charlie.newBio);
        const charlieProfileAfterBio = await profilesCollection.findOne({
          _id: charlieUserId,
        });
        assertEquals(
          charlieProfileAfterBio?.bio,
          charlie.newBio,
          "Charlie's bio should be updated.",
        );
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "user:bioChanged" &&
            e.payload.userId === charlieUserId &&
            e.payload.newBio === charlie.newBio
          ),
          "user:bioChanged event should be emitted for Charlie.",
        );
        mockEventBus.emittedEvents = []; // Clear events

        // 3. Attempt to change bio with too long string
        console.log("   --> Scenario: Attempt to change bio with too long string.");
        await assertRejects(
          () =>
            userAccountConcept.change_bio(charlieUserId, charlie.longBio),
          BioTooLongError,
          `Should reject with BioTooLongError if bio exceeds ${mockUserAccountConfig.bioMaxLength} characters.`,
        );

        // 4. Change password (for Frank, who has local password)
        console.log("   --> Scenario: Change password for Frank (hybrid user).");
        const frankUserBeforePasswordChange = await usersCollection.findOne({
          _id: frankUserId,
        });
        assertExists(
          frankUserBeforePasswordChange?.passwordHash,
          "Frank should have a password hash initially.",
        );

        await userAccountConcept.change_password(
          frankUserId,
          frank.initialPassword,
          frank.newPassword,
        );
        const frankUserAfterPasswordChange = await usersCollection.findOne({
          _id: frankUserId,
        });
        assertNotEquals(
          frankUserAfterPasswordChange?.passwordHash,
          frankUserBeforePasswordChange?.passwordHash,
          "Frank's passwordHash should be updated after successful change.",
        );
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "user:passwordChanged" &&
            e.payload.userId === frankUserId
          ),
          "user:passwordChanged event should be emitted for Frank.",
        );
        mockEventBus.emittedEvents = []; // Clear events

        // 5. Attempt to change password with wrong current password
        console.log(
          "   --> Scenario: Attempt to change password with wrong current password.",
        );
        await assertRejects(
          () =>
            userAccountConcept.change_password(
              frankUserId,
              frank.wrongPassword,
              frank.newPassword,
            ),
          InvalidCredentialsError,
          "Should reject with InvalidCredentialsError for wrong current password.",
        );

        // 6. Attempt to change password with too short new password
        console.log(
          "   --> Scenario: Attempt to change password with too short new password.",
        );
        await assertRejects(
          () =>
            userAccountConcept.change_password(
              frankUserId,
              frank.newPassword,
              frank.tooShortPassword,
            ),
          PasswordTooShortError,
          `Should reject with PasswordTooShortError if new password is shorter than ${mockUserAccountConfig.passwordMinLength}.`,
        );

        // 7. View profile
        console.log("   --> Scenario: View profile for Charlie.");
        const charlieProfileView = await userAccountConcept.view_profile(
          charlieUserId,
        );
        assertExists(charlieProfileView, "ProfileView should be returned.");
        assertEquals(
          charlieProfileView.userId,
          charlieUserId,
          "ProfileView userId should match.",
        );
        assertEquals(
          charlieProfileView.email,
          charlie.email,
          "ProfileView email should match.",
        );
        assertEquals(
          charlieProfileView.avatarUrl,
          charlie.newAvatar,
          "ProfileView avatarUrl should match updated value.",
        );
        assertEquals(
          charlieProfileView.bio,
          charlie.newBio,
          "ProfileView bio should match updated value.",
        );
        assertExists(
          charlieProfileView.createdAt,
          "ProfileView createdAt should exist.",
        );
        assertExists(
          charlieProfileView.lastLoginAt,
          "ProfileView lastLoginAt should exist.",
        );
        assert(
          Array.isArray(charlieProfileView.listings),
          "ProfileView listings should be an array.",
        );
        assert(
          Array.isArray(charlieProfileView.bids),
          "ProfileView bids should be an array.",
        );
        assert(
          Array.isArray(charlieProfileView.threads),
          "ProfileView threads should be an array.",
        );

        // 8. Attempt profile management for non-existent user
        console.log("   --> Scenario: Profile management operations for a non-existent user.");
        const nonExistentId = new ObjectId().toHexString();
        await assertRejects(
          () =>
            userAccountConcept.change_avatar(
              nonExistentId,
              "https://example.com/non_existent.jpg",
            ),
          UserNotFoundError,
          "Should reject with UserNotFoundError for non-existent user on change_avatar.",
        );
        await assertRejects(
          () => userAccountConcept.change_bio(nonExistentId, "Some bio."),
          UserNotFoundError,
          "Should reject with UserNotFoundError for non-existent user on change_bio.",
        );
        await assertRejects(
          () =>
            userAccountConcept.change_password(
              nonExistentId,
              "old_pass",
              "new_pass",
            ),
          UserNotFoundError,
          "Should reject with UserNotFoundError for non-existent user on change_password.",
        );
        await assertRejects(
          () => userAccountConcept.view_profile(nonExistentId),
          UserNotFoundError,
          "Should reject with UserNotFoundError for non-existent user on view_profile.",
        );
      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 4: Account Lifecycle
  await t.step(
    "Principle: Account Lifecycle - Registration, usage, and deletion",
    async () => {
      const { db, client } = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockSsoService,
          mockEventBus,
          mockUserAccountConfig,
        );

        const diana = fakeUsers.diana;

        // 1. Register a user (Diana)
        console.log("   --> Scenario: Registering Diana's account.");
        const { userId: dianaUserId, sessionId: dianaSessionId } =
          await userAccountConcept.register_or_login(
            diana.ssoProvider,
            diana.ssoToken,
            diana.ipAddress,
            diana.userAgent,
          );
        assertExists(dianaUserId, "Diana's userId should be returned.");
        assertExists(dianaSessionId, "Diana's sessionId should be returned.");

        // Add some initial profile data for Diana (usage simulation)
        await userAccountConcept.change_avatar(
          dianaUserId,
          diana.initialAvatar,
        );
        await userAccountConcept.change_bio(dianaUserId, diana.initialBio);
        mockEventBus.emittedEvents = []; // Clear events before deletion check

        // Verify Diana exists and has profile data
        const usersCollection = db.collection("users");
        const profilesCollection = db.collection("profiles");
        const sessionsCollection = db.collection("sessions");

        let dbDianaUser = await usersCollection.findOne({ _id: dianaUserId });
        let dbDianaProfile = await profilesCollection.findOne({
          _id: dianaUserId,
        });
        let dbDianaSession = await sessionsCollection.findOne({
          _id: sessionIdToObjectId(dianaSessionId),
        });

        assertExists(dbDianaUser, "Diana's user record should exist.");
        assertEquals(
          dbDianaUser?.avatarUrl,
          diana.initialAvatar,
          "Diana's avatarUrl should be set.",
        );
        assertExists(dbDianaProfile, "Diana's profile record should exist.");
        assertEquals(
          dbDianaProfile?.bio,
          diana.initialBio,
          "Diana's bio should be set.",
        );
        assertExists(dbDianaSession, "Diana's session record should exist.");
        assertEquals(dbDianaSession?.isValid, true, "Diana's session should be valid.");

        // 2. Delete Diana's account
        console.log("   --> Scenario: Deleting Diana's account.");
        await userAccountConcept.delete_account(dianaUserId);
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "user:deleted" && e.payload.userId === dianaUserId
          ),
          "user:deleted event should be emitted for Diana.",
        );

        // Verify user, profile, and sessions are permanently removed
        dbDianaUser = await usersCollection.findOne({ _id: dianaUserId });
        dbDianaProfile = await profilesCollection.findOne({
          _id: dianaUserId,
        });
        dbDianaSession = await sessionsCollection.findOne({
          _id: sessionIdToObjectId(dianaSessionId),
        });

        assertEquals(
          dbDianaUser,
          null,
          "Diana's user record should be completely removed from DB.",
        );
        assertEquals(
          dbDianaProfile,
          null,
          "Diana's profile record should be completely removed from DB.",
        );
        assertEquals(
          dbDianaSession,
          null,
          "Diana's active session should be completely removed from DB.",
        );

        // 3. Attempt to interact with deleted account
        console.log("   --> Scenario: Attempting to interact with deleted Diana's account.");
        await assertRejects(
          () => userAccountConcept.view_profile(dianaUserId),
          UserNotFoundError,
          "Should reject with UserNotFoundError for a deleted user on view_profile.",
        );
        await assertRejects(
          () => userAccountConcept.validate_session(dianaSessionId),
          SessionNotFoundError,
          "Should reject with SessionNotFoundError for session of a deleted user.",
        );
        await assertRejects(
          () => userAccountConcept.logout(dianaSessionId),
          SessionNotFoundError,
          "Should reject with SessionNotFoundError for session of a deleted user on logout.",
        );
        await assertRejects(
          () => userAccountConcept.change_bio(dianaUserId, "a new bio"),
          UserNotFoundError,
          "Should reject with UserNotFoundError for a deleted user on change_bio.",
        );

        // 4. Attempt to delete a non-existent user
        console.log("   --> Scenario: Attempting to delete a non-existent user.");
        const nonExistentId = new ObjectId().toHexString();
        await assertRejects(
          () => userAccountConcept.delete_account(nonExistentId),
          UserNotFoundError,
          "Should reject with UserNotFoundError for deleting a non-existent user.",
        );
      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 5: Comprehensive Error Handling
  await t.step(
    "Principle: Error Handling - Invalid SSO tokens, expired sessions, invalid credentials, etc.",
    async () => {
      const { db, client } = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockSsoService,
          mockEventBus,
          mockUserAccountConfig,
        );

        const alice = fakeUsers.alice;
        const charlie = fakeUsers.charlie;
        const frank = fakeUsers.frank;

        // Setup: Register users for various error scenarios
        const { userId: aliceUserId } =
          await userAccountConcept.register_or_login(
            alice.ssoProvider,
            alice.ssoToken,
            alice.ipAddress,
            alice.userAgent,
          );
        const { userId: charlieUserId, sessionId: charlieSessionId } =
          await userAccountConcept.register_or_login(
            charlie.ssoProvider,
            charlie.ssoToken,
            charlie.ipAddress,
            charlie.userAgent,
            charlie.initialPassword,
          );
        const { userId: frankUserId } =
          await userAccountConcept.register_or_login(
            frank.ssoProvider,
            frank.ssoToken,
            frank.ipAddress,
            frank.userAgent,
            frank.initialPassword,
          );

        // --- Test cases for specific error types ---

        console.log("   --> Error Case: AuthenticationFailedError (invalid SSO token).");
        const invalidSsoUser = fakeUsers.invalidSso;
        await assertRejects(
          () =>
            userAccountConcept.register_or_login(
              invalidSsoUser.ssoProvider,
              invalidSsoUser.ssoToken,
              invalidSsoUser.ipAddress,
              invalidSsoUser.userAgent,
            ),
          AuthenticationFailedError,
          "Should throw AuthenticationFailedError for invalid SSO token.",
        );

        console.log("   --> Error Case: SessionNotFoundError (non-existent or malformed session ID).");
        await assertRejects(
          () => userAccountConcept.logout(fakeSessionIds.nonExistent),
          SessionNotFoundError,
          "Should throw SessionNotFoundError for non-existent session on logout.",
        );
        await assertRejects(
          () => userAccountConcept.validate_session(fakeSessionIds.nonExistent),
          SessionNotFoundError,
          "Should throw SessionNotFoundError for non-existent session on validate_session.",
        );
        await assertRejects(
          () => userAccountConcept.validate_session(fakeSessionIds.malformed),
          (e) => e instanceof Error && e.message.includes("Invalid sessionId format"),
          "Should throw an error for malformed session ID.",
        );


        console.log("   --> Error Case: InvalidSessionError (expired session).");
        // Temporarily change config for quick expiration test
        const shortSessionConfig = {
          ...mockUserAccountConfig,
          sessionExpiresInMs: 100,
        };
        const tempUserAccountConcept = new UserAccountConcept(
          db,
          mockSsoService,
          mockEventBus,
          shortSessionConfig,
        );
        const { sessionId: ephemeralSessionId } =
          await tempUserAccountConcept.register_or_login(
            alice.ssoProvider,
            alice.ssoToken,
            alice.ipAddress,
            alice.userAgent,
          );

        await new Promise((resolve) =>
          setTimeout(resolve, shortSessionConfig.sessionExpiresInMs + 50)
        ); // Wait for expiration

        await assertRejects(
          () => tempUserAccountConcept.validate_session(ephemeralSessionId),
          InvalidSessionError,
          "Should throw InvalidSessionError for an expired session.",
        );

        console.log("   --> Error Case: UserNotFoundError.");
        const nonExistentId = new ObjectId().toHexString();
        await assertRejects(
          () =>
            userAccountConcept.change_avatar(
              nonExistentId,
              "https://example.com/missing.jpg",
            ),
          UserNotFoundError,
          "Should throw UserNotFoundError for non-existent user on change_avatar.",
        );
        await assertRejects(
          () => userAccountConcept.view_profile(nonExistentId),
          UserNotFoundError,
          "Should throw UserNotFoundError for non-existent user on view_profile.",
        );
        await assertRejects(
          () =>
            userAccountConcept.change_password(
              nonExistentId,
              "old_pass",
              "new_pass",
            ),
          UserNotFoundError,
          "Should throw UserNotFoundError for non-existent user on change_password.",
        );
        await assertRejects(
          () => userAccountConcept.delete_account(nonExistentId),
          UserNotFoundError,
          "Should throw UserNotFoundError for non-existent user on delete_account.",
        );

        console.log("   --> Error Case: InvalidCredentialsError (wrong current password).");
        await assertRejects(
          () =>
            userAccountConcept.change_password(
              frankUserId,
              frank.wrongPassword,
              frank.newPassword,
            ),
          InvalidCredentialsError,
          "Should throw InvalidCredentialsError for wrong current password.",
        );

        console.log("   --> Error Case: BioTooLongError.");
        await assertRejects(
          () =>
            userAccountConcept.change_bio(aliceUserId, alice.longBio),
          BioTooLongError,
          "Should throw BioTooLongError if bio exceeds max length.",
        );

        console.log("   --> Error Case: PasswordTooShortError.");
        await assertRejects(
          () =>
            userAccountConcept.change_password(
              charlieUserId,
              charlie.initialPassword,
              charlie.tooShortPassword,
            ),
          PasswordTooShortError,
          "Should throw PasswordTooShortError if new password is too short.",
        );

        // --- Note on UsernameTakenError ---
        // `UsernameTakenError` is listed in the error classes, but the `register_or_login` API
        // does not take a `username` parameter directly. If the `UserAccountConcept` implementation
        // attempts to derive a username from SSO data and then checks its uniqueness, this error
        // might be thrown. Alternatively, it might be intended for a `change_username` method
        // not yet specified. For `register_or_login` with SSO, usually the SSO ID (e.g., email)
        // is the primary unique identifier, and display usernames are handled with automatic conflict
        // resolution (e.g., appending numbers) or via a separate update method.
        // If your implementation of `register_or_login` can indeed throw `UsernameTakenError`
        // (e.g., if it uses a username provided by SSO as a primary unique key), a test would look like this:
        /*
        console.log("   --> Error Case: UsernameTakenError (conditional).");
        const dupUser = fakeUsers.duplicateUsernameCandidate;
        // This scenario is highly dependent on how your SSO integration passes/uses a `username` field.
        // As it stands, my mocks don't provide a `username` field from SSO `validateToken` return.
        // If it were, and it clashed with an existing user's username (e.g., Alice's), it might reject.
        // For demonstration, commenting out as specific trigger is unclear from API.
        // await assertRejects(
        //   () =>
        //     userAccountConcept.register_or_login(
        //       dupUser.ssoProvider,
        //       dupUser.ssoToken, // This token would need to resolve to a new ssoId but a conflicting username
        //       dupUser.ipAddress,
        //       dupUser.userAgent,
        //     ),
        //   UsernameTakenError,
        //   "Should throw UsernameTakenError if a unique username cannot be established.",
        // );
        */
      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );

  // Principle 6: Security
  await t.step(
    "Principle: Security - Session validation, account deactivation, unauthorized access, data exposure",
    async () => {
      const { db, client } = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockSsoService,
          mockEventBus,
          mockUserAccountConfig,
        );

        const bob = fakeUsers.bob;
        const charlie = fakeUsers.charlie;

        // Setup: Register users
        const { userId: bobUserId, sessionId: bobSessionId } =
          await userAccountConcept.register_or_login(
            bob.ssoProvider,
            bob.ssoToken,
            bob.ipAddress,
            bob.userAgent,
          );
        assertExists(bobUserId);
        assertExists(bobSessionId);

        const { userId: charlieUserId } =
          await userAccountConcept.register_or_login(
            charlie.ssoProvider,
            charlie.ssoToken,
            charlie.ipAddress,
            charlie.userAgent,
            charlie.initialPassword,
          );
        assertExists(charlieUserId);

        // 1. Session validation ensures only valid sessions return a userId
        console.log("   --> Security: Valid session returns correct userId.");
        const validatedBobId = await userAccountConcept.validate_session(
          bobSessionId,
        );
        assertEquals(
          validatedBobId,
          bobUserId,
          "Valid session should return the correct userId.",
        );

        // 2. Unauthorized access through session IDs (conceptual, as API doesn't use sessionId for action directly)
        // The API methods like `change_avatar(userId, newAvatar)` take `userId` directly, not `sessionId`.
        // This implies that authorization (e.g., checking if the *current* logged-in user is `userId`)
        // is handled at a layer *above* `UserAccountConcept`.
        // `validate_session` itself is a low-level utility to get a `userId` from a `sessionId`.
        // It's not designed to prevent one user from *querying* another's session validity,
        // only to accurately report the session's owner or invalidity.
        // Therefore, security is implicitly covered by correct session validation and explicit ID-based actions.
        console.log("   --> Security: `validate_session` returns accurate user ID or rejects if invalid.");
        await assertRejects(
          () => userAccountConcept.validate_session(fakeSessionIds.nonExistent),
          SessionNotFoundError,
          "Should reject validating a non-existent session.",
        );

        // 3. Account deactivation (deletion) removes all traces
        console.log("   --> Security: Account deletion removes associated data securely.");
        const usersCollection = db.collection("users");
        const profilesCollection = db.collection("profiles");
        const sessionsCollection = db.collection("sessions");

        const grace = fakeUsers.grace;
        const { userId: graceUserId, sessionId: graceSessionId } =
          await userAccountConcept.register_or_login(
            grace.ssoProvider,
            grace.ssoToken,
            grace.ipAddress,
            grace.userAgent,
          );
        await userAccountConcept.change_bio(graceUserId, "Grace's classified research notes.");

        // Before deletion, data should exist
        assertExists(
          await usersCollection.findOne({ _id: graceUserId }),
          "Grace's user record should exist before deletion.",
        );
        assertExists(
          await profilesCollection.findOne({ _id: graceUserId }),
          "Grace's profile record should exist before deletion.",
        );
        assertExists(
          await sessionsCollection.findOne({
            _id: sessionIdToObjectId(graceSessionId),
          }),
          "Grace's session record should exist before deletion.",
        );

        await userAccountConcept.delete_account(graceUserId);

        // After deletion, data should be completely gone
        assertEquals(
          await usersCollection.findOne({ _id: graceUserId }),
          null,
          "Grace's user record should be completely removed after deletion.",
        );
        assertEquals(
          await profilesCollection.findOne({ _id: graceUserId }),
          null,
          "Grace's profile record should be completely removed after deletion.",
        );
        assertEquals(
          await sessionsCollection.findOne({
            _id: sessionIdToObjectId(graceSessionId),
          }),
          null,
          "Grace's session record should be completely removed after deletion.",
        );

        // 4. Sensitive data (e.g., password hashes) are not exposed
        console.log("   --> Security: Password hashes are not exposed in public views.");
        const dbCharlieUser = await usersCollection.findOne({
          _id: charlieUserId,
        });
        assertExists(
          dbCharlieUser?.passwordHash,
          "Charlie should have a password hash stored.",
        );
        assertEquals(
          dbCharlieUser?.passwordHash.length > 0,
          true,
          "Password hash should be a non-empty string.",
        );

        const charlieProfileView = await userAccountConcept.view_profile(
          charlieUserId,
        );
        assert(
          !("passwordHash" in charlieProfileView),
          "ProfileView should not contain passwordHash directly.",
        );
        // Assuming ProfileView includes a `user` object directly or flattens it
        if ("user" in charlieProfileView && typeof charlieProfileView.user === "object") {
             assert(
                !("passwordHash" in (charlieProfileView as any).user),
                "User object within ProfileView should not contain passwordHash.",
            );
        }
      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );
});
```

***

## 4. `src/concepts/UserAccount/UserAccountErrors.ts` (Placeholder for completeness)

This file should contain your custom error classes. Ensure it matches what your `UserAccountConcept` implementation throws.

```typescript
// src/concepts/UserAccount/UserAccountErrors.ts
// These would typically extend a base error class or Deno's native Error.

export class UserAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserAccountError";
  }
}

export class AuthenticationFailedError extends UserAccountError {
  constructor(message: string = "Authentication failed.") {
    super(message);
    this.name = "AuthenticationFailedError";
  }
}

export class SessionNotFoundError extends UserAccountError {
  constructor(message: string = "Session not found or invalid.") {
    super(message);
    this.name = "SessionNotFoundError";
  }
}

export class InvalidSessionError extends UserAccountError {
  constructor(message: string = "Session is invalid or expired.") {
    super(message);
    this.name = "InvalidSessionError";
  }
}

export class UsernameTakenError extends UserAccountError {
  constructor(message: string = "Username is already taken.") {
    super(message);
    this.name = "UsernameTakenError";
  }
}

export class UserNotFoundError extends UserAccountError {
  constructor(message: string = "User not found.") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export class InvalidCredentialsError extends UserAccountError {
  constructor(message: string = "Invalid credentials.") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

export class BioTooLongError extends UserAccountError {
  constructor(message: string = "Bio exceeds maximum allowed length.") {
    super(message);
    this.name = "BioTooLongError";
  }
}

export class PasswordTooShortError extends UserAccountError {
  constructor(message: string = "Password is too short.") {
    super(message);
    this.name = "PasswordTooShortError";
  }
}
```

***

## Test Data Usage

The `fake-data.ts` exports `fakeSsoMappings` and `fakeUsers`, which are imported into `UserAccountConcept.test.ts`.

* `fakeSsoMappings` is passed to the `MockSSOValidationService` constructor, allowing it to simulate valid and invalid SSO token validations.
* `fakeUsers` provides pre-defined user details (email, SSO provider/token, IP, user agent, new avatar/bio/password data) for different scenarios. These objects are accessed within each test principle to retrieve the necessary input parameters for `UserAccountConcept` methods.
* `fakeSessionIds` provides example non-existent or malformed session IDs for error handling tests.

## Cleanup Strategy

Each `t.step` (representing a test principle) ensures a clean state by:

1. **Database Isolation:** Calling `await testDb()` at the beginning of each step. This function (assumed to be from `src/utils/database.ts`) should connect to a *new, unique* test database for that specific step.
2. **Resource Release:** Using a `try/finally` block within each `t.step`.
   * `await db.dropDatabase()`: This command ensures that all collections and data created during the test step are completely removed from the MongoDB instance.
   * `await client.close()`: This closes the MongoDB client connection, releasing database resources.

This robust cleanup guarantees that tests are independent and do not interfere with each other, providing reliable and reproducible results.
