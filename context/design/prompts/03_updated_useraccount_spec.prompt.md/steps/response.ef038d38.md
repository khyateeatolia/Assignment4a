---
timestamp: 'Sun Oct 19 2025 14:40:27 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_144027.90945e8b.md]]'
content_id: ef038d38c34c00c171c3e8c8e04960b1804cd8eb957a67c61479b58a7e0adb2f
---

# response:

As a senior software architect, I have reviewed the existing specification and the new requirements for the `UserAccount` concept. The shift to SSO authentication and comprehensive profile management significantly refactors the user identity and interaction model within SwapIt.

Here is the updated UserAccount Concept Specification, incorporating SSO authentication, full profile management, and addressing all new requirements and constraints.

***

## Updated UserAccount Concept Specification: SSO & Profile Management

### 1. Overview

This specification redefines the `UserAccount` concept for SwapIt to leverage Single Sign-On (SSO) authentication provided by educational institutions (schools) and introduces robust profile management capabilities. The primary goal is to simplify user onboarding and authentication by delegating these concerns to trusted identity providers, while empowering users to manage their public-facing profiles within the platform.

### 2. Core Concepts

* **User (UserAccount)**: Represents an individual user within the SwapIt platform. It stores core identification, authentication linkage (SSO), and internal system state. A User is created automatically upon their first successful SSO login.
* **Profile**: Represents the public-facing and personalized information associated with a User. It is intrinsically linked to a User and houses data relevant to social interaction and marketplace participation.
* **SSOProvider**: Identifies the external identity provider (e.g., a university's OAuth 2.0 server) responsible for authenticating the User. This allows SwapIt to support multiple schools.
* **SSOToken**: A security token issued by the SSOProvider after a user successfully authenticates with their school. This token is presented to SwapIt for verification.
* **Session**: Represents an active, authenticated user session within the SwapIt platform. It links a User to their ongoing activity and ensures secure access to features.
* **UserId**: A unique identifier for a User within SwapIt, typically an `ObjectId`.
* **SessionId**: A unique identifier for an active Session.

### 3. Data Models

#### 3.1. `User` Model

The `User` model now focuses on identity, SSO linkage, and account status.

```typescript
interface User {
    _id: ObjectId;                     // Unique identifier for the User (UserId)
    email: EmailAddress;               // Primary email address, derived from SSO provider, immutable after first login
    username: Username;                 // Unique, immutable display name, set on first login
    ssoProvider: SSOProvider;          // Identifier for the school's identity provider (e.g., "university.edu")
    ssoId: String;                     // Unique identifier for the user within the SSOProvider's system
    avatarUrl?: Url;                    // Optional URL to the user's avatar image, editable
    createdAt: Timestamp;              // Timestamp of account creation (first SSO login)
    lastLoginAt: Timestamp;            // Timestamp of the last successful SSO login
    isActive: Boolean;                 // Account status (true for active, false for deactivated)
    // passwordHash?: PasswordHash;     // Conditional: Only if supporting local passwords (see change_password)
}
```

**Notes:**

* `username` will be derived from the SSO provider's information (e.g., preferred name, or part of email). A mechanism for ensuring uniqueness (e.g., appending numbers) and allowing a one-time user choice on first login may be considered if initial derivation often leads to collisions or undesirable names. For this spec, we assume derivation with system-level uniqueness handling.
* `email` is considered immutable as it's tied directly to the SSO provider's identity.

#### 3.2. `Profile` Model

The `Profile` model stores public-facing and activity-related information.

```typescript
interface Profile {
    _id: ObjectId;                     // Corresponds to UserId, linking directly to the User
    bio?: String;                      // Optional biography, editable by the user
    listings: List<ListingId>;         // List of IDs of items the user has listed
    bids: List<BidId>;                 // List of IDs of bids the user has placed
    threads: List<ThreadId>;           // List of IDs of messaging threads the user is part of
    // Add other profile-specific fields as needed, e.g., reviews, ratings.
}
```

**Notes:**

* The `_id` of the `Profile` document *must* be identical to the `_id` of the corresponding `User` document, ensuring a one-to-one relationship and direct synchronization.

#### 3.3. `Session` Model

The `Session` model manages active user sessions.

```typescript
interface Session {
    _id: SessionId;                    // Unique identifier for the session
    userId: UserId;                    // The ID of the authenticated user
    createdAt: Timestamp;              // Timestamp when the session was created
    expiresAt: Timestamp;              // Timestamp when the session automatically expires
    ipAddress: String;                 // IP address from which the session was initiated
    userAgent: String;                 // User-Agent string from which the session was initiated
    isValid: Boolean;                  // Flag indicating if the session is currently valid
}
```

### 4. Collections

* **`users`**: Stores `User` documents.
* **`profiles`**: Stores `Profile` documents, with `_id` matching `users._id`.
* **`sessions`**: Stores `Session` documents for active user sessions.
* **Removed**: `pending_verifications` collection is no longer needed.

### 5. Actions (API Endpoints/Service Methods)

#### 5.1. Authentication & Session Management

1. **`register_or_login(ssoProvider: SSOProvider, ssoToken: SSOToken) -> { userId: UserId, sessionId: SessionId }`**
   * **Description**: The primary entry point for user authentication. Handles both initial user registration and subsequent logins via SSO.
   * **Preconditions**: `ssoToken` must be a valid token issued by the specified `ssoProvider`.
   * **Flow**:
     1. Validate `ssoToken` with the external `ssoProvider`'s identity verification endpoint. This verifies the token's authenticity, expiry, and extracts user details (e.g., `ssoId`, `email`, preferred `username`).
     2. If `ssoToken` is invalid, throw `AuthenticationFailedError`.
     3. Search the `users` collection for a `User` with matching `ssoProvider` and `ssoId`.
     4. **If User Exists**:
        * Update `user.lastLoginAt` to current timestamp.
        * Ensure `user.isActive` is `true`. If `false`, reactivate account.
        * Emit `UserLoggedIn(userId)`.
     5. **If User Does Not Exist (New Registration)**:
        * Create a new `User` document:
          * `_id`: Generate new `ObjectId` (UserId).
          * `email`: From SSO token.
          * `username`: Derived from SSO token (e.g., preferred name or part of email, with uniqueness enforced).
          * `ssoProvider`: As provided.
          * `ssoId`: From SSO token.
          * `avatarUrl`: (Optional) May be populated from SSO profile if available, otherwise `null`.
          * `createdAt`: Current timestamp.
          * `lastLoginAt`: Current timestamp.
          * `isActive`: `true`.
        * Create a corresponding `Profile` document:
          * `_id`: Same as `User._id`.
          * `bio`: `null`.
          * `listings`, `bids`, `threads`: Empty lists.
        * Save both new `User` and `Profile` documents.
        * Emit `UserRegistered(userId)` and `UserLoggedIn(userId)`.
     6. Create a new `Session` document in the `sessions` collection:
        * `_id`: Generate `SessionId`.
        * `userId`: The `_id` of the logged-in or newly created User.
        * `createdAt`, `expiresAt`, `ipAddress`, `userAgent`.
        * `isValid`: `true`.
     7. Return `userId` and `sessionId`.

2. **`logout(sessionId: SessionId) -> void`**
   * **Description**: Invalidates an active user session.
   * **Preconditions**: `sessionId` must exist and be valid.
   * **Flow**:
     1. Find the `Session` document by `sessionId`.
     2. If session exists, set `session.isValid` to `false` and optionally remove the session document.
     3. Emit `UserLoggedOut(userId)` (where `userId` is from the session).
     4. Return.

#### 5.2. Profile Management

3. **`change_avatar(userId: UserId, newAvatar: Url) -> void`**
   * **Description**: Updates the user's avatar image URL.
   * **Preconditions**: User must be authenticated (`userId` must correspond to an active session). `newAvatar` must be a valid, accessible URL.
   * **Flow**:
     1. Find the `User` document by `userId`.
     2. Update `user.avatarUrl` to `newAvatar`.
     3. Save the updated `User` document.
     4. Emit `ProfileUpdated(userId)`.
     5. Return.

4. **`change_bio(userId: UserId, bio: String) -> void`**
   * **Description**: Updates the user's biography.
   * **Preconditions**: User must be authenticated. `bio` string length must be within defined limits.
   * **Flow**:
     1. Find the `Profile` document by `userId`.
     2. Update `profile.bio` to `bio`.
     3. Save the updated `Profile` document.
     4. Emit `ProfileUpdated(userId)`.
     5. Return.

5. **`view_profile(userId: UserId) -> ProfileView`**
   * **Description**: Retrieves a combined view of a user's public profile data.
   * **Preconditions**: `userId` must refer to an existing and active user.
   * **Flow**:
     1. Retrieve `User` document by `userId`.
     2. Retrieve `Profile` document by `userId`.
     3. Combine relevant public fields from both `User` (e.g., `username`, `avatarUrl`, `email` - potentially masked for privacy) and `Profile` (e.g., `bio`, `listings`, `bids`, `threads`) into a `ProfileView` object.
     4. Return `ProfileView`.

#### 5.3. Account Management

6. **`change_password(userId: UserId, currentPassword: String, newPassword: String) -> void`**
   * **Description**: Allows a user to change their local password.
   * **Applicability**: **This action is only relevant if SwapIt implements a hybrid authentication model where users can *also* set a local password, or for legacy users not using SSO.** In a pure SSO model, password management is entirely delegated to the `ssoProvider` (the school's system), and this action would not exist.
   * **Preconditions**: User must be authenticated. `userId` must correspond to a user with a locally stored `passwordHash`. `currentPassword` must match the stored hash. `newPassword` must meet complexity requirements.
   * **Flow (if applicable)**:
     1. Find the `User` document by `userId`.
     2. Verify `currentPassword` against `user.passwordHash`. If mismatch, throw `InvalidCredentialsError`.
     3. Hash `newPassword` and update `user.passwordHash`.
     4. Save the updated `User` document.
     5. Return.

7. **`delete_account(userId: UserId) -> void`**
   * **Description**: Permanently deletes a user account and all associated data.
   * **Preconditions**: User must be authenticated and authorized. Often requires re-authentication or confirmation.
   * **Flow**:
     1. Find the `User` document by `userId`.
     2. Mark `user.isActive` as `false` initially, or immediately begin deletion.
     3. **Critical**: Implement cascading deletion:
        * Delete `User` document.
        * Delete `Profile` document.
        * Invalidate/Delete all associated `Session` documents.
        * Handle related data: Mark user's `listings` as `deleted_by_user` or reassign (platform policy decision). Anonymize user's `bids` and `threads` (e.g., by replacing `userId` with a placeholder or `null`).
     4. Emit `UserDeleted(userId)`.
     5. Return.

### 6. Notifications (Events)

* `UserRegistered(UserId)`: Emitted when a new user account is successfully created via first SSO login.
* `UserLoggedIn(UserId)`: Emitted on every successful login (whether new registration or existing user).
* `UserLoggedOut(UserId)`: Emitted when a user's session is explicitly terminated via `logout`.
* `UserDeleted(UserId)`: Emitted when a user account is deleted.
* `ProfileUpdated(UserId)`: Emitted when a user's `avatarUrl` or `bio` is changed.

### 7. SSO Integration Strategy

#### Recommended Approach: OAuth 2.0 / OpenID Connect (OIDC)

**Rationale**:

* **Widespread Adoption**: Most modern universities and institutions (e.g., those using Google Workspace for Education, Microsoft 365, Okta, Shibboleth with OIDC gateways) support OAuth 2.0/OIDC.
* **Security**: Well-defined flows for token validation, scope management, and secure communication.
* **Flexibility**: Supports various grant types suitable for web and mobile applications.
* **Standardized Profile Information**: OIDC provides standard claims (e.g., `email`, `preferred_username`, `picture`) which simplify user data extraction.
* **Multiple Providers**: `ssoProvider` field naturally supports connecting to different schools' IDPs.

**Strategy Details**:

1. **Discovery**: Identify the school's SSO system. For many, this will be an OIDC-compliant endpoint.
2. **Registration**: SwapIt will register as a client application with each school's identity provider. This provides SwapIt with a `client_id` and `client_secret`.
3. **Authorization Flow**:
   * User initiates login on SwapIt, chooses their school.
   * SwapIt redirects the user's browser to the school's authorization endpoint, including `client_id`, `redirect_uri`, and requested `scope` (e.g., `openid profile email`).
   * User authenticates with their school credentials on the school's login page.
   * School's IDP redirects the user back to SwapIt's `redirect_uri` with an `authorization_code`.
   * SwapIt's backend exchanges the `authorization_code` (along with `client_id` and `client_secret`) for an `id_token` (SSOToken) and an `access_token` at the school's token endpoint.
4. **Token Validation & User Provisioning**:
   * SwapIt's backend *must* validate the `id_token` (SSOToken) obtained from the school. This involves:
     * Verifying the `id_token`'s signature using the IDP's public keys.
     * Checking `aud` (audience) to ensure it matches SwapIt's `client_id`.
     * Checking `iss` (issuer) to ensure it matches the expected `ssoProvider`.
     * Checking `exp` (expiration) to ensure the token is still valid.
     * Extracting user claims (e.g., `sub` for `ssoId`, `email`, `preferred_username`) from the `id_token`.
   * Use the extracted `ssoId`, `email`, and `ssoProvider` to perform the `register_or_login` logic as described above.

#### Alternative: SAML 2.0

**Rationale**: Common in enterprise and educational environments, often preferred by universities for federated identity.
**Considerations**: More complex to implement than OAuth/OIDC. Requires parsing XML assertions and handling cryptographic signatures. If a school exclusively uses SAML, a SAML Service Provider (SP) library would be necessary. Can be integrated using a proxy service that converts SAML to OIDC for SwapIt.

### 8. Implementation Notes

* **Security Token Validation**: The most critical aspect of SSO. Always validate the `SSOToken` *server-side* with the `ssoProvider`'s published keys/endpoints. Never trust client-side validation.
* **Session Management**:
  * Use secure, HTTP-only cookies for `sessionId`.
  * Implement token rotation or short-lived access tokens with refresh tokens for APIs.
  * Ensure sessions have reasonable expiry times and are invalidated on logout or suspicious activity.
* **Username Generation**: Develop a robust strategy for deriving unique `username` values from SSO claims. This might involve sanitizing the preferred name/email prefix and appending numbers (`john.doe`, `john.doe1`, `john.doe2`) until uniqueness is achieved.
* **Idempotency**: `register_or_login` should be idempotent; calling it multiple times with the same valid `ssoToken` should result in the same user being logged in without creating duplicate accounts.
* **Error Handling**: Provide clear error messages for failed SSO authentication (e.g., "Authentication failed with your school account. Please try again.").
* **Rate Limiting**: Apply rate limiting to all authentication and account management endpoints to prevent brute-force attacks and abuse.
* **Data Privacy**: Ensure that only necessary user data is requested from the SSO provider (via `scope` in OAuth/OIDC) and stored. Comply with GDPR, FERPA, and any specific school data policies.
* **Audit Logging**: Log all critical security-related events: successful/failed logins, account creation, password changes (if applicable), account deletions, and session invalidations.
* **`change_password` (Conditional)**: If a hybrid model (local password + SSO) is required, the `User` model would need a `passwordHash: PasswordHash;` field, and the `register_or_login` would only set this if the user explicitly opts in or if it's a legacy account. It adds significant complexity and is generally discouraged in a pure SSO environment.
* **Account Deactivation vs. Deletion**: `isActive` flag in `User` allows for temporary deactivation without full data loss. `delete_account` is permanent.

### 9. Migration Strategy (from Email/Password to SSO)

Migrating an existing user base from email/password verification to SSO requires careful planning to ensure a smooth transition and avoid user frustration.

1. **Phase 1: Hybrid Authentication (Coexistence)**
   * **Keep Existing Login**: Maintain the existing email/password `login` and `register` (though `register` could be deprecated).
   * **Introduce SSO Option**: Add a "Login with School Account" option on the login page.
   * **SSO Account Linking**:
     * **For New SSO Users**: When a user logs in via SSO for the *first time*, treat them as a new user (via `register_or_login`).
     * **For Existing Email Users**: If an existing user logs in via SSO and their SSO `email` *matches* an email in the `users` collection:
       * Prompt the user to link their existing SwapIt account to their school account.
       * Upon confirmation, update the existing `User` document to include `ssoProvider` and `ssoId`.
       * Remove the `passwordHash` if the user opts for pure SSO, or keep it for a hybrid login option.
       * Provide a warning about removing local password if linking.
       * If emails don't match, prompt the user if they want to create a new account or link to an *existing* account using different credentials (e.g., re-enter email/password to link). This can be complex.
   * **Deprecate Email Verification**: Stop sending new email verification requests. New users are solely onboarded via SSO.

2. **Phase 2: Encouraging SSO Adoption**
   * **Promote SSO**: Visibly encourage existing users to link their accounts to SSO for easier access.
   * **Email Campaigns**: Inform users about the benefits of SSO.
   * **UI/UX Cues**: Guide users through the linking process after they log in with their old credentials.

3. **Phase 3: Phased Deprecation of Email/Password (Optional)**
   * **Long-Term Goal**: If the platform aims for pure SSO, after a substantial transition period, gradually phase out direct email/password login.
   * **Warning Period**: Provide ample warning to users still using local passwords.
   * **Assisted Migration**: Offer tools for users to convert their local account to an SSO-linked account if they haven't already.
   * **Final Removal**: Once a critical mass of users have migrated, and policies allow, remove the local email/password login path entirely.

**Data Mapping Considerations**:

* Existing `email` from `User` model will be populated by the `email` from the SSO provider.
* Existing `username` (if present and distinct from email) will need to be mapped to the new `username` field. If existing usernames don't conform to the new immutability or derivation rules, a one-time migration script or user prompt may be necessary.
* Existing `profiles` should simply be linked to the `_id` of the corresponding `User` document.

***
