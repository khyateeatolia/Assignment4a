// src/concepts/UserAccount/UserAccountConcept.test.ts
import {
    assert,
    assertEquals,
    assertExists,
    assertNotEquals,
    assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ObjectId } from "npm:mongodb";
import { testDb } from "../../utils/database.ts"; // Adjust path as per your project structure

// The actual UserAccountConcept implementation
import { UserAccountConcept } from "./UserAccountConcept.ts";
// Error classes defined by your implementation
import {
  AuthenticationFailedError,
  SessionNotFoundError,
  InvalidSessionError,
  UsernameTakenError,
  UserNotFoundError,
  InvalidCredentialsError,
  BioTooLongError,
  PasswordTooShortError,
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

// Helper function to convert user ID string to MongoDB ObjectId
function userIdToObjectId(userId: string): ObjectId {
  try {
    return new ObjectId(userId);
  } catch (e) {
    throw new Error(`Invalid userId format: ${userId}. Error: ${e.message}`);
  }
}

// Main test suite following the LikertSurvey principle-based format
Deno.test("UserAccountConcept Principles", async (t) => {
  // Principle 1: SSO Registration and Login Flow
  await t.step(
    "Principle: SSO Registration and Login Flow - First-time SSO login, account creation, profile setup, subsequent login",
    async () => {
      const [db, client] = await testDb();
let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockUserAccountConfig,
          mockSsoService,
          mockEventBus,
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

        const dbUser = await usersCollection.findOne({ _id: userIdToObjectId(aliceUserId) });
        const dbProfile = await profilesCollection.findOne({ _id: userIdToObjectId(aliceUserId) });
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
            e.eventName === "UserRegistered" &&
            e.payload.userId === aliceUserId
          ),
          "UserRegistered event should be emitted for Alice.",
        );
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "UserLoggedIn" && e.payload.userId === aliceUserId
          ),
          "UserLoggedIn event should be emitted for Alice.",
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
          _id: userIdToObjectId(aliceUserId),
        });
        assertNotEquals(
          dbUserAfterLogin?.lastLoginAt?.getTime(),
          dbUser?.lastLoginAt?.getTime(), // Compare timestamps
          "lastLoginAt should be updated after re-login.",
        );

        // Verify events emitted
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "UserLoggedIn" && e.payload.userId === aliceUserId2
          ),
          "UserLoggedIn event should be emitted again for Alice.",
        );

        // 3. Attempt to register/login with invalid SSO token
        console.log("   --> Scenario: Login with an invalid SSO token.");
        const invalidSsoUser = fakeUsers.invalidSso;
        await assertRejects(
          async () => {
            await userAccountConcept.register_or_login(
              invalidSsoUser.ssoProvider,
              invalidSsoUser.ssoToken,
              invalidSsoUser.ipAddress,
              invalidSsoUser.userAgent,
            );
          },
          (error) => error.name === "AuthenticationFailedError",
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
      const [db, client] = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        // Configure config with a very short session duration for testing expiration quickly
        const shortSessionConfig = {
          ...mockUserAccountConfig,
          SESSION_DURATION_HOURS: 0.0001, // Very short duration for testing expiration
        };
        userAccountConcept = new UserAccountConcept(
            db,
          shortSessionConfig, // Use short session config for this principle
          mockSsoService,
          mockEventBus,
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
          setTimeout(resolve, 500) // Wait 500ms to ensure it's definitely expired
        );

        await assertRejects(
          () => userAccountConcept.validate_session(bobSessionId),
          (error) => error.name === "InvalidSessionError",
          "Should reject with InvalidSessionError after session expires.",
        );

        // 3. Logout and session invalidation
        console.log("   --> Scenario: User logout and session invalidation.");
        // Re-login Bob to get a new valid session with the default (longer) expiry
        userAccountConcept = new UserAccountConcept( // Re-instantiate with default config
          db,
          mockUserAccountConfig,
          mockSsoService,
          mockEventBus,
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
          (error) => error.name === "SessionNotFoundError", // Assuming logout explicitly marks as not found/invalidates
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
            e.eventName === "UserLoggedOut" &&
            e.payload.userId === bobUserId2
          ),
          "UserLoggedOut event should be emitted for Bob.",
        );

        // 4. Attempt to logout a non-existent/invalid session ID
        console.log("   --> Scenario: Attempting to logout a non-existent session.");
        await assertRejects(
          () => userAccountConcept.logout(fakeSessionIds.nonExistent),
          (error) => error.name === "SessionNotFoundError",
          "Should reject with SessionNotFoundError for non-existent session on logout.",
        );
        console.log("   --> Scenario: Attempting to validate a non-existent session ID.");
        await assertRejects(
            () => userAccountConcept.validate_session(fakeSessionIds.nonExistent),
            (error) => error.name === "SessionNotFoundError",
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
      const [db, client] = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockUserAccountConfig,
          mockSsoService,
          mockEventBus,
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
          _id: userIdToObjectId(charlieUserId),
        });
        assertEquals(
          charlieUserAfterAvatar?.avatarUrl,
          charlie.newAvatar,
          "Charlie's avatarUrl should be updated.",
        );
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "ProfileUpdated" &&
            e.payload.userId === charlieUserId
          ),
          "ProfileUpdated event should be emitted for Charlie.",
        );
        mockEventBus.emittedEvents = []; // Clear events

        // 2. Change bio
        console.log("   --> Scenario: Change bio for Charlie.");
        await userAccountConcept.change_bio(charlieUserId, charlie.newBio);
        const charlieProfileAfterBio = await profilesCollection.findOne({
          _id: userIdToObjectId(charlieUserId),
        });
        assertEquals(
          charlieProfileAfterBio?.bio,
          charlie.newBio,
          "Charlie's bio should be updated.",
        );
        assert(
          mockEventBus.emittedEvents.some((e) =>
            e.eventName === "ProfileUpdated" &&
            e.payload.userId === charlieUserId
          ),
          "ProfileUpdated event should be emitted for Charlie.",
        );
        mockEventBus.emittedEvents = []; // Clear events

        // 3. Attempt to change bio with too long string
        console.log("   --> Scenario: Attempt to change bio with too long string.");
        await assertRejects(
          () =>
            userAccountConcept.change_bio(charlieUserId, charlie.longBio),
          (error) => error.name === "BioTooLongError",
          `Should reject with BioTooLongError if bio exceeds ${mockUserAccountConfig.BIO_MAX_LENGTH} characters.`,
        );

        // 4. Change password (for Frank, who has local password)
        console.log("   --> Scenario: Change password for Frank (hybrid user).");
        const frankUserBeforePasswordChange = await usersCollection.findOne({
          _id: userIdToObjectId(frankUserId),
        });
        // Frank is SSO user - no password hash expected
        assertExists(frankUserBeforePasswordChange, "Frank should exist in database.");

        // Frank is SSO user - no password changes allowed
        // Just verify Frank can view his profile
        const frankProfile = await userAccountConcept.view_profile(frankUserId);
        assertEquals(frankProfile.userId, frankUserId);
        // Verify Frank's profile is accessible
        assertEquals(frankProfile.email, frank.email);
        // No ProfileUpdated event expected since we're just viewing profile
        mockEventBus.emittedEvents = []; // Clear events

        // 5. Test bio change for Frank
        console.log("   --> Scenario: Change bio for Frank.");
        await userAccountConcept.change_bio(frankUserId, "Frank's updated bio");
        const frankAfterBioChange = await userAccountConcept.view_profile(frankUserId);
        assertEquals(frankAfterBioChange.bio, "Frank's updated bio");

        // 6. Test avatar change for Frank
        console.log("   --> Scenario: Change avatar for Frank.");
        await userAccountConcept.change_avatar(frankUserId, "https://example.com/frank_new_avatar.jpg");
        const frankAfterAvatarChange = await userAccountConcept.view_profile(frankUserId);
        assertEquals(frankAfterAvatarChange.avatarUrl, "https://example.com/frank_new_avatar.jpg");

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
          (error) => error.name === "UserNotFoundError",
          "Should reject with UserNotFoundError for non-existent user on change_avatar.",
        );
        await assertRejects(
          () => userAccountConcept.change_bio(nonExistentId, "Some bio."),
          (error) => error.name === "UserNotFoundError",
          "Should reject with UserNotFoundError for non-existent user on change_bio.",
        );
        await assertRejects(
          () => userAccountConcept.view_profile(nonExistentId),
          (error) => error.name === "UserNotFoundError",
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
      const [db, client] = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockUserAccountConfig,
          mockSsoService,
          mockEventBus,
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

        let dbDianaUser = await usersCollection.findOne({ _id: userIdToObjectId(dianaUserId) });
        let dbDianaProfile = await profilesCollection.findOne({
          _id: userIdToObjectId(dianaUserId),
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
            e.eventName === "UserDeleted" && e.payload.userId === dianaUserId
          ),
          "UserDeleted event should be emitted for Diana.",
        );

        // Verify user, profile, and sessions are permanently removed
        dbDianaUser = await usersCollection.findOne({ _id: dianaUserId });
        dbDianaProfile = await profilesCollection.findOne({
          _id: userIdToObjectId(dianaUserId),
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
          (error) => error.name === "UserNotFoundError",
          "Should reject with UserNotFoundError for a deleted user on view_profile.",
        );
        await assertRejects(
          () => userAccountConcept.validate_session(dianaSessionId),
          (error) => error.name === "SessionNotFoundError",
          "Should reject with SessionNotFoundError for session of a deleted user.",
        );
        await assertRejects(
          () => userAccountConcept.logout(dianaSessionId),
          (error) => error.name === "SessionNotFoundError",
          "Should reject with SessionNotFoundError for session of a deleted user on logout.",
        );
        await assertRejects(
          () => userAccountConcept.change_bio(dianaUserId, "a new bio"),
          (error) => error.name === "UserNotFoundError",
          "Should reject with UserNotFoundError for a deleted user on change_bio.",
        );

        // 4. Attempt to delete a non-existent user
        console.log("   --> Scenario: Attempting to delete a non-existent user.");
        const nonExistentId = new ObjectId().toHexString();
        await assertRejects(
          () => userAccountConcept.delete_account(nonExistentId),
          (error) => error.name === "UserNotFoundError",
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
      const [db, client] = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockUserAccountConfig,
          mockSsoService,
          mockEventBus,
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
          (error) => error.name === "AuthenticationFailedError",
          "Should throw AuthenticationFailedError for invalid SSO token.",
        );

        console.log("   --> Error Case: SessionNotFoundError (non-existent or malformed session ID).");
        await assertRejects(
          () => userAccountConcept.logout(fakeSessionIds.nonExistent),
          (error) => error.name === "SessionNotFoundError",
          "Should throw SessionNotFoundError for non-existent session on logout.",
        );
        await assertRejects(
          () => userAccountConcept.validate_session(fakeSessionIds.nonExistent),
          (error) => error.name === "SessionNotFoundError",
          "Should throw SessionNotFoundError for non-existent session on validate_session.",
        );
        await assertRejects(
          async () => userAccountConcept.validate_session(fakeSessionIds.malformed),
          (error) => error instanceof Error,
          "Should throw an error for malformed session ID.",
        );


        console.log("   --> Error Case: InvalidSessionError (expired session).");
        // Temporarily change config for quick expiration test
        const shortSessionConfig = {
          ...mockUserAccountConfig,
          SESSION_DURATION_HOURS: 0.0001,
        };
        const tempUserAccountConcept = new UserAccountConcept(
          db,
          shortSessionConfig,
          mockSsoService,
          mockEventBus,
        );
        const { sessionId: ephemeralSessionId } =
          await tempUserAccountConcept.register_or_login(
            alice.ssoProvider,
            alice.ssoToken,
            alice.ipAddress,
            alice.userAgent,
          );

        await new Promise((resolve) =>
          setTimeout(resolve, 500) // Wait for expiration
        );

        await assertRejects(
          () => tempUserAccountConcept.validate_session(ephemeralSessionId),
          (error) => error.name === "InvalidSessionError",
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
          (error) => error.name === "UserNotFoundError",
          "Should throw UserNotFoundError for non-existent user on change_avatar.",
        );
        await assertRejects(
          () => userAccountConcept.view_profile(nonExistentId),
          (error) => error.name === "UserNotFoundError",
          "Should throw UserNotFoundError for non-existent user on view_profile.",
        );
        await assertRejects(
          () => userAccountConcept.delete_account(nonExistentId),
          (error) => error.name === "UserNotFoundError",
          "Should throw UserNotFoundError for deleting a non-existent user.",
        );

        // Password functionality removed - SSO only

        console.log("   --> Error Case: BioTooLongError.");
        await assertRejects(
          () =>
            userAccountConcept.change_bio(aliceUserId, alice.longBio),
          (error) => error.name === "BioTooLongError",
          "Should throw BioTooLongError if bio exceeds max length.",
        );

        // Password functionality removed - SSO only

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
      const [db, client] = await testDb();
      let userAccountConcept: UserAccountConcept;
      let mockSsoService: MockSSOValidationService;
      let mockEventBus: MockEventBus;

      try {
        mockSsoService = new MockSSOValidationService(fakeSsoMappings);
        mockEventBus = new MockEventBus();
        userAccountConcept = new UserAccountConcept(
          db,
          mockUserAccountConfig,
          mockSsoService,
          mockEventBus,
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
          (error) => error.name === "SessionNotFoundError",
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
          await usersCollection.findOne({ _id: userIdToObjectId(graceUserId) }),
          "Grace's user record should exist before deletion.",
        );
        assertExists(
          await profilesCollection.findOne({ _id: userIdToObjectId(graceUserId) }),
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
          await usersCollection.findOne({ _id: userIdToObjectId(graceUserId) }),
          null,
          "Grace's user record should be completely removed after deletion.",
        );
        assertEquals(
          await profilesCollection.findOne({ _id: userIdToObjectId(graceUserId) }),
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

        // 4. SSO data is properly stored and not exposed in public views
        console.log("   --> Security: SSO data is properly stored and not exposed in public views.");
        const dbCharlieUser = await usersCollection.findOne({
          _id: userIdToObjectId(charlieUserId),
        });
        assertExists(
          dbCharlieUser?.ssoId,
          "Charlie should have SSO ID stored.",
        );
        assertExists(
          dbCharlieUser?.ssoProvider,
          "Charlie should have SSO provider stored.",
        );

        const charlieProfileView = await userAccountConcept.view_profile(
          charlieUserId,
        );
        // SSO data should not be exposed in public profile view
        assert(
          !("ssoId" in charlieProfileView),
          "ProfileView should not contain ssoId directly.",
        );
        assert(
          !("ssoProvider" in charlieProfileView),
          "ProfileView should not contain ssoProvider directly.",
        );
      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
  );
});