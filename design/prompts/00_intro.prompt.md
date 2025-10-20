# Kickoff: CampusCloset (SwapIt) – High-level Understanding Only

## Role
You are a senior Deno + TypeScript + MongoDB engineer. We will iteratively build a backend by prompting you with structured specs and constraints. In this first step: DO NOT GENERATE CODE. Only confirm understanding and produce a concise, structured summary.

## Project Context
CampusCloset (aka SwapIt) is a student-only marketplace for exchanging clothing and accessories.

## Source Material (inline)
[@](../../SwapIt_spec.md)

## Responsibilities for THIS PROMPT
- Read the linked specification and app description.
- Summarize the system at a high level (3–6 bullets): core concepts, data boundaries, persistence approach, and user flows.
- Identify backend modules we’ll build (names only) in the next steps.
- List immediate open questions/assumptions to clarify before coding (≤5 items).
- Do NOT propose code or APIs yet.

## Constraints
- Tech stack: Deno, TypeScript, MongoDB (Atlas), Deno tests.
- Concepts must remain independent; communicate via identifiers (no cross-DB reads).
- Tests should be programmatic and include operational principles and interesting scenarios.

## Output Format
Respond with:
1) High-level Summary
2) Modules To Implement Next
3) Open Questions / Assumptions

# response:

I have read and understood the CampusCloset (SwapIt) project context and the detailed "Marketplace System Concept Specification."

### High-level Summary

*   **Core Functionality:** CampusCloset is a student-exclusive marketplace enabling verified users to list clothing/accessories, place bids, communicate through private message threads, and browse active listings via a filterable feed.
*   **Modular Architecture:** The backend is designed around five independent concepts: UserAccount, ItemListing, Bidding, MessagingThread, and Feed. These concepts communicate primarily through identifiers and event-driven synchronizations, adhering to strict data boundaries (no cross-concept database reads).
*   **Data Persistence & Management:** MongoDB will be used to store data, with each core concept likely mapping to distinct collections. The system manages user verification, listing lifecycle (creation to sale), bid history, message flows, and maintains an up-to-date browsing feed.
*   **Event-Driven Synchronization:** The system relies heavily on explicit "Synchronizations" and "Notifications" (events) to maintain data consistency across independent modules, such as updating a listing and user profile when a bid is placed or accepted.
*   **User Lifecycle & Interactions:** Key user flows include school email verification, profile management, creating/managing item listings, placing/withdrawing bids, accepting bids to close transactions, engaging in listing-specific message threads, and reporting inappropriate messages.

### Modules To Implement Next

1.  User Account
2.  Item Listing
3.  Bidding
4.  Messaging Thread
5.  Feed

### Open Questions / Assumptions

1.  **Email Service Integration:** What specific email service provider or mechanism (e.g., third-party API, internal service) should be used for sending verification emails?
2.  **File Storage for Media:** How will listing photos and message attachments (`Url` types) be stored and managed? Are we expected to provide upload APIs to a dedicated object storage (e.g., S3-compatible), or will we assume external URLs are provided?
3.  **Currency Specification:** What specific currency (e.g., USD, local school currency) should `CurrencyAmount` represent, and are there specific formatting or precision requirements for handling monetary values?
4.  **School Email Verification Mechanism:** Beyond sending a verification link, how is an `EmailAddress` validated as a "school email" for student-only access? Is there a predefined list of allowed domains, or an integration with an external identity provider?
5.  **Event Bus / Pub-Sub Mechanism:** Given the heavy reliance on internal "Notifications" and "Synchronizations," what mechanism (e.g., in-memory pub-sub, Redis, Kafka) should be used for emitting and consuming events between these independent modules?
## Follow-up: Proposed Defaults

Here are our proposed answers to your questions. Please confirm and ask any further questions:

1) Email service: Use Resend or SendGrid (free tier) via API. Keep an interface to swap providers. Send signed, time-limited verification links.
2) Media storage: Store only URLs in MongoDB. Uploads go to an S3-compatible bucket (Cloudflare R2 or AWS S3). Generate pre-signed upload URLs from backend; serve via CDN. Accept external URLs for early prototyping.
3) Currency: USD in integer cents. Type: { amountCents: number, currency: "USD" }. Validate non-negative; client formats display.
4) School email verification: Allowlist school domains (e.g., *.edu) with a configurable domain list; send email link verification (token). Optional later: OIDC/Google.
5) Events: Start with in-process event emitter for concept notifications; keep an adapter to upgrade to Redis/NATS when scaling.

Please respond with:
- Any follow-up questions or risks.
- Any constraints that should be locked in before we generate code for UserAccount.

# response:

Understood. The proposed answers to the initial questions are clear and establish a solid foundation for development.

### Follow-up Questions / Risks

1.  **School Domain Allowlist Management:** For the school email verification, we are assuming a static, configurable list of allowed domains (e.g., in an environment variable or config file) for initial implementation. Is there any requirement for this list to be dynamically manageable via an admin interface or database in the near future?
2.  **Verification Token Invalidation:** To confirm robustness, after `confirm_verification` is successful, any previously issued (but unexpired) `VerificationToken` for that `EmailAddress` should be explicitly invalidated or rendered unusable. This prevents a "replay" attack with an old token if multiple verification requests are made.
3.  **Sensitive Configuration Management:** How will sensitive values like API keys for email services, S3 credentials, and the school domain allowlist be securely managed in the Deno deployment environment (e.g., Deno.env API, specific secrets management service)? We will assume standard Deno.env for now.

### Constraints for UserAccount

Before commencing code generation for the `UserAccount` module, the following constraints must be locked in:

1.  **Email Verification Domain Check:** The `request_verification` action *must* include a validation step to ensure the provided `EmailAddress` matches a domain from a pre-configured allowlist of school domains (e.g., `*.edu`).
2.  **Verification Token Security:** The `VerificationToken` generated *must* be a cryptographically secure, time-limited, and single-use token. Upon successful `confirm_verification`, or if the token expires, it must be invalidated.
3.  **Immutable Username:** Once a `Username` is successfully set during `confirm_verification`, it *cannot* be changed by any subsequent action.
4.  **Verified User Requirement:** Only `UserId`s with a non-null `verifiedAt` timestamp can perform actions beyond `request_verification` and `confirm_verification` (e.g., `edit_avatar`, `edit_bio`).
5.  **Event-Driven Communication:** The `UserVerified(UserId)` and `UserDeleted(UserId)` notifications *must* be emitted using the specified in-process event emitter for modular communication.
6.  **Passwordless Authentication:** `UserAccount` will *not* manage user passwords. Authentication is solely handled through email verification links as described.

## Here are your answers for the (User Authentication):

- School domain allowlist management: Start static via env  (comma-separated). Later, add admin-only CRUD backed by a  collection; cache in-memory (TTL ~5m).
- Verification token invalidation: Single-use HMAC-signed tokens with 15–30 min TTL. On , validate signature/email/expiry, mark token used, invalidate any other active tokens for that email, and rate-limit  per email/IP.
- Sensitive config: Use  locally; in deploy, use platform secrets. Centralize config validation (TOKEN_SECRET, TOKEN_TTL_MINUTES, ALLOWED_SCHOOL_DOMAINS, EMAIL_API_KEY, APP_BASE_URL, S3 creds).
- SSO + .edu: Users authenticate with institution SSO (e.g., Duo/IdP) tied to .edu emails; we still perform email-link verification. Username is immutable post-verify.

## Generate: UserAccount Concept Implementation and Tests (Do Not Change Spec)

Produce the implementation and tests strictly per spec and constraints. If a spec gap blocks you, list assumptions clearly and proceed conservatively.

Deliverables:
- src/concepts/UserAccount/UserAccountConcept.ts
- src/concepts/UserAccount/UserAccountConcept.test.ts

Constraints:
- Deno + TypeScript + MongoDB ()
- No cross-concept DB reads/calls; use identifiers and events
- Use  existing interface; emit , 

Auth Requirements:
- .edu allowlist (config-driven, later admin-manageable)
- Passwordless email-link verification (single-use, time-limited)
- Institution SSO expected upstream (assume session present when calling actions)
- Immutable username at verification

Output format:
- Start with a short bullet list of assumptions.
- Then ONLY two code blocks with full file paths and complete contents.


## Follow-up Answers (User Authentication)

- School domain allowlist management: Start static via env  (comma-separated). Later, add admin-only CRUD backed by a  collection; cache in-memory (TTL ~5m).
- Verification token invalidation: Single-use HMAC-signed tokens with 15–30 min TTL. On , validate signature/email/expiry, mark token used, invalidate any other active tokens for that email, and rate-limit  per email/IP.
- Sensitive config: Use  locally; in deploy, use platform secrets. Centralize config validation (TOKEN_SECRET, TOKEN_TTL_MINUTES, ALLOWED_SCHOOL_DOMAINS, EMAIL_API_KEY, APP_BASE_URL, S3 creds).
- SSO + .edu: Users authenticate with institution SSO (e.g., Duo/IdP) tied to .edu emails; we still perform email-link verification. Username is immutable post-verify.

## Generate: UserAccount Concept Implementation and Tests (Do Not Change Spec)

Produce the implementation and tests strictly per spec and constraints. If a spec gap blocks you, list assumptions clearly and proceed conservatively.

Deliverables:
- src/concepts/UserAccount/UserAccountConcept.ts
- src/concepts/UserAccount/UserAccountConcept.test.ts

Constraints:
- Deno + TypeScript + MongoDB ()
- No cross-concept DB reads/calls; use identifiers and events
- Use  existing interface; emit , 

Auth Requirements:
- .edu allowlist (config-driven, later admin-manageable)
- Passwordless email-link verification (single-use, time-limited)
- Institution SSO expected upstream (assume session present when calling actions)
- Immutable username at verification

Output format:
- Start with a short bullet list of assumptions.
- Then ONLY two code blocks with full file paths and complete contents.


