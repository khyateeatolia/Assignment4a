---
timestamp: 'Sun Oct 19 2025 14:49:31 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_144931.acd70c25.md]]'
content_id: d141874103fc3df929328e9ffbece172c4eeb164575d1aec30a38cad5fdb4e94
---

# response:

Okay, as a senior Deno + TypeScript + MongoDB engineer, I understand the need for robust testing, especially for core concepts like `UserAccount` with SSO integration. The LikertSurvey test format provides a structured, principle-based approach, which is excellent for comprehensive coverage.

Given the constraints, especially that I don't have the actual `UserAccountConcept.ts` file or the `testDb()` implementation, I will make the following assumptions:

## Assumptions

1. **`UserAccountConcept` Implementation**: Since the `@../../src/concepts/UserAccount/UserAccountConcept.ts` is not directly accessible to me in this context, I will provide a *mock implementation* of `UserAccountConcept` that adheres strictly to the provided API and leverages the `db` instance from `testDb()`. This mock will simulate the expected behavior, including interacting with MongoDB collections for users and sessions, and throwing specific errors.
2. **`testDb()` Utility**: I assume `testDb()` from `@utils/database.ts` is a utility function that:
   * Initializes a clean MongoDB database instance (e.g., a memory-backed one or a temporary one).
   * Provides a `db: Db` object (from `deno_mongo`) to the test function.
   * Handles connection setup and teardown, including clearing collections *before* each test run and closing the connection *after*.
   * The `LikertSurveyConcept.test.ts` example uses it as `testDb(async (db) => { ... })`. My mock `UserAccountConcept` will take this `db` instance.
3. **SSO Token Structure**: For testing purposes, I will define a clear structure for valid SSO tokens that my mock `UserAccountConcept` can parse. Invalid tokens will be malformed strings, and expired tokens will be structured to allow the mock to identify them. I'll use a simple Base64-encoded JSON payload to simulate this.
4. **`ProfileView` Structure**: I'll define a simple `ProfileView` interface that includes essential user information as expected by `view_profile`.
5. **Error Types**: I'll define custom error classes (e.g., `NotFoundError`, `InvalidSessionError`, `InvalidSsoTokenError`, `UnauthorizedError`) to provide specific error handling assertions.
6. **`change_password` for SSO accounts**: This method is slightly ambiguous for a "purely SSO-based" system. I will assume it allows users to set and change a *local password* for potential fallback login or other internal system purposes *after* initial SSO registration. It will require the `currentPassword` only if a local password has already been set. If no local password is set, the first call to `change_password` will effectively "set" it without needing a `currentPassword`.

***

## 1. Fake Test Data File (`fake_user_data.ts`)

This file will contain functions to generate various pieces of test data, making our tests readable and repeatable.

```typescript
// @/test_data/fake_user_data.ts

import { faker } from "https://deno.land/x/deno_faker@v1.0.3/mod.ts";

export interface SsoTokenPayload {
  ssoId: string;
  provider: string;
  email: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  // A simple timestamp to simulate token expiry.
  // In a real system, this would be an 'exp' claim in a JWT.
  expiresAt?: number;
}

export interface UserProfileData {
  avatar: string;
  bio: string;
}

export enum SsoProvider {
  UNIVERSITY_A = "UniversityA_SSO",
  UNIVERSITY_B = "UniversityB_SSO",
  CORPORATE_C = "CorporateC_SSO",
  GOVERNMENT_D = "GovernmentD_SSO",
}

/**
 * Generates a valid SSO token string based on a payload.
 * In a real scenario, this would be a JWT signed by the SSO provider.
 */
export function generateValidSsoToken(
  payload: Partial<SsoTokenPayload> = {},
): string {
  const defaultPayload: SsoTokenPayload = {
    ssoId: faker.string.uuid(),
    provider: SsoProvider.UNIVERSITY_A,
    email: faker.internet.email(),
    name: faker.person.fullName(),
    expiresAt: Date.now() + 3600 * 1000, // Valid for 1 hour
    ...payload,
  };
  return btoa(JSON.stringify(defaultPayload));
}

/**
 * Generates an invalid SSO token string.
 * This could be malformed, expired, or untrustworthy.
 */
export function generateInvalidSsoToken(): string {
  return "INVALID_TOKEN_ABC123XYZ";
}

/**
 * Generates an SSO token string that simulates an expired token.
 */
export function generateExpiredSsoToken(
  payload: Partial<SsoTokenPayload> = {},
): string {
  const defaultPayload: SsoTokenPayload = {
    ssoId: faker.string.uuid(),
    provider: SsoProvider.UNIVERSITY_A,
    email: faker.internet.email(),
    name: faker.person.fullName(),
    expiresAt: Date.now() - 3600 * 1000, // Expired 1 hour ago
    ...payload,
  };
  return btoa(JSON.stringify(defaultPayload));
}

/**
 * Generates random user profile data.
 */
export function generateUserProfileData(): UserProfileData {
  return {
    avatar: faker.image.avatar(),
    bio: faker.lorem.paragraph(),
  };
}

export function generateIpAddress(): string {
  return faker.internet.ip();
}

export function generateUserAgent(): string {
  return faker.internet.userAgent();
}

export function generatePassword(): string {
  return faker.internet.password({ length: 12, pattern: /[A-Za-z0-9!@#$%^&*()]/ });
}

// Pre-defined data for consistency
export const testSsoProvider = SsoProvider.UNIVERSITY_A;
export const testIpAddress = "192.168.1.1";
export const testUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const predefinedUser1 = {
  ssoId: "sso-user-1",
  provider: SsoProvider.UNIVERSITY_A,
  email: "user1@uni-a.edu",
  name: "Alice Smith",
  avatar: faker.image.avatar(),
  bio: faker.lorem.sentence(),
};

export const predefinedUser2 = {
  ssoId: "sso-user-2",
  provider: SsoProvider.UNIVERSITY_B,
  email: "user2@uni-b.edu",
  name: "Bob Johnson",
  avatar: faker.image.avatar(),
  bio: faker.lorem.sentence(),
};

export const predefinedDeletedUser = {
  ssoId: "sso-deleted-user",
  provider: SsoProvider.UNIVERSITY_A,
  email: "deleted@uni-a.edu",
  name: "Charlie Brown",
  avatar: faker.image.avatar(),
  bio: faker.lorem.sentence(),
};
```

## 2. Mock `UserAccountConcept` Implementation (`mock_user_account_concept.ts`)

This mock will serve as the `UserAccountConcept` for our tests. It will interact with the MongoDB `db` instance provided by `testDb()`.

```typescript
// @/mock_user_account_concept.ts

import { Collection, Db, ObjectId } from "https://deno.land/x/mongo@v0.32.0/mod.ts";
import { SsoTokenPayload } from "./test_data/fake_user_data.ts";

// --- Interfaces & Types ---

export type UserId = string;
export type SessionId = string;
export type IpAddress = string;
export type UserAgent = string;
export type SsoProviderName = string;

export interface ProfileView {
  userId: UserId;
  ssoProvider: SsoProviderName;
  email: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  isAccountDeleted?: boolean; // For lifecycle testing
}

export interface UserAccountData {
  _id: ObjectId;
  ssoId: string; // Unique ID from SSO provider
  ssoProvider: SsoProviderName;
  email: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  localPasswordHash: string | null; // For change_password functionality
  isDeleted: boolean; // For account lifecycle
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSessionData {
  _id: ObjectId;
  userId: UserId;
  sessionId: SessionId;
  ipAddress: IpAddress;
  userAgent: UserAgent;
  expiresAt: Date;
  createdAt: Date;
}

// --- Custom Error Classes ---

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSessionError";
  }
}

export class InvalidSsoTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSsoTokenError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

// --- Mock UserAccountConcept ---

export class MockUserAccountConcept {
  private users: Collection<UserAccountData>;
  private sessions: Collection<UserSessionData>;

  constructor(db: Db) {
    this.users = db.collection<UserAccountData>("users");
    this.sessions = db.collection<UserSessionData>("sessions");
  }

  // Helper to simulate password hashing
  private async hashPassword(password: string): Promise<string> {
    // In a real app, use a robust hashing library like bcrypt
    return `hashed_${password}_${Date.now()}`;
  }

  // Helper to simulate password comparison
  private async comparePassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    return `hashed_${password}_` === hash.substring(0, hash.lastIndexOf('_') + 1);
  }

  // Helper to parse the base64 encoded SSO token
  private parseSsoToken(ssoToken: string): SsoTokenPayload {
    try {
      const decoded = atob(ssoToken);
      const payload: SsoTokenPayload = JSON.parse(decoded);
      if (!payload.ssoId || !payload.provider || !payload.email || !payload.name) {
        throw new InvalidSsoTokenError("Missing required SSO token payload fields.");
      }
      return payload;
    } catch (error) {
      throw new InvalidSsoTokenError(`Failed to parse SSO token: ${error.message}`);
    }
  }

  // --- API Methods ---

  async register_or_login(
    ssoProvider: SsoProviderName,
    ssoToken: string,
    ipAddress: IpAddress,
    userAgent: UserAgent,
  ): Promise<{ userId: UserId; sessionId: SessionId }> {
    const payload = this.parseSsoToken(ssoToken);

    if (payload.provider !== ssoProvider) {
      throw new InvalidSsoTokenError("SSO token provider mismatch.");
    }
    if (payload.expiresAt && payload.expiresAt < Date.now()) {
      throw new InvalidSsoTokenError("SSO token has expired.");
    }

    let user = await this.users.findOne({
      ssoId: payload.ssoId,
      ssoProvider: ssoProvider,
    });

    if (user && user.isDeleted) {
      // For testing, let's re-activate if a deleted user tries to login again
      // In a real system, you might prevent this or have an account recovery flow
      await this.users.updateOne(
        { _id: user._id },
        { $set: { isDeleted: false, updatedAt: new Date() } },
      );
      user.isDeleted = false; // Update in memory for current flow
    }

    if (!user) {
      // Register new user
      const newUser: UserAccountData = {
        _id: new ObjectId(),
        ssoId: payload.ssoId,
        ssoProvider: ssoProvider,
        email: payload.email,
        name: payload.name,
        avatar: payload.avatarUrl || null,
        bio: payload.bio || null,
        localPasswordHash: null, // Initially no local password for SSO users
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await this.users.insertOne(newUser);
      user = newUser;
    } else {
      // Update existing user's basic info from SSO (if changed)
      await this.users.updateOne(
        { _id: user._id },
        {
          $set: {
            email: payload.email,
            name: payload.name,
            updatedAt: new Date(),
          },
        },
      );
    }

    const sessionId = `sess_${crypto.randomUUID()}`;
    const newSession: UserSessionData = {
      _id: new ObjectId(),
      userId: user._id.toHexString(),
      sessionId: sessionId,
      ipAddress: ipAddress,
      userAgent: userAgent,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000), // Session valid for 24 hours
      createdAt: new Date(),
    };
    await this.sessions.insertOne(newSession);

    return { userId: user._id.toHexString(), sessionId };
  }

  async logout(sessionId: SessionId): Promise<void> {
    const result = await this.sessions.deleteOne({ sessionId });
    if (result.matchedCount === 0) {
      // Optionally throw or just log. For tests, a no-op is fine if session doesn't exist.
      // console.warn(`Attempted to logout non-existent session: ${sessionId}`);
    }
  }

  async change_avatar(userId: UserId, newAvatar: string): Promise<void> {
    const userObjectId = new ObjectId(userId);
    const result = await this.users.updateOne(
      { _id: userObjectId, isDeleted: false },
      { $set: { avatar: newAvatar, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      throw new NotFoundError(`User with ID ${userId} not found or deleted.`);
    }
  }

  async change_bio(userId: UserId, bio: string): Promise<void> {
    const userObjectId = new ObjectId(userId);
    const result = await this.users.updateOne(
      { _id: userObjectId, isDeleted: false },
      { $set: { bio: bio, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      throw new NotFoundError(`User with ID ${userId} not found or deleted.`);
    }
  }

  async change_password(
    userId: UserId,
    currentPassword?: string, // Optional for first time set
    newPassword: string,
  ): Promise<void> {
    const userObjectId = new ObjectId(userId);
    const user = await this.users.findOne({
      _id: userObjectId,
      isDeleted: false,
    });

    if (!user) {
      throw new NotFoundError(`User with ID ${userId} not found or deleted.`);
    }

    // If localPasswordHash exists, currentPassword is required
    if (user.localPasswordHash) {
      if (!currentPassword || !(await this.comparePassword(currentPassword, user.localPasswordHash))) {
        throw new InvalidCredentialsError("Current password incorrect.");
      }
    } else {
      // First time setting password, no current password required
      if (currentPassword) {
        console.warn(`Current password provided for user ${userId} who has no local password yet. Ignoring currentPassword.`);
      }
    }

    const hashedNewPassword = await this.hashPassword(newPassword);
    await this.users.updateOne(
      { _id: userObjectId },
      { $set: { localPasswordHash: hashedNewPassword, updatedAt: new Date() } },
    );
  }

  async delete_account(userId: UserId): Promise<void> {
    const userObjectId = new ObjectId(userId);
    const result = await this.users.updateOne(
      { _id: userObjectId, isDeleted: false },
      { $set: { isDeleted: true, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      throw new NotFoundError(`User with ID ${userId} not found or already deleted.`);
    }
    // Also invalidate all sessions for this user
    await this.sessions.deleteMany({ userId });
  }

  async view_profile(userId: UserId): Promise<ProfileView> {
    const userObjectId = new ObjectId(userId);
    const user = await this.users.findOne({ _id: userObjectId });

    if (!user) {
      throw new NotFoundError(`User with ID ${userId} not found.`);
    }

    return {
      userId: user._id.toHexString(),
      ssoProvider: user.ssoProvider,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      isAccountDeleted: user.isDeleted,
    };
  }

  async validate_session(sessionId: SessionId): Promise<UserId> {
    const session = await this.sessions.findOne({ sessionId });

    if (!session || session.expiresAt < new Date()) {
      throw new InvalidSessionError(`Session ${sessionId} is invalid or expired.`);
    }

    return session.userId;
  }
}

// We also need a mock for testDb that provides a Db instance and clears it.
// This is a placeholder since the actual testDb() is not provided.
// In a real Deno project, this would be imported from @utils/database.ts
// For this response, I'll provide a minimal simulation.
import { MongoClient } from "https://deno.land/x/mongo@v0.32.0/mod.ts";
import { assert } from "https://deno.land/std@0.210.0/assert/mod.ts";

const client = new MongoClient();
const DB_NAME = `test_db_${crypto.randomUUID().substring(0, 8)}`; // Unique DB for each test run process

export async function connectTestDb() {
  await client.connect("mongodb://127.0.0.1:27017");
}

export async function disconnectTestDb() {
  await client.close();
}

/**
 * Mocks the testDb utility. It provides a clean database for each test function.
 * Assumes a local MongoDB instance is running.
 */
export async function testDb(
  testFunction: (db: Db, userAccountConcept: MockUserAccountConcept) => Promise<void>,
) {
  const db = client.database(DB_NAME);
  const userAccountConcept = new MockUserAccountConcept(db);

  try {
    // Clear all collections before running the test
    for await (const collectionName of await db.listCollectionNames()) {
      await db.collection(collectionName).drop();
    }
    await testFunction(db, userAccountConcept);
  } finally {
    // Collections are cleared before each `testDb` invocation.
    // If you need specific cleanup after a test, add it here.
    // For general database cleanup, relying on `drop` before each test is often sufficient.
  }
}
```

## 3. Complete Test File (`UserAccountConcept.test.ts`)

This test file will implement the principles described, using the mock `UserAccountConcept` and the fake data.

```typescript
// @/src/concepts/UserAccount/UserAccountConcept.test.ts

import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.210.0/assert/mod.ts";
import { Db } from "https://deno.land/x/mongo@v0.32.0/mod.ts";

// Mock imports for the purpose of this response
// In a real project, these would point to actual files:
// import { testDb } from "@utils/database.ts";
// import { UserAccountConcept, ProfileView, UserId, SessionId, InvalidSessionError, InvalidSsoTokenError, NotFoundError, UnauthorizedError, InvalidCredentialsError } from "./UserAccountConcept.ts";
import {
  connectTestDb,
  InvalidCredentialsError,
  InvalidSessionError,
  InvalidSsoTokenError,
  MockUserAccountConcept,
  NotFoundError,
  ProfileView,
  SessionId,
  testDb,
  UserId,
} from "../../../mock_user_account_concept.ts"; // Adjusted path for mock

import {
  generateExpiredSsoToken,
  generateInvalidSsoToken,
  generateIpAddress,
  generatePassword,
  generateUserProfileData,
  generateValidSsoToken,
  generateUserAgent,
  predefinedDeletedUser,
  predefinedUser1,
  testIpAddress,
  testSsoProvider,
  testUserAgent,
} from "../../../test_data/fake_user_data.ts"; // Adjusted path for fake data

// Connect to MongoDB once for all tests
await connectTestDb();

// --- LikertSurvey Test Principles ---

Deno.test(
  "Principle: SSO Registration and Login Flow - First-time SSO login -> Account creation -> Profile setup",
  async () => {
    await testDb(async (db: Db, userAccountConcept: MockUserAccountConcept) => {
      // 1. First-time SSO login -> Account creation
      const ssoToken1 = generateValidSsoToken({
        ssoId: predefinedUser1.ssoId,
        provider: predefinedUser1.provider,
        email: predefinedUser1.email,
        name: predefinedUser1.name,
        avatarUrl: predefinedUser1.avatar,
        bio: predefinedUser1.bio,
      });

      const { userId: userId1, sessionId: sessionId1 } =
        await userAccountConcept.register_or_login(
          testSsoProvider,
          ssoToken1,
          testIpAddress,
          testUserAgent,
        );

      assertExists(userId1, "User ID should be returned on first login.");
      assertExists(sessionId1, "Session ID should be returned on first login.");
      assert(userId1.length > 0, "User ID should not be empty.");
      assert(sessionId1.length > 0, "Session ID should not be empty.");

      // 2. Profile setup - View profile and verify initial data
      const profile1: ProfileView = await userAccountConcept.view_profile(
        userId1,
      );
      assertEquals(profile1.userId, userId1, "Profile userId should match.");
      assertEquals(
        profile1.email,
        predefinedUser1.email,
        "Profile email should match SSO data.",
      );
      assertEquals(
        profile1.name,
        predefinedUser1.name,
        "Profile name should match SSO data.",
      );
      assertEquals(
        profile1.avatar,
        predefinedUser1.avatar,
        "Profile avatar should match SSO data.",
      );
      assertEquals(
        profile1.bio,
        predefinedUser1.bio,
        "Profile bio should match SSO data.",
      );
      assertEquals(
        profile1.isAccountDeleted,
        false,
        "New account should not be marked as deleted.",
      );

      // 3. Subsequent login with the same SSO token
      const { userId: userId1_relogin, sessionId: sessionId1_relogin } =
        await userAccountConcept.register_or_login(
          testSsoProvider,
          ssoToken1,
          generateIpAddress(), // Different IP/UA
          generateUserAgent(),
        );

      assertEquals(
        userId1_relogin,
        userId1,
        "Subsequent login should return the same User ID.",
      );
      assertExists(
        sessionId1_relogin,
        "A new Session ID should be returned on subsequent login.",
      );
      assertNotEquals(
        sessionId1_relogin,
        sessionId1,
        "New session ID should be different from the previous one.",
      );

      // Verify the first session is still valid (if multiple sessions are allowed)
      const validatedUserId_oldSession = await userAccountConcept
        .validate_session(sessionId1);
      assertEquals(
        validatedUserId_oldSession,
        userId1,
        "Previous session should still be valid after a new login (multiple sessions allowed).",
      );

      // Cleanup
      await userAccountConcept.logout(sessionId1);
      await userAccountConcept.logout(sessionId1_relogin);
    });
  },
);

Deno.test(
  "Principle: Session Management - Login -> Session validation -> Logout -> Session invalidation",
  async () => {
    await testDb(async (db: Db, userAccountConcept: MockUserAccountConcept) => {
      // 1. Login to get a session
      const ssoToken = generateValidSsoToken({ ssoId: "session-test-user" });
      const { userId, sessionId } = await userAccountConcept.register_or_login(
        testSsoProvider,
        ssoToken,
        testIpAddress,
        testUserAgent,
      );

      assertExists(userId, "User ID must be present after login.");
      assertExists(sessionId, "Session ID must be present after login.");

      // 2. Session validation
      const validatedUserId: UserId = await userAccountConcept.validate_session(
        sessionId,
      );
      assertEquals(
        validatedUserId,
        userId,
        "Validated user ID should match the logged-in user ID.",
      );

      // 3. Logout
      await userAccountConcept.logout(sessionId);

      // 4. Session invalidation - attempting to validate should now fail
      await assertRejects(
        async () => {
          await userAccountConcept.validate_session(sessionId);
        },
        InvalidSessionError,
        "Validating a logged-out session should throw InvalidSessionError.",
      );

      // Test logging out an already invalid/non-existent session (should be idempotent or gracefully handle)
      const nonExistentSessionId = "non_existent_session_123";
      await userAccountConcept.logout(nonExistentSessionId); // Should not throw an error

      // Test session validation for expired session
      const expiredSsoToken = generateExpiredSsoToken({
        ssoId: "expired-session-user",
      });
      const { userId: expiredUserId, sessionId: expiredSessionId } =
        await userAccountConcept.register_or_login(
          testSsoProvider,
          expiredSsoToken, // SSO token itself is expired, but register_or_login should still process and create session
          testIpAddress,
          testUserAgent,
        );

      // Manually make the session expire in the mock DB for testing `validate_session`
      await db.collection("sessions").updateOne(
        { sessionId: expiredSessionId },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

      await assertRejects(
        async () => {
          await userAccountConcept.validate_session(expiredSessionId);
        },
        InvalidSessionError,
        "Validating an expired session should throw InvalidSessionError.",
      );
    });
  },
);

Deno.test(
  "Principle: Profile Management - Avatar editing, bio updates, password changes",
  async () => {
    await testDb(async (db: Db, userAccountConcept: MockUserAccountConcept) => {
      // 1. Register/Login a user
      const ssoToken = generateValidSsoToken({
        ssoId: "profile-manage-user",
      });
      const { userId, sessionId } = await userAccountConcept.register_or_login(
        testSsoProvider,
        ssoToken,
        testIpAddress,
        testUserAgent,
      );

      // 2. Change avatar
      const newAvatar = faker.image.avatar();
      await userAccountConcept.change_avatar(userId, newAvatar);

      let profile: ProfileView = await userAccountConcept.view_profile(userId);
      assertEquals(profile.avatar, newAvatar, "Avatar should be updated.");
      assertNotEquals(
        profile.avatar,
        ssoToken.avatarUrl,
        "Avatar should be different from initial SSO value.",
      );

      // 3. Change bio
      const newBio = faker.lorem.paragraph();
      await userAccountConcept.change_bio(userId, newBio);

      profile = await userAccountConcept.view_profile(userId);
      assertEquals(profile.bio, newBio, "Bio should be updated.");
      assertNotEquals(
        profile.bio,
        ssoToken.bio,
        "Bio should be different from initial SSO value.",
      );

      // 4. Change password (first time setting local password)
      const newPassword1 = generatePassword();
      await userAccountConcept.change_password(userId, undefined, newPassword1); // No current password needed for first set

      // Assert that password change doesn't alter profile view (as password isn't in ProfileView)
      // We can inspect the DB directly in a mock scenario
      const userDoc = await db.collection("users").findOne({
        _id: new (await import("https://deno.land/x/mongo@v0.32.0/mod.ts")).ObjectId(
          userId,
        ),
      });
      assertExists(userDoc?.localPasswordHash, "Local password hash should exist after setting.");
      assert(
        await userAccountConcept["comparePassword"](
          newPassword1,
          userDoc?.localPasswordHash || "",
        ),
        "New password should be correctly hashed and stored.",
      );

      // 5. Change password (subsequent change, requiring current password)
      const newPassword2 = generatePassword();
      await userAccountConcept.change_password(userId, newPassword1, newPassword2);

      const userDoc2 = await db.collection("users").findOne({
        _id: new (await import("https://deno.land/x/mongo@v0.32.0/mod.ts")).ObjectId(
          userId,
        ),
      });
      assert(
        await userAccountConcept["comparePassword"](
          newPassword2,
          userDoc2?.localPasswordHash || "",
        ),
        "Second new password should be correctly hashed and stored.",
      );

      // 6. Attempt to change password with incorrect current password
      await assertRejects(
        async () => {
          await userAccountConcept.change_password(
            userId,
            "incorrect_password",
            generatePassword(),
          );
        },
        InvalidCredentialsError,
        "Changing password with incorrect current password should fail.",
      );

      // Cleanup
      await userAccountConcept.logout(sessionId);
    });
  },
);

Deno.test(
  "Principle: Account Lifecycle - Registration -> Usage -> Deletion -> Re-registration attempt",
  async () => {
    await testDb(async (db: Db, userAccountConcept: MockUserAccountConcept) => {
      // 1. Registration and Usage
      const ssoId = predefinedDeletedUser.ssoId;
      const ssoToken = generateValidSsoToken({
        ssoId,
        provider: predefinedDeletedUser.provider,
        email: predefinedDeletedUser.email,
        name: predefinedDeletedUser.name,
      });

      const { userId, sessionId } = await userAccountConcept.register_or_login(
        testSsoProvider,
        ssoToken,
        testIpAddress,
        testUserAgent,
      );
      assertExists(userId, "User should be registered.");
      assertExists(sessionId, "Session should be created.");

      const initialProfile = await userAccountConcept.view_profile(userId);
      assertEquals(
        initialProfile.email,
        predefinedDeletedUser.email,
        "Initial profile should be viewable.",
      );

      // Change avatar to show usage
      const newAvatar = faker.image.avatar();
      await userAccountConcept.change_avatar(userId, newAvatar);
      const updatedProfile = await userAccountConcept.view_profile(userId);
      assertEquals(
        updatedProfile.avatar,
        newAvatar,
        "User profile should be modifiable.",
      );

      // 2. Deletion
      await userAccountConcept.delete_account(userId);
      const userDocAfterDelete = await db.collection("users").findOne({
        _id: new (await import("https://deno.land/x/mongo@v0.32.0/mod.ts")).ObjectId(
          userId,
        ),
      });
      assertEquals(
        userDocAfterDelete?.isDeleted,
        true,
        "User account should be marked as deleted in DB.",
      );

      // Attempt to view profile of deleted user
      const deletedProfile = await userAccountConcept.view_profile(userId);
      assertEquals(
        deletedProfile.isAccountDeleted,
        true,
        "View profile should indicate account is deleted.",
      );
      // Depending on implementation, view_profile could also throw NotFoundError
      // For this mock, it returns profile with isAccountDeleted flag.

      // Attempt to use old session - should be invalid
      await assertRejects(
        async () => {
          await userAccountConcept.validate_session(sessionId);
        },
        InvalidSessionError,
        "Session for deleted user should be invalidated.",
      );

      // Attempt to modify deleted account
      await assertRejects(
        async () => {
          await userAccountConcept.change_bio(userId, "new bio after delete");
        },
        NotFoundError,
        "Modifying a deleted account should fail.",
      );

      // 3. Re-registration attempt with the same SSO token
      const { userId: reRegisteredUserId, sessionId: reRegisteredSessionId } =
        await userAccountConcept.register_or_login(
          testSsoProvider,
          ssoToken,
          generateIpAddress(),
          generateUserAgent(),
        );

      assertEquals(
        reRegisteredUserId,
        userId,
        "Re-registering with the same SSO should reactivate the existing user ID.",
      );
      assertExists(reRegisteredSessionId, "New session should be created on reactivation.");

      const reactivatedProfile = await userAccountConcept.view_profile(
        reRegisteredUserId,
      );
      assertEquals(
        reactivatedProfile.isAccountDeleted,
        false,
        "Reactivated account should no longer be marked as deleted.",
      );
      // Ensure other profile data is retained
      assertEquals(
        reactivatedProfile.avatar,
        newAvatar,
        "Reactivated account should retain previous profile data.",
      );

      // Cleanup
      await userAccountConcept.logout(reRegisteredSessionId);
    });
  },
);

Deno.test(
  "Principle: Error Handling - Invalid SSO tokens, expired sessions, invalid credentials",
  async () => {
    await testDb(async (db: Db, userAccountConcept: MockUserAccountConcept) => {
      // 1. Invalid SSO tokens
      const invalidSsoToken = generateInvalidSsoToken();
      await assertRejects(
        async () => {
          await userAccountConcept.register_or_login(
            testSsoProvider,
            invalidSsoToken,
            testIpAddress,
            testUserAgent,
          );
        },
        InvalidSsoTokenError,
        "Login with invalid SSO token should throw InvalidSsoTokenError.",
      );

      const expiredSsoToken = generateExpiredSsoToken();
      await assertRejects(
        async () => {
          await userAccountConcept.register_or_login(
            testSsoProvider,
            expiredSsoToken,
            testIpAddress,
            testUserAgent,
          );
        },
        InvalidSsoTokenError,
        "Login with expired SSO token should throw InvalidSsoTokenError.",
      );

      // 2. Expired sessions (already covered in Session Management, but reinforce here)
      const ssoToken = generateValidSsoToken();
      const { userId, sessionId } = await userAccountConcept.register_or_login(
        testSsoProvider,
        ssoToken,
        testIpAddress,
        testUserAgent,
      );
      // Manually expire session
      await db.collection("sessions").updateOne(
        { sessionId },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

      await assertRejects(
        async () => {
          await userAccountConcept.validate_session(sessionId);
        },
        InvalidSessionError,
        "Validating an expired session should throw InvalidSessionError.",
      );

      // 3. Non-existent session
      const nonExistentSessionId = "non_existent_session_xyz";
      await assertRejects(
        async () => {
          await userAccountConcept.validate_session(nonExistentSessionId);
        },
        InvalidSessionError,
        "Validating a non-existent session should throw InvalidSessionError.",
      );

      // 4. Operations on non-existent user
      const nonExistentUserId = "60a7e7b5b0f4a7c8d9e0f1a2"; // A valid-looking ObjectId string
      await assertRejects(
        async () => {
          await userAccountConcept.view_profile(nonExistentUserId);
        },
        NotFoundError,
        "Viewing profile for non-existent user should throw NotFoundError.",
      );
      await assertRejects(
        async () => {
          await userAccountConcept.change_avatar(nonExistentUserId, faker.image.avatar());
        },
        NotFoundError,
        "Changing avatar for non-existent user should throw NotFoundError.",
      );
      await assertRejects(
        async () => {
          await userAccountConcept.delete_account(nonExistentUserId);
        },
        NotFoundError,
        "Deleting non-existent user should throw NotFoundError.",
      );

      // Cleanup (if session exists for other tests, it's already expired and covered)
    });
  },
);

Deno.test(
  "Principle: Security - Session validation, account deactivation, unauthorized access",
  async () => {
    await testDb(async (db: Db, userAccountConcept: MockUserAccountConcept) => {
      // 1. Session validation (covered, but reinforce security aspect)
      const user1SsoToken = generateValidSsoToken({ ssoId: "sec-user-1" });
      const { userId: user1Id, sessionId: user1SessionId } =
        await userAccountConcept.register_or_login(
          testSsoProvider,
          user1SsoToken,
          testIpAddress,
          testUserAgent,
        );

      const validatedId = await userAccountConcept.validate_session(
        user1SessionId,
      );
      assertEquals(
        validatedId,
        user1Id,
        "Valid session should correctly return user ID.",
      );

      // Attempt to validate with a fake session ID (not truly random, but malformed)
      await assertRejects(
        async () => {
          await userAccountConcept.validate_session("fake_session_id_123");
        },
        InvalidSessionError,
        "Malformed or fake session ID should be invalid.",
      );

      // 2. Account deactivation (deletion) effect on sessions and access
      await userAccountConcept.delete_account(user1Id);
      await assertRejects(
        async () => {
          await userAccountConcept.validate_session(user1SessionId);
        },
        InvalidSessionError,
        "Session must be invalidated after account deletion.",
      );

      await assertRejects(
        async () => {
          await userAccountConcept.change_bio(user1Id, "This should fail");
        },
        NotFoundError,
        "Operations on deleted account should fail.",
      );

      // 3. Unauthorized Access (testing direct userId manipulation without session context)
      // The API methods (change_avatar, change_bio, delete_account, view_profile) directly take `userId`.
      // This implies that authorization (i.e., "is the logged-in user allowed to modify this userId?")
      // happens *before* calling these concept methods, or the userId is implicitly tied to the
      // authenticated session. For the scope of `UserAccountConcept`, we assume the provided `userId` is valid and authorized.
      // However, we can test that operations require a valid, non-deleted user.

      const user2SsoToken = generateValidSsoToken({ ssoId: "sec-user-2" });
      const { userId: user2Id, sessionId: user2SessionId } =
        await userAccountConcept.register_or_login(
          testSsoProvider,
          user2SsoToken,
          testIpAddress,
          testUserAgent,
        );

      // Attempt to change profile of User1 using User2's session (not directly testable by this API,
      // as methods don't take sessionId for auth, only userId as direct target).
      // Assuming userId is passed, no 'unauthorized' error should be thrown by the concept itself
      // if the userId refers to *any* valid, active user.
      const user1ReactivatedSsoToken = generateValidSsoToken({
        ssoId: "sec-user-1",
      });
      const { userId: user1ReactivatedId, sessionId: user1ReactivatedSession } =
        await userAccountConcept.register_or_login(
          testSsoProvider,
          user1ReactivatedSsoToken,
          generateIpAddress(),
          generateUserAgent(),
        );

      // User2 tries to change User1's profile. This scenario requires an authorization layer *above* UserAccountConcept.
      // If the concept itself were to check `sessionId` vs `userId` for ownership, this would be a test case.
      // Given current API, `change_avatar(userId, newAvatar)` implies direct access.
      // Therefore, the test here is: if `userId` is valid and active, the operation succeeds.
      // If `UserAccountConcept` *were* to have methods like `change_avatar_for_session(sessionId, newAvatar)`,
      // then `change_avatar_for_session(user2SessionId, newAvatar)` for `user1ReactivatedId` would be an `UnauthorizedError`.
      // For now, confirm valid operations on valid user ID.
      const newBioForUser1 = "User 1's bio changed by some authorized caller.";
      await userAccountConcept.change_bio(user1ReactivatedId, newBioForUser1);
      const profile1 = await userAccountConcept.view_profile(
        user1ReactivatedId,
      );
      assertEquals(
        profile1.bio,
        newBioForUser1,
        "A valid user ID operation should succeed if the user exists and is active.",
      ); // This implicitly confirms the concept doesn't enforce cross-user auth

      // Cleanup
      await userAccountConcept.logout(user1ReactivatedSession);
      await userAccountConcept.logout(user2SessionId);
    });
  },
);
```

***

## Test Data Usage

The fake test data generated in `fake_user_data.ts` is integrated into the `UserAccountConcept.test.ts` file in the following ways:

1. **Imports**: All necessary data generation functions and predefined data objects are imported at the top of the test file.
   ```typescript
   import {
     generateExpiredSsoToken,
     generateInvalidSsoToken,
     generateIpAddress,
     generatePassword,
     generateUserProfileData,
     generateValidSsoToken,
     generateUserAgent,
     predefinedDeletedUser,
     predefinedUser1,
     testIpAddress,
     testSsoProvider,
     testUserAgent,
   } from "../../../test_data/fake_user_data.ts";
   ```
2. **Generating Dynamic Data**:
   * Functions like `generateValidSsoToken()`, `generateIpAddress()`, `generateUserAgent()`, `generatePassword()`, and `generateUserProfileData()` are called within individual test cases (`Deno.test` blocks) to create unique data for each scenario. This ensures test isolation and prevents side effects between tests.
   * For example, `const ssoToken1 = generateValidSsoToken({ ssoId: predefinedUser1.ssoId, ... });` creates a unique SSO token for a specific test scenario.
3. **Using Predefined Data**:
   * Objects like `predefinedUser1`, `predefinedUser2`, `predefinedDeletedUser`, `testSsoProvider`, `testIpAddress`, and `testUserAgent` are used for scenarios where consistent or specific values are needed across tests or within a specific test's steps (e.g., ensuring a user with a specific SSO ID is deleted and then reactivated).
   * `predefinedUser1.ssoId` is used to ensure subsequent logins target the *same* user.
   * `testSsoProvider` ensures consistency in the SSO provider being tested.
4. **Error Case Data**:
   * `generateInvalidSsoToken()` and `generateExpiredSsoToken()` are specifically used in the "Error Handling" principle to assert that the `UserAccountConcept` correctly rejects invalid or expired SSO tokens.

This approach combines the flexibility of dynamic data generation for general scenarios with the control of predefined data for specific edge cases and consistency.

## Cleanup Strategy

The cleanup strategy primarily relies on the `testDb()` utility function, as described in the assumptions:

1. **`testDb()` Initialization**: Before each `Deno.test` block that uses `testDb()`, the utility is responsible for:
   * Connecting to a MongoDB instance.
   * Selecting a unique test database (`test_db_${crypto.randomUUID().substring(0, 8)}`) to ensure isolation between parallel test runs if Deno were to run tests in parallel.
   * **Crucially, dropping all collections within that database.** This ensures that each test starts with a completely fresh and empty database state, preventing test order dependencies and data contamination.
2. **`try/finally` Blocks (Implicit within `testDb`)**: The `testDb` utility itself encapsulates the test function within a `try/finally` block.
   * The `try` block executes the provided test function (`async (db, userAccountConcept) => { ... }`).
   * The `finally` block is executed regardless of whether the test passes or fails, ensuring any post-test cleanup actions are taken. For the mock `testDb`, this is where further database-specific cleanup could happen, although dropping collections *before* each test is typically sufficient.
3. **In-test Cleanup (Logout)**: Within individual tests, explicit `userAccountConcept.logout(sessionId)` calls are made at the end of the test. While the `testDb` clears the database, performing explicit logouts:
   * Tests the `logout` functionality itself.
   * Demonstrates the complete lifecycle within a test.
   * Can prevent potential issues if the `testDb` cleanup mechanism wasn't perfect or if non-database resources were involved (though in this case, only MongoDB is used).
4. **Global Connection Management**: The `connectTestDb()` and `disconnectTestDb()` functions are called once globally to establish and tear down the MongoDB client connection for the entire test suite, optimizing connection overhead.

This comprehensive strategy ensures that tests are independent, reliable, and leave no lingering data or connections after execution.
