# Bidding Concept Test Results Analysis - SwapIt Marketplace System

## Project Context
You are working on a student marketplace system called "SwapIt" (CampusCloset) that enables verified users to list items, place bids, communicate through threads, and browse available listings. This is part of Assignment 4a for a Software Design course.

## Current Status
- **UserAccount concept**: Fully implemented and tested (100% pass rate)
- **ItemListing concept**: Fully implemented and tested (100% pass rate)
- **Bidding concept**: Implemented but has test failures (70% pass rate)

## Request
Please analyze the test results for the Bidding concept and identify what's causing the test failures. The core functionality appears to work, but there are issues with test isolation and error handling.

## Test Results Summary

### ✅ **Passing Tests (19/27):**
- **P1: Correctness - Core Functionality (4/6):**
  - ✅ should allow a user to place a bid on a listing
  - ✅ should retrieve all active bids for a listing, sorted by amount and timestamp
  - ✅ should retrieve the current highest bid ID for a listing
  - ✅ should return null for get_current_high if no active bids exist on a listing
  - ❌ should allow a bidder to withdraw their own active bid
  - ❌ should correctly update the current high bid after a high bid is withdrawn

- **P2: Robustness - Error Handling & Edge Cases (8/12):**
  - ✅ should reject placing a bid with a zero amount
  - ✅ should reject placing a bid with a negative amount
  - ✅ should reject placing a bid with a non-finite amount (NaN)
  - ❌ should reject withdrawing a bid that does not exist
  - ❌ should reject withdrawing a bid if the user is not the original bidder
  - ❌ should reject withdrawing a bid that has already been withdrawn
  - ✅ should handle multiple bids by the same user on the same listing
  - ✅ should maintain data integrity during concurrent bid placement
  - ✅ should handle bids on non-existent listings (conceptually, as foreign key independence)
  - ✅ should handle bids by non-existent users (conceptually, as foreign key independence)
  - ❌ should filter withdrawn bids from get_bids and get_current_high

- **P3: Performance (1/1):** ✅ All tests passing
- **P4: Usability (1/1):** ✅ All tests passing  
- **P5: Maintainability (1/1):** ✅ All tests passing
- **P6: Testability (1/1):** ✅ All tests passing

### ❌ **Failing Tests (8/27):**
All failures are related to the `withdraw_bid` functionality.

## Error Analysis

### **Primary Error Pattern:**
```
BidAlreadyWithdrawnError: Bid with ID [bidId] has already been withdrawn.
```

### **Secondary Error Pattern:**
```
AssertionError: Expected error to be instance of "BidNotFoundError", but was "TypeError".
AssertionError: Expected error to be instance of "UnauthorizedBidWithdrawalError", but was "TypeError".
```

## Current Implementation

### **BiddingConcept.ts - withdraw_bid method:**
```typescript
async withdraw_bid(bidId: BidId, bidder: UserId): Promise<void> {
    // Use findOneAndUpdate with conditions to handle all validation in one atomic operation
    const updateResult = await this.bidsCollection.findOneAndUpdate(
        { 
            _id: bidId,
            bidderId: bidder, // Ensure the bidder matches
            status: BidStatus.Active // Ensure the bid is still active
        },
        { $set: { status: BidStatus.Withdrawn } },
        { returnDocument: 'before' } // Get the document before the update
    );

    if (!updateResult.value) {
        // The bid either doesn't exist, is already withdrawn, or doesn't belong to this bidder
        // Let's check which case it is
        const existingBid = await this.bidsCollection.findOne({ _id: bidId });
        
        if (!existingBid) {
            throw new BidNotFoundError(bidId.toHexString());
        }
        
        if (existingBid.status === BidStatus.Withdrawn) {
            throw new BidAlreadyWithdrawnError(bidId.toHexString());
        }
        
        if (!existingBid.bidderId.equals(bidder)) {
            throw new UnauthorizedBidWithdrawalError(bidId.toHexString(), bidder.toHexString());
        }
        
        // If we get here, something unexpected happened
        throw new BidNotFoundError(bidId.toHexString());
    }

    const bid = updateResult.value;

    // Emit the withdrawal event
    const event: BidWithdrawnEvent = {
        bidId: bid._id.toHexString(),
        listingId: bid.listingId.toHexString(),
        bidderId: bid.bidderId.toHexString(),
        amount: bid.amount,
        timestamp: new Date(), // Timestamp of the withdrawal
    };
    this.eventBus.publish(BiddingEventTopics.BidWithdrawn, event);
}
```

### **Test Setup:**
```typescript
beforeEach(async () => {
    // P6: Testability - Isolate tests by clearing data and resetting mocks before each test.
    await bidsCollection.deleteMany({});
    mockEventBus.clearEvents();

    // Generate fresh IDs for each test to ensure isolation
    listingId_active = generateObjectId();
    listingId_no_bids = generateObjectId();
    bidderId_alpha = generateObjectId();
    bidderId_beta = generateObjectId();
});
```

## Questions for Analysis

1. **Why are bids showing as "already withdrawn" when they should be active?**
   - Is there a race condition in the test setup?
   - Are the ObjectIds being reused across tests?
   - Is the database cleanup not working properly?

2. **Why are some error assertions failing with TypeError instead of custom errors?**
   - Are the custom error classes not being imported correctly?
   - Is there a module boundary issue with error instanceof checks?

3. **What's causing the test isolation issues?**
   - Is the `beforeEach` cleanup sufficient?
   - Are there any shared state between tests?
   - Is the MongoDB connection being reused properly?

4. **Are there any issues with the withdraw_bid logic itself?**
   - Is the findOneAndUpdate query correct?
   - Are the error handling conditions proper?
   - Is the event emission working correctly?

## Expected Behavior
- Bids should be withdrawable by their original bidder
- Withdrawn bids should not appear in get_bids results
- Error handling should throw appropriate custom error types
- Tests should be isolated and not affect each other

Please analyze these issues and provide specific recommendations for fixing the failing tests while maintaining the correct functionality.

# response:

Let's break down the test failures for the Bidding concept in your SwapIt marketplace system.

The core problem areas are:
1.  **Test Isolation / `BidAlreadyWithdrawnError`:** This indicates a bid is being considered "already withdrawn" when the test expects it to be active, or there's an issue with how bid statuses are handled.
2.  **Custom Error Type Assertion (`TypeError`):** Tests expecting specific custom error types (e.g., `BidNotFoundError`) are receiving a generic `TypeError` during the `instanceof` check.
3.  **Logical Flaw in `withdraw_bid` Fallback:** A latent bug in the `withdraw_bid` method's error handling.

---

## Detailed Analysis and Recommendations

### 1. Why are bids showing as "already withdrawn" when they should be active?

**Failing Tests Affected:**
*   ❌ P1: should allow a bidder to withdraw their own active bid
*   ❌ P1: should correctly update the current high bid after a high bid is withdrawn
*   ❌ P2: should filter withdrawn bids from get\_bids and get\_current\_high (likely a cascade from failed withdrawal)

**Analysis:**
The `BidAlreadyWithdrawnError` occurs in your `withdraw_bid` method when `findOneAndUpdate` fails (meaning its query conditions weren't met), and then a subsequent `findOne` finds the bid with `status: BidStatus.Withdrawn`.

Let's re-examine the `withdraw_bid` logic's initial `findOneAndUpdate` condition:
```typescript
{
    _id: bidId,
    bidderId: bidder,
    status: BidStatus.Active // Crucial condition here
}
```
If `findOneAndUpdate` returns `null` for `updateResult.value`, it implies that at least one of these conditions was *not* met. The error `BidAlreadyWithdrawnError` means that when the code falls into the `if (!updateResult.value)` block, `existingBid.status === BidStatus.Withdrawn` evaluates to `true`.

This implies one of the following:

*   **Hypothesis A: Incorrect Test Setup / Pre-existing state:** The bid that the test intends to be `Active` is actually `Withdrawn` (or never `Active` in the first place) when `withdraw_bid` is called.
    *   This could be due to a bug in the test's `place_bid` setup, or a very subtle test isolation issue where `deleteMany({})` in `beforeEach` isn't fully effective, or an interaction with other tests. However, `deleteMany` for the `bidsCollection` is usually very robust.
*   **Hypothesis B: `BidStatus` Enum Mismatch in MongoDB (Most Likely Candidate):** The `BidStatus.Active` value used in the `findOneAndUpdate` query (which is typically a number if it's a standard TypeScript enum, e.g., `0`) does not match how the status is *actually stored* in the MongoDB document (e.g., it's stored as the string `"Active"`).
    *   If the database field `status` contains the string `"Active"`, but your `findOneAndUpdate` queries for `status: 0` (assuming `BidStatus.Active = 0`), then the `findOneAndUpdate` will *always* fail to find a match, even if the bid is logically active.
    *   When `findOneAndUpdate` fails, the code then performs `this.bidsCollection.findOne({ _id: bidId })`. This query only checks the `_id`. It *will* find the bid. Then, it checks `existingBid.status === BidStatus.Withdrawn`.
        *   If `existingBid.status` (e.g., `"Active"`) is *not* `BidStatus.Withdrawn` (e.g., `1`), and `bidderId` matches, it would fall through to the final (buggy) `throw new BidNotFoundError`.
        *   **Crucially, for `BidAlreadyWithdrawnError` to be thrown, `existingBid.status === BidStatus.Withdrawn` must be true.** This means if `findOneAndUpdate` failed due to status mismatch (e.g., querying for `0` but DB has `"Active"`), then `existingBid.status` (e.g., `"Active"`) being compared to `BidStatus.Withdrawn` (e.g., `1`) would be false, and this error wouldn't be thrown unless the bid *was actually* withdrawn in the DB.

The observation that `BidAlreadyWithdrawnError` is the primary failure suggests either:
1.  **A true test isolation issue** where bids are truly being marked `Withdrawn` prematurely by a previous test or a hidden mechanism.
2.  **A logical flaw in the test setup for active bids.** The tests aren't actually creating "active" bids, or they are creating bids and then immediately trying to withdraw them *after* something else has already marked them as withdrawn.

**Recommendations:**

1.  **Debug `BidStatus` Persistence:**
    *   **Crucial Debugging Step:** Add console logs **within your failing tests** to inspect the bid's actual status in the database *before* calling `withdraw_bid`.
        ```typescript
        // In a failing P1 test:
        const placedBidId = await biddingConcept.place_bid(...); // Assuming this returns bid ID
        const bidInDbAfterPlacement = await bidsConcept.bidsCollection.findOne({ _id: new ObjectId(placedBidId) });
        console.log(`[TEST DEBUG] Bid ${placedBidId} status immediately after placement:`, bidInDbAfterPlacement?.status);

        // Before calling withdraw_bid:
        const bidInDbBeforeWithdrawal = await biddingConcept.bidsCollection.findOne({ _id: new ObjectId(bidToWithdrawId) });
        console.log(`[TEST DEBUG] Bid ${bidToWithdrawId} status immediately before withdrawal attempt:`, bidInDbBeforeWithdrawal?.status);
        ```
    *   **Inspect MongoDB:** Manually inspect your MongoDB collection after a failed test run to see the `status` field's actual value and type. Is it a number (like `0` or `1`) or a string (`"Active"`, `"Withdrawn"`)?
    *   **Ensure consistent `BidStatus` usage:** If your enum is `enum BidStatus { Active, Withdrawn }` (numeric), ensure you're not trying to store/query with string values, and vice versa. If you're using a MongoDB driver that doesn't handle enums automatically, you might need to convert them (e.g., `BidStatus.Active.toString()` for string enums).
    *   **If `findOneAndUpdate` is always failing because `status: BidStatus.Active` condition is never met, but the bid *is* active:** This points to a mismatch between the enum value and the stored value.

2.  **Verify Test Logic for `P1` tests:**
    *   Ensure the `P1` tests explicitly create *active* bids and that there isn't any accidental "double withdrawal" logic or premature state change within a single test's execution.

### 2. Why are some error assertions failing with TypeError instead of custom errors?

**Failing Tests Affected:**
*   ❌ P2: should reject withdrawing a bid that does not exist (`TypeError` instead of `BidNotFoundError`)
*   ❌ P2: should reject withdrawing a bid if the user is not the original bidder (`TypeError` instead of `UnauthorizedBidWithdrawalError`)
*   ❌ P2: should reject withdrawing a bid that has already been withdrawn (If it expects `BidAlreadyWithdrawnError` but gets `TypeError` on assertion)

**Analysis:**
This is a classic issue in JavaScript/TypeScript testing environments, especially with tools like Jest. The `instanceof` operator relies on the prototype chain. If a custom error class (e.g., `BidNotFoundError`) is imported multiple times, or if the test runner loads modules in a way that creates separate "instances" of the class constructor, `error instanceof BidNotFoundError` can return `false` even if the error was indeed `new BidNotFoundError()`. The error *exists*, but its prototype chain doesn't match the *specific class constructor instance* the `instanceof` check is comparing against.

**Recommendations:**

1.  **Use `error.name` for assertion:** This is the most common and robust workaround.
    *   Modify your test assertions from:
        ```typescript
        await expect(biddingConcept.withdraw_bid(nonExistentBidId, bidderId_alpha))
              .rejects.toBeInstanceOf(BidNotFoundError);
        ```
    *   To:
        ```typescript
        await expect(biddingConcept.withdraw_bid(nonExistentBidId, bidderId_alpha))
              .rejects.toHaveProperty('name', 'BidNotFoundError');
        // Or, more explicitly:
        await expect(biddingConcept.withdraw_bid(nonExistentBidId, bidderId_alpha))
              .rejects.toThrow(expect.objectContaining({ name: 'BidNotFoundError' }));
        ```
    *   Ensure your custom error classes correctly set their `name` property (which they usually do by extending `Error`).

2.  **Centralize Error Definitions:** Ensure all your custom error classes are defined in a single file (e.g., `src/errors.ts`) and that both your `BiddingConcept` implementation and your test files import them from *that exact same path*. This reduces the chance of module duplication.

### 3. What's causing the test isolation issues?

**Analysis:**
The `beforeEach` setup (`await bidsCollection.deleteMany({});` and `mockEventBus.clearEvents();`) is standard and generally effective for ensuring data and mock states are clean. `generateObjectId()` is also good for preventing ID collisions.

However, the `BidAlreadyWithdrawnError` in `P1` tests strongly hints at an isolation problem, even if it's subtle. If the `BidStatus` enum mismatch (from point 1) is ruled out, then true isolation issues are the next suspect.

**Recommendations:**

1.  **Confirm Full Database Cleanup:**
    *   If you have *other* collections related to bidding (e.g., an `archived_bids` collection or a `listing` collection that might hold bid IDs), ensure they are also cleared if they could influence bid state or retrieval.
    *   Confirm your `bidsCollection` instance is genuinely pointing to the test database and not accidentally a shared development database.

2.  **Review Test Dependencies:**
    *   Are there any global mocks or singletons that are not being reset in `beforeEach`?
    *   Is the `eventBus` mock truly isolating events for each test, or could a previous test's published event be influencing a subsequent test's `withdraw_bid` logic if there are listeners outside the `BiddingConcept` itself that aren't mocked? (Less likely for `BidAlreadyWithdrawnError` but good to check).

3.  **Order of Tests (Temporary Debugging):**
    *   While not a fix, sometimes running tests individually or in a specific order can help reveal if a particular test is "polluting" the state for others. For instance, run just the failing `P1` test in isolation.

### 4. Are there any issues with the `withdraw_bid` logic itself?

**Analysis:**

1.  **`findOneAndUpdate` query:** `_id`, `bidderId`, `status: BidStatus.Active` is correct for atomically checking and updating a bid. `returnDocument: 'before'` is also correct for retrieving the state before the update.
2.  **Error handling conditions:** The sequence of checks (`!existingBid`, `existingBid.status === BidStatus.Withdrawn`, `!existingBid.bidderId.equals(bidder)`) is logically sound for attributing the specific reason `findOneAndUpdate` failed.
3.  **Latent Bug: The Final `throw new BidNotFoundError`:**
    ```typescript
    // ... inside if (!updateResult.value) { ... }
    // If we get here, something unexpected happened
    throw new BidNotFoundError(bidId.toHexString()); // <-- THIS IS A BUG
    ```
    If `existingBid` was found, its `status` was *not* `Withdrawn`, and its `bidderId` *did* match the caller's `bidder` ID, then the `findOneAndUpdate` must have failed *only* because of the `status: BidStatus.Active` condition. But if `existingBid` *also* shows `status: BidStatus.Active`, this is a logical contradiction. It implies the bid was active and belonged to the bidder, but `findOneAndUpdate` couldn't update it. This scenario should not throw `BidNotFoundError`, as the bid *does* exist. It indicates a deeper, unexpected problem or a very rare race condition where the status changed *between* `findOneAndUpdate` failing and `findOne` succeeding.

**Recommendations:**

1.  **Fix the Latent Bug in `withdraw_bid` Fallback:**
    *   Change the last `throw new BidNotFoundError(bidId.toHexString());` to a more appropriate internal error or a more general `BidWithdrawalFailedError`.
        ```typescript
        // If we get here, it implies the bid exists, is active, belongs to the user,
        // but the atomic update failed for an unknown reason.
        throw new Error(`Internal error: Bid ${bidId.toHexString()} exists, is active, and belongs to user ${bidder.toHexString()} but could not be withdrawn due to an unhandled internal state.`);
        ```
    *   This fix will not resolve your current test failures directly but prevents a future logical bug.

---

## Summary of Actionable Steps

1.  **Implement `error.name` assertions in tests:** This is the quickest fix for all `TypeError` failures.
2.  **Thoroughly debug `BidStatus` handling/persistence:**
    *   Add console logs in failing `P1` tests and `withdraw_bid` method to inspect the actual `status` value of bids in MongoDB before, during, and after withdrawal attempts.
    *   Verify how `BidStatus` enum values (numeric vs. string) are being stored and queried in MongoDB. This is the prime suspect for the `BidAlreadyWithdrawnError` in your `P1` tests.
3.  **Fix the latent bug in `withdraw_bid`'s final fallback error:** Change the `BidNotFoundError` to a more appropriate generic error in the final `if` block.
4.  **Review `get_bids` and `get_current_high`:** Ensure these methods explicitly filter for `status: BidStatus.Active` to correctly exclude withdrawn bids, once `withdraw_bid` reliably marks them.

By focusing on these steps, especially the debugging of `BidStatus` persistence, you should be able to pinpoint and resolve the underlying causes of your failing tests.

---

# Follow-up Analysis and Specific Fixes Needed

## Concerns with Previous Analysis

Your analysis was very thorough, but there are a few areas that need clarification and specific fixes for our implementation:

### 1. **BidStatus Enum Type Clarification**
You assumed numeric enums (`0`, `1`), but our actual implementation uses **string-based enums**:
```typescript
export enum BidStatus {
    Active = "Active",
    Withdrawn = "Withdrawn",
}
```
This means the mismatch hypothesis is still valid, but the values would be `"Active"` vs `"Active"` (which should match) rather than `0` vs `"Active"`.

### 2. **Test Framework Context**
We're using **Deno's built-in testing framework**, not Jest. The `instanceof` issue is still valid, but the context is different.

### 3. **Missing Parallel Test Considerations**
The analysis didn't fully account for potential race conditions in test execution, especially with our `beforeEach` cleanup and parallel test runs.

## Specific Fixes Needed

### 1. **Fix BidStatus Persistence Issues**
- Ensure `BidStatus` enum values are consistently stored and queried as strings
- Add debugging logs to verify actual status values in MongoDB
- Fix any mismatches between enum values and database storage

### 2. **Fix Error Type Assertions**
- Replace `instanceof` checks with `error.name` checks for better compatibility
- Ensure custom error classes properly set their `name` property
- Update all test assertions to use the more robust error checking approach

### 3. **Fix Test Isolation Issues**
- Ensure `beforeEach` cleanup is working correctly
- Add proper error handling for race conditions
- Verify that test data is properly isolated between tests

### 4. **Fix the Latent Bug in `withdraw_bid`**
- Replace the final `BidNotFoundError` fallback with a more appropriate error
- Add better error handling for unexpected internal states

## Request

Please provide:
1. **Updated `BiddingConcept.ts`** with fixes for BidStatus handling and error management
2. **Updated `BiddingConcept.test.ts`** with proper error assertions and debugging logs
3. **Updated `BiddingErrors.ts`** if needed for better error handling
4. **Specific debugging steps** to verify the fixes work correctly

Focus on making the implementation robust and the tests reliable, especially for the failing P1 and P2 test scenarios.
# response:

Okay, let's address these concerns and implement the necessary fixes and debugging steps.

The primary goal is to make the `withdraw_bid` functionality robust, ensure test isolation, and correctly handle error assertions, keeping Deno's testing framework and string-based enums in mind.

***

## 1. `BiddingErrors.ts` - Updated for Robustness

We'll introduce a new error type for the unexpected internal state.

```typescript
// src/BiddingErrors.ts (or wherever your errors are defined)

import { ObjectId } from "https://deno.land/x/mongo@v0.32.0/mod.ts"; // Assuming ObjectId import path

export class CustomError extends Error {
    constructor(message: string, name: string) {
        super(message);
        this.name = name;
        // This is necessary when extending Error in older JS/TS environments
        // but often handled by modern compilers. Good practice to include.
        Object.setPrototypeOf(this, CustomError.prototype);
    }
}

export class BidNotFoundError extends CustomError {
    constructor(bidId: string) {
        super(`Bid with ID ${bidId} not found.`, "BidNotFoundError");
    }
}

export class BidAlreadyWithdrawnError extends CustomError {
    constructor(bidId: string) {
        super(`Bid with ID ${bidId} has already been withdrawn.`, "BidAlreadyWithdrawnError");
    }
}

export class UnauthorizedBidWithdrawalError extends CustomError {
    constructor(bidId: string, bidderId: string) {
        super(`User ${bidderId} is not authorized to withdraw bid ${bidId}.`, "UnauthorizedBidWithdrawalError");
    }
}

export class InvalidBidAmountError extends CustomError {
    constructor(amount: number | string) {
        super(`Invalid bid amount: ${amount}. Amount must be a positive finite number.`, "InvalidBidAmountError");
    }
}

// New error for unexpected internal failures during withdrawal
export class BidWithdrawalFailedUnexpectedlyError extends CustomError {
    constructor(bidId: string, details: string = "An unexpected error occurred during bid withdrawal.") {
        super(`Failed to withdraw bid ${bidId}: ${details}`, "BidWithdrawalFailedUnexpectedlyError");
    }
}
```

***

## 2. `BiddingConcept.ts` - Updated `withdraw_bid` Logic

The main changes here are:
1.  **Debugging Logs**: Added `console.log` statements to trace the execution path and bid status.
2.  **Latent Bug Fix**: Replaced the final `BidNotFoundError` with the new `BidWithdrawalFailedUnexpectedlyError`.
3.  **BidStatus Consistency**: Double-check that `BidStatus.Active` and `BidStatus.Withdrawn` are correctly used as strings. Since the enum is string-based, `status: BidStatus.Active` will correctly query for `{ status: "Active" }`.

```typescript
// src/BiddingConcept.ts (snippet for withdraw_bid method)
// Assuming other necessary imports like BidId, UserId, BidStatus, BidWithdrawnEvent, BiddingEventTopics, etc.

import { Collection, ObjectId, FindAndModifyOptions } from "https://deno.land/x/mongo@v0.32.0/mod.ts";
import { 
    BidNotFoundError, 
    BidAlreadyWithdrawnError, 
    UnauthorizedBidWithdrawalError,
    BidWithdrawalFailedUnexpectedlyError // Import the new error
} from "./BiddingErrors.ts"; // Adjust path as needed

// Define your Bid and Event types, BidId, UserId, BidStatus here or import them
// Example (placeholders if not provided):
export type BidId = ObjectId;
export type UserId = ObjectId;
export type ListingId = ObjectId;

export enum BidStatus {
    Active = "Active",
    Withdrawn = "Withdrawn",
}

export interface Bid {
    _id: BidId;
    listingId: ListingId;
    bidderId: UserId;
    amount: number;
    timestamp: Date;
    status: BidStatus;
}

export interface BidWithdrawnEvent {
    bidId: string;
    listingId: string;
    bidderId: string;
    amount: number;
    timestamp: Date;
}

// Mock EventBus for example
class MockEventBus {
    private events: Map<string, any[]> = new Map();
    publish(topic: string, event: any) {
        if (!this.events.has(topic)) {
            this.events.set(topic, []);
        }
        this.events.get(topic)?.push(event);
        // console.log(`[EventBus] Published to ${topic}:`, event); // Keep this for debugging
    }
    clearEvents() {
        this.events.clear();
    }
    getEvents(topic: string) {
        return this.events.get(topic) || [];
    }
}
const BiddingEventTopics = {
    BidWithdrawn: "BidWithdrawn",
    // ... other topics
};

export class BiddingConcept {
    private bidsCollection: Collection<Bid>;
    private eventBus: MockEventBus; // Assuming eventBus is injected/mocked

    constructor(bidsCollection: Collection<Bid>, eventBus: MockEventBus) {
        this.bidsCollection = bidsCollection;
        this.eventBus = eventBus;
    }

    // ... other methods like place_bid, get_bids, get_current_high

    async withdraw_bid(bidId: BidId, bidder: UserId): Promise<void> {
        console.log(`[DEBUG - withdraw_bid] Attempting to withdraw bid ${bidId.toHexString()} by user ${bidder.toHexString()}`);

        const updateResult = await this.bidsCollection.findOneAndUpdate(
            { 
                _id: bidId,
                bidderId: bidder, // Ensure the bidder matches
                status: BidStatus.Active // Ensure the bid is still active
            },
            { $set: { status: BidStatus.Withdrawn } },
            { returnDocument: 'before' } as FindAndModifyOptions // Get the document before the update
        );

        if (!updateResult.value) {
            console.log(`[DEBUG - withdraw_bid] findOneAndUpdate failed for bid ${bidId.toHexString()}. Checking specific reasons...`);
            
            // The bid either doesn't exist, is already withdrawn, or doesn't belong to this bidder
            const existingBid = await this.bidsCollection.findOne({ _id: bidId });
            
            if (!existingBid) {
                console.log(`[DEBUG - withdraw_bid] Bid ${bidId.toHexString()} does not exist.`);
                throw new BidNotFoundError(bidId.toHexString());
            }
            
            console.log(`[DEBUG - withdraw_bid] Existing bid ${bidId.toHexString()} found with status: ${existingBid.status}, bidder: ${existingBid.bidderId.toHexString()}`);

            if (existingBid.status === BidStatus.Withdrawn) {
                console.log(`[DEBUG - withdraw_bid] Bid ${bidId.toHexString()} is already withdrawn.`);
                throw new BidAlreadyWithdrawnError(bidId.toHexString());
            }
            
            if (!existingBid.bidderId.equals(bidder)) {
                console.log(`[DEBUG - withdraw_bid] User ${bidder.toHexString()} is not the original bidder for bid ${bidId.toHexString()}. Original bidder: ${existingBid.bidderId.toHexString()}`);
                throw new UnauthorizedBidWithdrawalError(bidId.toHexString(), bidder.toHexString());
            }
            
            // If we get here, it means:
            // 1. The bid exists (`existingBid` is not null).
            // 2. The bid is not `Withdrawn` (`existingBid.status` is not "Withdrawn").
            // 3. The `bidderId` matches (`existingBid.bidderId.equals(bidder)` is true).
            // BUT `findOneAndUpdate` still returned `null`.
            // This is an unexpected state, possibly a very rare race condition or an underlying DB issue
            // where `status: BidStatus.Active` in the find query didn't match, but a subsequent direct find
            // shows it's still active.
            console.error(`[ERROR - withdraw_bid] Unexpected failure for bid ${bidId.toHexString()}: bid exists, active, and belongs to bidder, but findOneAndUpdate failed.`);
            throw new BidWithdrawalFailedUnexpectedlyError(bidId.toHexString(), "Atomic update failed without clear reason.");
        }

        const bid = updateResult.value;
        console.log(`[DEBUG - withdraw_bid] Successfully withdrew bid ${bid._id.toHexString()}.`);

        // Emit the withdrawal event
        const event: BidWithdrawnEvent = {
            bidId: bid._id.toHexString(),
            listingId: bid.listingId.toHexString(),
            bidderId: bid.bidderId.toHexString(),
            amount: bid.amount,
            timestamp: new Date(), // Timestamp of the withdrawal
        };
        this.eventBus.publish(BiddingEventTopics.BidWithdrawn, event);
    }
}
```

***

## 3. `BiddingConcept.test.ts` - Updated Tests

Key changes:
1.  **Deno `asserts` import**: Using `assertRejects` for cleaner error assertions.
2.  **Aggressive Logging**: Added `console.log` statements in `beforeEach` and around `withdraw_bid` calls in the failing tests to truly understand the state.
3.  **Error Assertions**: Changed `expect().rejects.toBeInstanceOf` (conceptual) to Deno's `assertRejects`.

```typescript
// BiddingConcept.test.ts

import {
    assertEquals,
    assertRejects,
    assert,
} from "https://deno.land/std/assert/mod.ts";
import { MongoClient, Collection, ObjectId } from "https://deno.land/x/mongo@v0.32.0/mod.ts";

import {
    BiddingConcept,
    Bid,
    BidStatus,
    BidId,
    UserId,
    ListingId,
    BidWithdrawnEvent,
    BiddingEventTopics,
} from "./BiddingConcept.ts"; // Adjust path as necessary
import {
    BidNotFoundError,
    BidAlreadyWithdrawnError,
    UnauthorizedBidWithdrawalError,
    InvalidBidAmountError,
    BidWithdrawalFailedUnexpectedlyError, // Import the new error
} from "./BiddingErrors.ts"; // Adjust path as necessary

// Mock EventBus (if not already defined in BiddingConcept.ts)
class MockEventBus {
    private events: Map<string, any[]> = new Map();
    publish(topic: string, event: any) {
        if (!this.events.has(topic)) {
            this.events.set(topic, []);
        }
        this.events.get(topic)?.push(event);
        // console.log(`[MockEventBus] Published to ${topic}:`, event); // Enable for deeper event debugging
    }
    clearEvents() {
        this.events.clear();
    }
    getEvents(topic: string) {
        return this.events.get(topic) || [];
    }
}

// --- Test Setup ---
const client = new MongoClient();
await client.connect("mongodb://127.0.0.1:27017/swapit_test_db"); // Connect to a dedicated test DB
const db = client.database();
let bidsCollection: Collection<Bid>;
let biddingConcept: BiddingConcept;
let mockEventBus: MockEventBus;

// Global IDs for test isolation
let listingId_active: ListingId;
let listingId_no_bids: ListingId;
let bidderId_alpha: UserId;
let bidderId_beta: UserId;

// Helper to generate new ObjectIds for robust test isolation
function generateObjectId(): ObjectId {
    return new ObjectId();
}

// P6: Testability - Isolate tests by clearing data and resetting mocks before each test.
Deno.test({
    name: "Bidding Concept Tests",
    async fn() {
        bidsCollection = db.collection<Bid>("bids");
        mockEventBus = new MockEventBus();
        biddingConcept = new BiddingConcept(bidsCollection, mockEventBus);

        // Utility to place a bid for test setup
        const placeBid = async (
            listingId: ListingId,
            bidderId: UserId,
            amount: number
        ): Promise<BidId> => {
            const bid: Bid = {
                _id: generateObjectId(),
                listingId,
                bidderId,
                amount,
                timestamp: new Date(),
                status: BidStatus.Active,
            };
            await bidsCollection.insertOne(bid);
            console.log(`[TEST SETUP] Placed bid ${bid._id.toHexString()} on listing ${listingId.toHexString()} by user ${bidderId.toHexString()} with amount ${amount}. Status: ${bid.status}`);
            return bid._id;
        };

        Deno.test({
            name: "beforeEach setup",
            // This setup function runs before each sub-test
            async fn() {
                console.log("\n[TEST HOOK] Running beforeEach setup...");
                await bidsCollection.deleteMany({});
                mockEventBus.clearEvents();

                listingId_active = generateObjectId();
                listingId_no_bids = generateObjectId();
                bidderId_alpha = generateObjectId();
                bidderId_beta = generateObjectId();
                console.log("[TEST HOOK] beforeEach setup complete. DB cleared, mocks reset, new IDs generated.");
            },
            // The tests below are now sub-tests within this setup context.
            // This ensures `beforeEach` runs for each 'Deno.test' block.

            // --- P1: Correctness - Core Functionality ---

            // ✅ should allow a user to place a bid on a listing (assuming this still passes)
            "P1.1: should allow a user to place a bid on a listing": async () => {
                await placeBid(listingId_active, bidderId_alpha, 100);
                const bidCount = await bidsCollection.countDocuments({ listingId: listingId_active });
                assertEquals(bidCount, 1);
            },

            // ❌ P1.5: should allow a bidder to withdraw their own active bid
            "P1.5: should allow a bidder to withdraw their own active bid": async () => {
                const bidId = await placeBid(listingId_active, bidderId_alpha, 100);
                
                // --- DEBUGGING LOGS ---
                const bidInDbBeforeWithdrawal = await bidsCollection.findOne({ _id: bidId });
                console.log(`[TEST DEBUG P1.5] Bid ${bidId.toHexString()} status before withdrawal attempt: ${bidInDbBeforeWithdrawal?.status}`);
                
                await biddingConcept.withdraw_bid(bidId, bidderId_alpha);
                
                const withdrawnBid = await bidsCollection.findOne({ _id: bidId });
                assertEquals(withdrawnBid?.status, BidStatus.Withdrawn);
                assert(mockEventBus.getEvents(BiddingEventTopics.BidWithdrawn).length === 1, "BidWithdrawn event not emitted.");
                assertEquals((mockEventBus.getEvents(BiddingEventTopics.BidWithdrawn)[0] as BidWithdrawnEvent).bidId, bidId.toHexString());
            },

            // ❌ P1.6: should correctly update the current high bid after a high bid is withdrawn
            "P1.6: should correctly update the current high bid after a high bid is withdrawn": async () => {
                const bidId1 = await placeBid(listingId_active, bidderId_alpha, 100);
                const bidId2 = await placeBid(listingId_active, bidderId_beta, 150); // This should be the highest
                const bidId3 = await placeBid(listingId_active, bidderId_alpha, 200); // New highest

                let currentHigh = await biddingConcept.get_current_high(listingId_active);
                assertEquals(currentHigh?.bidId.toHexString(), bidId3.toHexString(), "Initial highest bid is incorrect.");

                // --- DEBUGGING LOGS ---
                const bid3InDbBeforeWithdrawal = await bidsCollection.findOne({ _id: bidId3 });
                console.log(`[TEST DEBUG P1.6] Bid ${bidId3.toHexString()} status before withdrawal attempt: ${bid3InDbBeforeWithdrawal?.status}`);

                await biddingConcept.withdraw_bid(bidId3, bidderId_alpha); // Withdraw the highest bid

                const withdrawnBid3 = await bidsCollection.findOne({ _id: bidId3 });
                assertEquals(withdrawnBid3?.status, BidStatus.Withdrawn, "Highest bid was not marked as withdrawn.");

                currentHigh = await biddingConcept.get_current_high(listingId_active);
                assertEquals(currentHigh?.bidId.toHexString(), bidId2.toHexString(), "Highest bid did not correctly update after withdrawal.");
            },

            // --- P2: Robustness - Error Handling & Edge Cases ---

            // ✅ should reject placing a bid with a zero amount (assuming this still passes)
            "P2.1: should reject placing a bid with a zero amount": async () => {
                await assertRejects(
                    async () => await placeBid(listingId_active, bidderId_alpha, 0),
                    InvalidBidAmountError,
                    "Expected InvalidBidAmountError for zero amount."
                );
            },

            // ❌ P2.4: should reject withdrawing a bid that does not exist
            "P2.4: should reject withdrawing a bid that does not exist": async () => {
                const nonExistentBidId = generateObjectId();
                console.log(`[TEST DEBUG P2.4] Attempting to withdraw non-existent bid ${nonExistentBidId.toHexString()}`);
                
                await assertRejects(
                    async () => await biddingConcept.withdraw_bid(nonExistentBidId, bidderId_alpha),
                    BidNotFoundError,
                    "Expected BidNotFoundError for non-existent bid."
                );
            },

            // ❌ P2.5: should reject withdrawing a bid if the user is not the original bidder
            "P2.5: should reject withdrawing a bid if the user is not the original bidder": async () => {
                const bidId = await placeBid(listingId_active, bidderId_alpha, 100);
                
                console.log(`[TEST DEBUG P2.5] Attempting to withdraw bid ${bidId.toHexString()} (original bidder: ${bidderId_alpha.toHexString()}) with unauthorized user ${bidderId_beta.toHexString()}`);
                const bidInDbBeforeAttempt = await bidsCollection.findOne({ _id: bidId });
                console.log(`[TEST DEBUG P2.5] Bid status before unauthorized withdrawal attempt: ${bidInDbBeforeAttempt?.status}`);

                await assertRejects(
                    async () => await biddingConcept.withdraw_bid(bidId, bidderId_beta),
                    UnauthorizedBidWithdrawalError,
                    "Expected UnauthorizedBidWithdrawalError for wrong bidder."
                );

                const bidAfterAttempt = await bidsCollection.findOne({ _id: bidId });
                assertEquals(bidAfterAttempt?.status, BidStatus.Active, "Bid status should remain Active after failed unauthorized withdrawal.");
            },

            // ❌ P2.6: should reject withdrawing a bid that has already been withdrawn
            "P2.6: should reject withdrawing a bid that has already been withdrawn": async () => {
                const bidId = await placeBid(listingId_active, bidderId_alpha, 100);
                
                console.log(`[TEST DEBUG P2.6] Withdrawing bid ${bidId.toHexString()} for the first time...`);
                await biddingConcept.withdraw_bid(bidId, bidderId_alpha); // First withdrawal
                
                const bidInDbAfterFirstWithdrawal = await bidsCollection.findOne({ _id: bidId });
                console.log(`[TEST DEBUG P2.6] Bid ${bidId.toHexString()} status after first withdrawal: ${bidInDbAfterFirstWithdrawal?.status}`);

                console.log(`[TEST DEBUG P2.6] Attempting to withdraw bid ${bidId.toHexString()} again...`);
                await assertRejects(
                    async () => await biddingConcept.withdraw_bid(bidId, bidderId_alpha),
                    BidAlreadyWithdrawnError,
                    "Expected BidAlreadyWithdrawnError for already withdrawn bid."
                );
            },

            // ❌ P2.12: should filter withdrawn bids from get_bids and get_current_high
            "P2.12: should filter withdrawn bids from get_bids and get_current_high": async () => {
                const bidId1 = await placeBid(listingId_active, bidderId_alpha, 100);
                const bidId2 = await placeBid(listingId_active, bidderId_beta, 150);
                const bidId3 = await placeBid(listingId_active, bidderId_alpha, 200);

                await biddingConcept.withdraw_bid(bidId2, bidderId_beta); // Withdraw middle bid

                // Verify get_bids filters withdrawn bids
                const activeBids = await biddingConcept.get_bids(listingId_active);
                assertEquals(activeBids.length, 2, "get_bids should return only active bids.");
                assert(!activeBids.some(b => b.bidId.equals(bidId2)), "Withdrawn bid should not be in active bids list.");

                // Verify get_current_high filters withdrawn bids
                const currentHigh = await biddingConcept.get_current_high(listingId_active);
                assertEquals(currentHigh?.bidId.toHexString(), bidId3.toHexString(), "get_current_high should ignore withdrawn bids.");
            },

            // --- Other passing tests would follow here ---
            // Ensure all other passing tests are also within this Deno.test block to utilize the `beforeEach` setup.
            // Example:
            // "P1.2: should retrieve all active bids for a listing, sorted by amount and timestamp": async () => { /* ... */ },
            // "P1.3: should retrieve the current highest bid ID for a listing": async () => { /* ... */ },
            // "P1.4: should return null for get_current_high if no active bids exist on a listing": async () => { /* ... */ },
            // ... and so on for P2.1, P2.2, P2.3, P2.7 to P2.11, P3, P4, P5, P6
        });
    },
    // Teardown after all tests in the file have run
    async afterAll() {
        console.log("\n[TEST HOOK] Running afterAll teardown...");
        await bidsCollection.deleteMany({}); // Clean up one last time
        await client.close();
        console.log("[TEST HOOK] afterAll teardown complete. MongoDB client closed.");
    }
});
```

**Note on `get_bids` and `get_current_high`:**
For `P2.12` to pass, your `get_bids` and `get_current_high` methods *must* explicitly filter bids by `status: BidStatus.Active`. If they currently fetch all bids regardless of status, they need to be updated.

Example for `get_bids` (conceptual, adjust to your actual implementation):

```typescript
// Inside BiddingConcept.ts
async get_bids(listingId: ListingId): Promise<Bid[]> {
    return await this.bidsCollection.find({ 
        listingId: listingId,
        status: BidStatus.Active // Crucial filter
    }).sort({ amount: 1, timestamp: 1 }).toArray();
}

async get_current_high(listingId: ListingId): Promise<Bid | null> {
    const highestBid = await this.bidsCollection.find({
        listingId: listingId,
        status: BidStatus.Active // Crucial filter
    }).sort({ amount: -1, timestamp: 1 }).limit(1).toArray();
    
    return highestBid.length > 0 ? highestBid[0] : null;
}
```

***

## 4. Specific Debugging Steps to Verify Fixes

After implementing the code changes:

1.  **Run Your Tests with Deno:**
    ```bash
    deno test BiddingConcept.test.ts --allow-net --allow-read --allow-env
    ```
    (Adjust `--allow-net`, `--allow-read`, `--allow-env` as per your Deno permissions needed for MongoDB connection).

2.  **Analyze Console Output:**
    *   **Focus on `[DEBUG - withdraw_bid]` logs:** Trace the execution path for each `withdraw_bid` call, especially for the failing tests (`P1.5`, `P1.6`, `P2.4`, `P2.5`, `P2.6`, `P2.12`).
    *   **`[TEST SETUP]` logs:** Confirm that bids are created as `Active` initially.
    *   **`[TEST DEBUG Px.x]` logs:** Check the `BidStatus` immediately before and after withdrawal attempts.
    *   **Look for `findOneAndUpdate failed` messages:** If these appear followed by an unexpected status, it indicates a mismatch.

3.  **Inspect MongoDB Directly (if needed):**
    *   If the console logs don't fully explain the behavior, use a MongoDB client (e.g., `mongosh`) to connect to your `swapit_test_db`.
    *   **Before running tests:** `db.bids.find({})` - should be empty.
    *   **After a failing test run:** `db.bids.find({})` - inspect the actual `status` values in the `bids` collection for the `ObjectId`s that were involved in the failing tests. This is the ultimate source of truth for persistence.

    *   **Key Question:** If a test fails with `BidAlreadyWithdrawnError`, is the bid's `status` field in MongoDB *actually* `"Withdrawn"` at the point where `findOneAndUpdate` failed?
        *   If **YES**: There's a subtle test isolation issue where the bid got withdrawn unexpectedly *before* the intended `withdraw_bid` call. (Less likely with `deleteMany` and `generateObjectId` for each test, but possible if parallel test execution causes very tricky timing issues or a bug in `place_bid` sets it to `Withdrawn`.)
        *   If **NO** (i.e., it's still `"Active"`): Then `findOneAndUpdate` is failing for some other reason, most likely the `status: BidStatus.Active` condition itself, implying a mismatch between how `BidStatus.Active` is interpreted by the MongoDB driver versus how it's stored, even with string enums. This would be very unusual but worth checking.

By following these steps, you should be able to precisely identify the remaining issues and achieve a 100% pass rate for your Bidding concept tests. The logging is crucial for understanding the dynamic state during test execution.