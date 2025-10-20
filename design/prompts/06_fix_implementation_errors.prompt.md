# Fix UserAccount Implementation Errors - Follow-up

## Context
This is a follow-up to the previous UserAccount concept implementation. The tests are running but there are several implementation issues that need to be fixed.

## Current Status
- ✅ MongoDB connection is working perfectly
- ✅ 1 out of 6 test principles is PASSING (SSO Registration and Login Flow)
- ❌ 5 test principles are failing due to implementation issues

## Test Errors Found

### 1. Session Management Issues
```
AssertionError: Expected function to reject.
```
- Session expiration logic isn't working correctly
- Tests expect certain session validation scenarios to fail but they're not failing

### 2. Profile Management Issues
```
AssertionError: Expected actual: "undefined" to not be null or undefined: Frank should have a password hash initially.
AssertionError: Expected actual: "undefined" to not be null or undefined: Charlie should have a password hash stored.
```
- The implementation doesn't handle password hashes for users
- Tests expect users to have passwordHash fields but they're undefined

### 3. Account Lifecycle Issues
```
AssertionError: Expected error to be instance of "UserNotFoundError", but was "UserNotFoundError".
```
- Error type matching issues (same error type but instanceof check failing)

### 4. Error Handling Issues
```
AssertionError: Expected error message to include "Should throw an error for malformed session ID.", but got "input must be a 24 character hex string, 12 byte Uint8Array, or an integer".
```
- Error message format mismatch for malformed session IDs

## Important Change: Remove Password Functionality

**Please remove all password-related functionality from the implementation.** 

The system should use **pure SSO authentication only**:
- No `change_password` method
- No `passwordHash` fields in User model
- No password validation
- No hybrid authentication support

All users will authenticate through SSO providers only. The only actions should be:
- `register_or_login` (SSO only)
- `logout`
- `change_avatar`
- `change_bio` 
- `delete_account`
- `view_profile`

## Current Implementation Files
- `src/concepts/UserAccount/UserAccountConcept.ts` - Main implementation
- `src/concepts/UserAccount/UserAccountConcept.test.ts` - Test suite
- `src/concepts/UserAccount/UserAccountErrors.ts` - Error classes
- `src/concepts/UserAccount/mock-services.ts` - Mock services
- `src/concepts/UserAccount/fake-data.ts` - Test data

## Request
Please provide an updated `UserAccountConcept.ts` implementation that:

1. **Removes all password-related functionality**
2. **Fixes the session management issues**
3. **Fixes the error handling issues**
4. **Ensures all tests pass**

The implementation should be pure SSO-only authentication with no password support.

## Test Data Context
The tests are expecting:
- Users to be created via SSO only
- No password hashes in the database
- Proper session management and expiration
- Correct error types and messages
- Session deletion when accounts are deleted

Please provide the corrected implementation that addresses these issues.
