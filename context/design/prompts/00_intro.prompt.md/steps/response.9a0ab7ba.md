---
timestamp: 'Thu Oct 16 2025 14:08:55 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_140855.22db7c52.md]]'
content_id: 9a0ab7bacbff75dffd6ac2460cd1a800c2269d17f3135f9f5cd9464814857af4
---

# response:

Understood. The proposed answers to the initial questions are clear and establish a solid foundation for development.

### Follow-up Questions / Risks

1. **School Domain Allowlist Management:** For the school email verification, we are assuming a static, configurable list of allowed domains (e.g., in an environment variable or config file) for initial implementation. Is there any requirement for this list to be dynamically manageable via an admin interface or database in the near future?
2. **Verification Token Invalidation:** To confirm robustness, after `confirm_verification` is successful, any previously issued (but unexpired) `VerificationToken` for that `EmailAddress` should be explicitly invalidated or rendered unusable. This prevents a "replay" attack with an old token if multiple verification requests are made.
3. **Sensitive Configuration Management:** How will sensitive values like API keys for email services, S3 credentials, and the school domain allowlist be securely managed in the Deno deployment environment (e.g., Deno.env API, specific secrets management service)? We will assume standard Deno.env for now.

### Constraints for UserAccount

Before commencing code generation for the `UserAccount` module, the following constraints must be locked in:

1. **Email Verification Domain Check:** The `request_verification` action *must* include a validation step to ensure the provided `EmailAddress` matches a domain from a pre-configured allowlist of school domains (e.g., `*.edu`).
2. **Verification Token Security:** The `VerificationToken` generated *must* be a cryptographically secure, time-limited, and single-use token. Upon successful `confirm_verification`, or if the token expires, it must be invalidated.
3. **Immutable Username:** Once a `Username` is successfully set during `confirm_verification`, it *cannot* be changed by any subsequent action.
4. **Verified User Requirement:** Only `UserId`s with a non-null `verifiedAt` timestamp can perform actions beyond `request_verification` and `confirm_verification` (e.g., `edit_avatar`, `edit_bio`).
5. **Event-Driven Communication:** The `UserVerified(UserId)` and `UserDeleted(UserId)` notifications *must* be emitted using the specified in-process event emitter for modular communication.
6. **Passwordless Authentication:** `UserAccount` will *not* manage user passwords. Authentication is solely handled through email verification links as described.

## Follow-up Answers (User Authentication)

* School domain allowlist management: Start static via env  (comma-separated). Later, add admin-only CRUD backed by a  collection; cache in-memory (TTL ~5m).
* Verification token invalidation: Single-use HMAC-signed tokens with 15–30 min TTL. On , validate signature/email/expiry, mark token used, invalidate any other active tokens for that email, and rate-limit  per email/IP.
* Sensitive config: Use  locally; in deploy, use platform secrets. Centralize config validation (TOKEN\_SECRET, TOKEN\_TTL\_MINUTES, ALLOWED\_SCHOOL\_DOMAINS, EMAIL\_API\_KEY, APP\_BASE\_URL, S3 creds).
* SSO + .edu: Users authenticate with institution SSO (e.g., Duo/IdP) tied to .edu emails; we still perform email-link verification. Username is immutable post-verify.

## Generate: UserAccount Concept Implementation and Tests (Do Not Change Spec)

Produce the implementation and tests strictly per spec and constraints. If a spec gap blocks you, list assumptions clearly and proceed conservatively.

Deliverables:

* src/concepts/UserAccount/UserAccountConcept.ts
* src/concepts/UserAccount/UserAccountConcept.test.ts

Constraints:

* Deno + TypeScript + MongoDB ()
* No cross-concept DB reads/calls; use identifiers and events
* Use  existing interface; emit ,

Auth Requirements:

* .edu allowlist (config-driven, later admin-manageable)
* Passwordless email-link verification (single-use, time-limited)
* Institution SSO expected upstream (assume session present when calling actions)
* Immutable username at verification

Output format:

* Start with a short bullet list of assumptions.
* Then ONLY two code blocks with full file paths and complete contents.

## Follow-up Answers (User Authentication)

* School domain allowlist management: Start static via env  (comma-separated). Later, add admin-only CRUD backed by a  collection; cache in-memory (TTL ~5m).
* Verification token invalidation: Single-use HMAC-signed tokens with 15–30 min TTL. On , validate signature/email/expiry, mark token used, invalidate any other active tokens for that email, and rate-limit  per email/IP.
* Sensitive config: Use  locally; in deploy, use platform secrets. Centralize config validation (TOKEN\_SECRET, TOKEN\_TTL\_MINUTES, ALLOWED\_SCHOOL\_DOMAINS, EMAIL\_API\_KEY, APP\_BASE\_URL, S3 creds).
* SSO + .edu: Users authenticate with institution SSO (e.g., Duo/IdP) tied to .edu emails; we still perform email-link verification. Username is immutable post-verify.

## Generate: UserAccount Concept Implementation and Tests (Do Not Change Spec)

Produce the implementation and tests strictly per spec and constraints. If a spec gap blocks you, list assumptions clearly and proceed conservatively.

Deliverables:

* src/concepts/UserAccount/UserAccountConcept.ts
* src/concepts/UserAccount/UserAccountConcept.test.ts

Constraints:

* Deno + TypeScript + MongoDB ()
* No cross-concept DB reads/calls; use identifiers and events
* Use  existing interface; emit ,

Auth Requirements:

* .edu allowlist (config-driven, later admin-manageable)
* Passwordless email-link verification (single-use, time-limited)
* Institution SSO expected upstream (assume session present when calling actions)
* Immutable username at verification

Output format:

* Start with a short bullet list of assumptions.
* Then ONLY two code blocks with full file paths and complete contents.
