---
timestamp: 'Thu Oct 16 2025 13:41:35 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_134135.40394c6e.md]]'
content_id: 4c0296691bf7bffd904925e7665416c2d7ba1852cedda32636828ade9a76adb1
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
