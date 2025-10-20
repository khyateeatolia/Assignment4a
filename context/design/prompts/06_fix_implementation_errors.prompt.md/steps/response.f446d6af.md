---
timestamp: 'Sun Oct 19 2025 15:58:48 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_155848.2191d411.md]]'
content_id: f446d6af39c83360719cf9a547edaea18fef7748f8e7d8613ba6810dbd8272f7
---

# response:

Here's the updated `UserAccountConcept.ts` implementation, along with necessary adjustments to `mock-services.ts` and `UserAccountErrors.ts` to address all the identified issues and the critical change of removing password functionality.

**Summary of Changes:**

1. **Removed Password Functionality:**
   * `passwordHash` field removed from `User` interface.
   * No `change_password` method.
   * `register_or_login` purely uses SSO credentials (`ssoProvider`, `ssoId`, `email`, `initialDisplayName`).
   * The `User` model now includes `ssoId` and `ssoProvider` to correctly identify SSO-authenticated users.

2. **Fixed Session Management Issues:**
   * `Session` interface now includes `expiresAt: Date`.
   * `createSession` method sets `expiresAt` correctly.
   * `is_session_valid` helper function (used by all session-dependent methods):
     * Checks `expiresAt` against current time and throws `SessionExpiredError` if needed.
     * Deletes expired sessions from storage to keep it clean.
   * `deleteAllSessionsForUser` added to `StorageService` and implemented in `MockStorageService` to ensure all user sessions are deleted when an account is deleted.
   * `logout` handles `MalformedSessionIdError` by re-throwing it, and `SessionNotFoundError` by gracefully allowing it (effectively logged out).

3. **Fixed Profile Management Issues (passwordHash):**
   * The removal of `passwordHash` from the `User` model directly addresses tests that previously expected this field. The tests should now pass as they are no longer expecting a non-existent field.

4. **Fixed Account Lifecycle Issues (`instanceof` error):**
   * Ensured all custom error classes (`UserNotFoundError`, `SessionNotFoundError`, etc.) in `UserAccountErrors.ts` correctly set their prototype using `Object.setPrototypeOf(this, SomeError.prototype);`. This helps `instanceof` checks work reliably across different contexts.
   * Added `UnauthorizedError` for better semantic clarity when a session doesn't belong to the expected user.

5. **Fixed Error Handling Issues (malformed session ID message):**
   * `is_session_valid` now explicitly checks `mongoose.Types.ObjectId.isValid(sessionId)` at the very beginning. If invalid, it throws `MalformedSessionIdError("Malformed session ID provided.")` with the exact message expected by the tests.
   * This is propagated correctly by `logout` and other methods that rely on `is_session_valid`.

***

### `src/concepts/UserAccount/UserAccountConcept.ts`

```typescript
import mongoose from "mongoose"; // For ObjectId validation

import {
  User,
  Session,
  SSOProvider,
  UserAccountServiceInterface,
  AuthService,
  StorageService,
  EventService,
} from "./mock-services";
import {
  UserNotFoundError,
  SessionNotFoundError,
  SessionExpiredError,
  MalformedSessionIdError,
  UnauthorizedError,
} from "./UserAccountErrors";

const SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

class UserAccountConcept implements UserAccountServiceInterface {
  private authService: AuthService;
  private storageService: StorageService;
  private eventService: EventService;

  constructor(
    authService: AuthService,
    storageService: StorageService,
    eventService: EventService
  ) {
    this.authService = authService;
    this.storageService = storageService;
    this.eventService = eventService;
  }

  /**
   * Registers a new user or logs in an existing one using SSO credentials.
   * If the user doesn't exist, a new account is created.
   * If the user exists, their last login time and potentially profile data are updated.
   * A new session is always created upon successful registration or login.
   *
   * @param ssoProvider The SSO provider (e.g., 'Google', 'GitHub').
   * @param ssoId The unique ID provided by the SSO provider for the user.
   * @param email The user's email address from the SSO provider.
   * @param initialDisplayName The user's display name from the SSO provider, used for new registrations.
   * @returns An object containing the user's profile and the new session details.
   */
  async register_or_login(
    ssoProvider: SSOProvider,
    ssoId: string,
    email: string,
    initialDisplayName: string
  ): Promise<{ user: User; session: Session }> {
    let user = await this.storageService.getUserBySso(ssoProvider, ssoId);

    if (!user) {
      // Register new user
      const newUser: User = {
        userId: new mongoose.Types.ObjectId().toHexString(), // Generate a new unique ID
        ssoProvider,
        ssoId,
        email,
        displayName: initialDisplayName,
        avatarUrl: "", // Default empty avatar
        bio: "", // Default empty bio
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      user = await this.storageService.saveUser(newUser);
      this.eventService.publish("userRegistered", { userId: user.userId, ssoProvider, email });
    } else {
      // User exists, log them in and update profile info that might change via SSO
      user.email = email; // Update email if it changed in SSO
      user.displayName = initialDisplayName; // Update display name if it changed in SSO
      user.updatedAt = new Date(); // Record last login/update
      user = await this.storageService.saveUser(user); // Save updated user profile
      this.eventService.publish("userLoggedIn", { userId: user.userId });
    }

    // Create a new session for the user
    const session = await this.createSession(user.userId);
    return { user, session };
  }

  /**
   * Logs out a user by invalidating and deleting their session.
   * If the session ID is malformed, it throws a MalformedSessionIdError.
   * If the session is not found, it silently succeeds as the user is effectively logged out.
   *
   * @param sessionId The ID of the session to invalidate.
   */
  async logout(sessionId: string): Promise<void> {
    try {
      // Validate session ID format and existence, but don't care about expiration for logout
      // We explicitly re-throw MalformedSessionIdError to match test expectation.
      await this.is_session_valid(sessionId); 
      await this.storageService.deleteSession(sessionId);
      this.eventService.publish("userLoggedOut", { sessionId });
    } catch (error) {
      if (error instanceof MalformedSessionIdError) {
        throw error; // Re-throw for malformed IDs as per test expectation
      } else if (error instanceof SessionNotFoundError || error instanceof SessionExpiredError) {
        // If session not found or already expired, consider logout successful (idempotent)
        this.eventService.publish("userLogoutAttemptFailedOrSessionNotFound", { sessionId, error: error.message });
        return; 
      }
      throw error; // Re-throw other unexpected errors
    }
  }

  /**
   * Changes a user's avatar URL.
   * Requires a valid session belonging to the user.
   *
   * @param userId The ID of the user whose avatar to change.
   * @param sessionId The ID of the active session.
   * @param newAvatarUrl The new URL for the user's avatar.
   * @returns The updated User object.
   * @throws UserNotFoundError if the user does not exist.
   * @throws SessionNotFoundError if the session does not exist.
   * @throws SessionExpiredError if the session has expired.
   * @throws MalformedSessionIdError if the session ID is not a valid format.
   * @throws UnauthorizedError if the session does not belong to the specified user.
   */
  async change_avatar(userId: string, sessionId: string, newAvatarUrl: string): Promise<User> {
    await this.checkAuthorization(sessionId, userId); // Validates session and authorization
    const user = await this.storageService.getUser(userId);
    if (!user) {
      throw new UserNotFoundError(`User with ID ${userId} not found.`);
    }

    user.avatarUrl = newAvatarUrl;
    user.updatedAt = new Date();
    const updatedUser = await this.storageService.saveUser(user);
    this.eventService.publish("userAvatarChanged", { userId, newAvatarUrl });
    return updatedUser;
  }

  /**
   * Changes a user's biographical information (bio).
   * Requires a valid session belonging to the user.
   *
   * @param userId The ID of the user whose bio to change.
   * @param sessionId The ID of the active session.
   * @param newBio The new biographical text.
   * @returns The updated User object.
   * @throws UserNotFoundError if the user does not exist.
   * @throws SessionNotFoundError if the session does not exist.
   * @throws SessionExpiredError if the session has expired.
   * @throws MalformedSessionIdError if the session ID is not a valid format.
   * @throws UnauthorizedError if the session does not belong to the specified user.
   */
  async change_bio(userId: string, sessionId: string, newBio: string): Promise<User> {
    await this.checkAuthorization(sessionId, userId); // Validates session and authorization
    const user = await this.storageService.getUser(userId);
    if (!user) {
      throw new UserNotFoundError(`User with ID ${userId} not found.`);
    }

    user.bio = newBio;
    user.updatedAt = new Date();
    const updatedUser = await this.storageService.saveUser(user);
    this.eventService.publish("userBioChanged", { userId, newBio });
    return updatedUser;
  }

  /**
   * Retrieves a user's profile information.
   * Requires a valid session belonging to the user.
   *
   * @param userId The ID of the user whose profile to view.
   * @param sessionId The ID of the active session.
   * @returns The User object containing profile information.
   * @throws UserNotFoundError if the user does not exist.
   * @throws SessionNotFoundError if the session does not exist.
   * @throws SessionExpiredError if the session has expired.
   * @throws MalformedSessionIdError if the session ID is not a valid format.
   * @throws UnauthorizedError if the session does not belong to the specified user.
   */
  async view_profile(userId: string, sessionId: string): Promise<User> {
    await this.checkAuthorization(sessionId, userId); // Validates session and authorization
    const user = await this.storageService.getUser(userId);
    if (!user) {
      throw new UserNotFoundError(`User with ID ${userId} not found.`);
    }
    return user;
  }

  /**
   * Deletes a user account and all associated data, including all active sessions for that user.
   * Requires a valid session belonging to the user.
   *
   * @param userId The ID of the user account to delete.
   * @param sessionId The ID of the active session.
   * @throws UserNotFoundError if the user does not exist.
   * @throws SessionNotFoundError if the session does not exist.
   * @throws SessionExpiredError if the session has expired.
   * @throws MalformedSessionIdError if the session ID is not a valid format.
   * @throws UnauthorizedError if the session does not belong to the specified user.
   */
  async delete_account(userId: string, sessionId: string): Promise<void> {
    await this.checkAuthorization(sessionId, userId); // Validates session and authorization

    const user = await this.storageService.getUser(userId);
    if (!user) {
      // If user is already deleted, gracefully handle it
      throw new UserNotFoundError(`User with ID ${userId} not found.`);
    }

    await this.storageService.deleteUser(userId);
    await this.storageService.deleteAllSessionsForUser(userId); // Delete all sessions for this user
    this.eventService.publish("userAccountDeleted", { userId });
  }

  /**
   * Internal helper to create a new session for a given user.
   *
   * @param userId The ID of the user for whom to create a session.
   * @returns The newly created Session object.
   */
  private async createSession(userId: string): Promise<Session> {
    const expiresAt = new Date(Date.now() + SESSION_EXPIRATION_MS);
    const newSession: Session = {
      sessionId: new mongoose.Types.ObjectId().toHexString(),
      userId,
      createdAt: new Date(),
      expiresAt, // Set expiration time
    };
    await this.storageService.saveSession(newSession);
    return newSession;
  }

  /**
   * Internal helper to validate a session.
   * Checks if the session ID is well-formed, exists, is not expired, and optionally belongs to a specific user.
   *
   * @param sessionId The ID of the session to validate.
   * @param expectedUserId Optional. If provided, checks if the session belongs to this user.
   * @returns The valid Session object.
   * @throws MalformedSessionIdError if the session ID is not a valid format.
   * @throws SessionNotFoundError if the session does not exist.
   * @throws SessionExpiredError if the session has expired.
   * @throws UnauthorizedError if `expectedUserId` is provided and the session's user ID does not match.
   */
  private async is_session_valid(sessionId: string, expectedUserId?: string): Promise<Session> {
    // 1. Check for malformed session ID early
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new MalformedSessionIdError("Malformed session ID provided.");
    }

    // 2. Retrieve the session from storage
    const session = await this.storageService.getSession(sessionId);
    if (!session) {
      throw new SessionNotFoundError(`Session with ID ${sessionId} not found.`);
    }

    // 3. Check if the session has expired
    if (session.expiresAt < new Date()) {
      await this.storageService.deleteSession(sessionId); // Clean up expired session from storage
      throw new SessionExpiredError(`Session with ID ${sessionId} has expired.`);
    }

    // 4. If an expected user ID is provided, check ownership
    if (expectedUserId && session.userId !== expectedUserId) {
      throw new UnauthorizedError(`Session ${sessionId} does not belong to user ${expectedUserId}.`);
    }

    return session;
  }

  /**
   * Internal helper to perform a full authorization check for an action.
   * Ensures the provided sessionId is valid, not expired, and belongs to the given userId.
   *
   * @param sessionId The ID of the session to check.
   * @param userId The ID of the user who is attempting the action.
   * @throws MalformedSessionIdError, SessionNotFoundError, SessionExpiredError, UnauthorizedError.
   */
  private async checkAuthorization(sessionId: string, userId: string): Promise<void> {
    // The is_session_valid method will throw appropriate errors if the session is invalid, expired, malformed,
    // or does not belong to the expected user.
    await this.is_session_valid(sessionId, userId);
  }
}

export { UserAccountConcept };
```

***

### `src/concepts/UserAccount/mock-services.ts` (Updated)

```typescript
import mongoose from "mongoose"; // For generating mock ObjectId-like strings

// --- Interfaces for User Account ---

export type SSOProvider = "Google" | "GitHub" | "Facebook";

/**
 * Represents a user in the system. Password-related fields have been removed
 * as the system now exclusively uses SSO for authentication.
 */
export interface User {
  userId: string;
  ssoId: string; // Unique ID from SSO provider (e.g., Google's sub)
  ssoProvider: SSOProvider; // The SSO provider (e.g., 'Google')
  email: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents an active user session.
 * Now includes `expiresAt` for session expiration logic.
 */
export interface Session {
  sessionId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date; // When the session becomes invalid
}

// --- Service Interfaces ---

/**
 * Placeholder for an authentication service.
 * In a real application, this would handle SSO token validation etc.
 * For this exercise, we assume SSO details (ssoId, email) are already validated.
 */
export interface AuthService {
  // No specific methods required for the current problem scope
}

/**
 * Interface for data storage operations.
 * `getUserBySso` and `deleteAllSessionsForUser` added.
 */
export interface StorageService {
  getUser(userId: string): Promise<User | null>;
  getUserBySso(ssoProvider: SSOProvider, ssoId: string): Promise<User | null>; // New: find user by SSO details
  saveUser(user: User): Promise<User>;
  deleteUser(userId: string): Promise<void>;

  getSession(sessionId: string): Promise<Session | null>;
  saveSession(session: Session): Promise<Session>;
  deleteSession(sessionId: string): Promise<void>;
  deleteAllSessionsForUser(userId: string): Promise<void>; // New: delete all sessions linked to a user
}

/**
 * Interface for an event publishing service.
 */
export interface EventService {
  publish(event: string, payload: any): void;
}

/**
 * Interface for the main UserAccount concept methods.
 * `change_password` has been removed.
 */
export interface UserAccountServiceInterface {
  register_or_login(
    ssoProvider: SSOProvider,
    ssoId: string,
    email: string,
    initialDisplayName: string
  ): Promise<{ user: User; session: Session }>;
  logout(sessionId: string): Promise<void>;
  change_avatar(userId: string, sessionId: string, newAvatarUrl: string): Promise<User>;
  change_bio(userId: string, sessionId: string, newBio: string): Promise<User>;
  view_profile(userId: string, sessionId: string): Promise<User>;
  delete_account(userId: string, sessionId: string): Promise<void>;
}

// --- Mock Implementations ---

export class MockAuthService implements AuthService {
  // No specific implementation needed for this problem context.
  // In a real system, this would interact with SSO providers.
}

export class MockStorageService implements StorageService {
  private users: Map<string, User> = new Map(); // Stores users by userId
  private ssoIndex: Map<string, string> = new Map(); // Stores ssoProvider_ssoId -> userId for quick lookup
  private sessions: Map<string, Session> = new Map(); // Stores sessions by sessionId
  private userSessionsIndex: Map<string, Set<string>> = new Map(); // Stores userId -> Set<sessionId>

  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async getUserBySso(ssoProvider: SSOProvider, ssoId: string): Promise<User | null> {
    const key = `${ssoProvider}_${ssoId}`;
    const userId = this.ssoIndex.get(key);
    return userId ? this.users.get(userId) || null : null;
  }

  async saveUser(user: User): Promise<User> {
    // Ensure userId exists (it should be generated by the concept)
    if (!user.userId) {
      user.userId = new mongoose.Types.ObjectId().toHexString(); // Fallback/Test utility
    }
    // Store a copy to prevent external modification of internal state
    const userCopy = { ...user };
    this.users.set(user.userId, userCopy);
    this.ssoIndex.set(`${user.ssoProvider}_${user.ssoId}`, user.userId);
    return userCopy;
  }

  async deleteUser(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.delete(userId);
      this.ssoIndex.delete(`${user.ssoProvider}_${user.ssoId}`);
      // Also ensure all related sessions are deleted
      await this.deleteAllSessionsForUser(userId);
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) || null;
  }

  async saveSession(session: Session): Promise<Session> {
    const sessionCopy = { ...session };
    this.sessions.set(session.sessionId, sessionCopy);

    // Update userSessionsIndex
    let userSessions = this.userSessionsIndex.get(session.userId);
    if (!userSessions) {
      userSessions = new Set();
      this.userSessionsIndex.set(session.userId, userSessions);
    }
    userSessions.add(session.sessionId);
    return sessionCopy;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);

      // Remove from userSessionsIndex
      const userSessions = this.userSessionsIndex.get(session.userId);
      if (userSessions) {
        userSessions.delete(sessionId);
        if (userSessions.size === 0) {
          this.userSessionsIndex.delete(session.userId);
        }
      }
    }
  }

  async deleteAllSessionsForUser(userId: string): Promise<void> {
    const sessionIds = this.userSessionsIndex.get(userId);
    if (sessionIds) {
      for (const sessionId of sessionIds) {
        this.sessions.delete(sessionId);
      }
      this.userSessionsIndex.delete(userId);
    }
  }
}

export class MockEventService implements EventService {
  public publishedEvents: { event: string; payload: any }[] = [];

  publish(event: string, payload: any): void {
    this.publishedEvents.push({ event, payload });
  }

  clearEvents(): void {
    this.publishedEvents = [];
  }
}
```

***

### `src/concepts/UserAccount/UserAccountErrors.ts` (Updated)

```typescript
/**
 * Base class for all custom errors in the UserAccount concept.
 * Ensures that instanceof checks work correctly across different environments.
 */
export class UserAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // This line is crucial for `instanceof` to work correctly with custom errors in TypeScript
    // especially when transpiling to ES5 or in certain module environments.
    Object.setPrototypeOf(this, UserAccountError.prototype);
  }
}

/**
 * Error thrown when a requested user cannot be found.
 */
export class UserNotFoundError extends UserAccountError {
  constructor(message: string = "User not found.") {
    super(message);
    Object.setPrototypeOf(this, UserNotFoundError.prototype);
  }
}

/**
 * Error thrown when a requested session cannot be found.
 */
export class SessionNotFoundError extends UserAccountError {
  constructor(message: string = "Session not found.") {
    super(message);
    Object.setPrototypeOf(this, SessionNotFoundError.prototype);
  }
}

/**
 * Error thrown when a session is found but has already expired.
 */
export class SessionExpiredError extends UserAccountError {
  constructor(message: string = "Session has expired.") {
    super(message);
    Object.setPrototypeOf(this, SessionExpiredError.prototype);
  }
}

/**
 * Error thrown when a provided session ID string is not in a valid format (e.g., not a valid MongoDB ObjectId hex string).
 */
export class MalformedSessionIdError extends UserAccountError {
  constructor(message: string = "Malformed session ID provided.") {
    super(message);
    Object.setPrototypeOf(this, MalformedSessionIdError.prototype);
  }
}

/**
 * Error thrown when an action is attempted with a valid session, but the session
 * does not belong to the user attempting the action, or the user is not authorized.
 */
export class UnauthorizedError extends UserAccountError {
  constructor(message: string = "Unauthorized access.") {
    super(message);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

// Removed: InvalidCredentialsError, PasswordMismatchError, EmailAlreadyExistsError (password-related)
```
