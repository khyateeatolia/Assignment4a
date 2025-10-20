---
timestamp: 'Sat Oct 18 2025 16:28:31 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251018_162831.e6a39e19.md]]'
content_id: 600d26b79f9b9541c35a1814b3295ca525d4d6085ae9cba9b5bee9d01a24c47a
---

# response:

To provide comprehensive fake testing data for your `UserAccountConcept`, I've structured the output into a single TypeScript file. This file exports an object `fakeTestData` which contains two arrays: `mockPendingVerifications` and `mockUserAccounts`. These arrays represent the states of your MongoDB collections (`pending_verifications` and `users` respectively) for various testing scenarios.

This data covers:

* Different user lifecycle stages (pending, verified, with profile).
* Various school domains, including `.edu`, `.ac.uk`, `.de`, etc.
* Diverse usernames, avatar states, and bio lengths.
* Edge cases like very long bios, empty bios, username conflicts, and different token states (active, expired, used).
* Realistic timestamps for creation, updates, and verification.

You can easily import and use this data in your `UserAccountConcept.test.ts` file by iterating over the arrays and inserting the documents into your test database's collections during `beforeEach` or specific test setups.

**File: `src/concepts/UserAccount/fakeTestData.ts`**

```typescript
// src/concepts/UserAccount/fakeTestData.ts

import { EmailAddress, UserId, VerificationToken } from "./UserAccountConcept.ts";

// --- Type Definitions for Mock Data ---

/**
 * Represents a document in the 'pending_verifications' collection.
 */
export type MockPendingVerification = {
    _id: VerificationToken;
    email: EmailAddress;
    // 'pending' means active and not yet used/expired.
    // 'used' means the token was successfully consumed for verification.
    // 'expired' means the token's expiry date has passed.
    status: 'pending' | 'used' | 'expired';
    expiry: Date;
    createdAt: Date;
};

/**
 * Represents a document in the 'users' collection.
 */
export type MockUserAccount = {
    _id: UserId;
    email: EmailAddress;
    username: string;
    isVerified: boolean;
    emailVerifiedAt?: Date;
    avatarUrl?: string;
    bio?: string;
    createdAt: Date;
    updatedAt: Date;
    // Optional flag for test scenarios (e.g., to easily identify a user for username conflict tests)
    isUsernameConflictCandidate?: boolean;
};

/**
 * The main structure holding all generated fake testing data.
 */
export type FakeTestData = {
    mockPendingVerifications: MockPendingVerification[];
    mockUserAccounts: MockUserAccount[];
};

// --- Helper Functions for Data Generation ---

const ALLOWED_SCHOOL_DOMAINS_EXTENDED = [
    "example.edu", "mycollege.edu", "deno.land", // From your config
    "mit.edu", "stanford.edu", "harvard.edu",
    "cambridge.ac.uk", "oxford.ac.uk", "ucl.ac.uk",
    "uni-heidelberg.de", "polimi.it", "ethz.ch",
    "universite.fr", "up.ac.za", "unimelb.edu.au",
    "kth.se", "tsinghua.edu.cn", "utoronto.ca",
];

function generateUUID(): string {
    return crypto.randomUUID();
}

function getRandomDate(start: Date, end: Date): Date {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function getRandomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomEmailAddress(domain?: string, prefix?: string): EmailAddress {
    const randomPrefix = prefix || Math.random().toString(36).substring(2, 8);
    const selectedDomain = domain || getRandomElement(ALLOWED_SCHOOL_DOMAINS_EXTENDED);
    return `${randomPrefix}@${selectedDomain}` as EmailAddress;
}

const usernameAdjectives = ["swift", "clever", "silent", "pixel", "quantum", "star", "cosmic", "deep", "cyber", "robo"];
const usernameNouns = ["coder", "dev", "user", "student", "master", "wizard", "hero", "ghost", "pioneer", "vision"];
function getRandomUsername(base?: string): string {
    if (base) {
        return base.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    }
    const prefix = getRandomElement(usernameAdjectives);
    const noun = getRandomElement(usernameNouns);
    const suffix = Math.random() < 0.5 ? Math.floor(Math.random() * 999).toString() : getRandomElement(["_dev", "_js", "_tech", "_app", "_io", "x", "z"]);
    let username = `${prefix}_${noun}${suffix}`;
    // Ensure valid characters and length constraints (if any)
    username = username.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    return username.substring(0, 20); // Limit to a reasonable length
}

const avatarPlaceholderUrls = [
    "https://picsum.photos/200/200?random=1",
    "https://picsum.photos/200/200?random=2",
    "https://picsum.photos/200/200?random=3",
    "https://picsum.photos/200/200?random=4",
    "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=identicon", // Default identicon
    "https://avatar.iran.liara.run/public/boy?username=random", // Generates unique boy avatars
    "https://avatar.iran.liara.run/public/girl?username=random", // Generates unique girl avatars
    undefined, // Explicitly no avatar
];

function getRandomAvatarUrl(): string | undefined {
    return getRandomElement(avatarPlaceholderUrls);
}

const shortBios = [
    "Loves to code.",
    "Student and developer.",
    "Coffee enthusiast.",
    "Learning new things every day.",
    "Passionate about technology.",
    "Avid reader and gamer.",
];
const mediumBios = [
    "Full-stack developer with a passion for building user-friendly applications and scalable backend systems.",
    "Enthusiastic about open-source projects and continuous learning in the JavaScript ecosystem.",
    "Currently exploring AI/ML and its applications in web development. Always seeking new challenges.",
    "Software engineer, enjoying outdoor activities and photography in free time. Deno advocate.",
    "UX/UI designer focused on creating intuitive and accessible interfaces. Believes in design thinking.",
];
const longBios = [
    "Experienced software engineer with 5+ years in various tech stacks including TypeScript, Node.js, React, and MongoDB. Specializes in scalable backend systems and robust APIs. Committed to writing clean, maintainable code and fostering collaborative team environments. Outside of work, I enjoy hiking, playing chess, and contributing to community projects.",
    "Creative content creator and digital artist. Blending technology with art to tell compelling stories. My journey involves experimenting with new media, from digital painting to interactive installations. Always seeking inspiration from nature and urban landscapes. Available for freelance projects and collaborations.",
    "PhD candidate in Computer Science, researching distributed systems and blockchain technologies. My work aims to improve data integrity and security in decentralized applications. I am also a mentor for junior developers and actively participate in tech meetups. Looking forward to connecting with fellow researchers and industry professionals.",
    "A seasoned product manager with a decade of experience in launching successful B2B SaaS products. My expertise lies in agile methodologies, market research, and cross-functional team leadership. I thrive on solving complex problems and delivering exceptional user value. When not strategizing, I'm often found exploring new hiking trails or trying out new recipes.",
];
const veryLongBio = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus. Morbi leo risus, porta ac consectetur ac, vestibulum at eros. Etiam porta sem malesuada magna mollis euismod. Vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor.
Praesent commodo cursus magna, vel scelerisque nisl consectetur et. Donec sed odio dui. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus.
This is a very long bio designed to test character limits and rendering performance. It contains multiple paragraphs and aims to exceed typical display areas, requiring scrolling or truncation. Testing with various lengths ensures resilience and proper handling of user input. The quick brown fox jumps over the lazy dog. A journey of a thousand miles begins with a single step. The early bird catches the worm. All's well that ends well. Better late than never. Don't count your chickens before they hatch. Easy come, easy go. Every cloud has a silver lining. Look before you leap.`;


function getRandomBio(length: 'short' | 'medium' | 'long' | 'empty' | 'very-long'): string | undefined {
    switch (length) {
        case 'short':
            return getRandomElement(shortBios);
        case 'medium':
            return getRandomElement(mediumBios);
        case 'long':
            return getRandomElement(longBios);
        case 'empty':
            return "";
        case 'very-long':
            return veryLongBio;
        default:
            return undefined; // No bio
    }
}

// --- Main Data Generation ---

const mockPendingVerifications: MockPendingVerification[] = [];
const mockUserAccounts: MockUserAccount[] = [];

// Base date for generating timestamps
const now = new Date();
const inOneMinute = new Date(now.getTime() + 60 * 1000);
const inFiveMinutes = new Date(now.getTime() + 5 * 60 * 1000);

const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

// --- User Account Data Categories ---

// 1. Users Awaiting Verification (5 users)
for (let i = 0; i < 5; i++) {
    const userId = generateUUID() as UserId;
    const email = getRandomEmailAddress(undefined, `pending${i}`);
    const username = getRandomUsername(`unverified${i}`);
    const createdAt = getRandomDate(oneWeekAgo, oneDayAgo);
    const verificationToken = generateUUID() as VerificationToken;

    mockUserAccounts.push({
        _id: userId,
        email: email,
        username: username,
        isVerified: false,
        createdAt: createdAt,
        updatedAt: createdAt,
    });
    mockPendingVerifications.push({
        _id: verificationToken,
        email: email,
        status: 'pending',
        expiry: getRandomDate(inOneMinute, inFiveMinutes), // Active, expires in the near future
        createdAt: createdAt,
    });
}

// 2. Verified Users (Minimal Profile - 5 users)
for (let i = 0; i < 5; i++) {
    const userId = generateUUID() as UserId;
    const email = getRandomEmailAddress(undefined, `basic_verified${i}`);
    const username = getRandomUsername(`basic_user${i}`);
    const createdAt = getRandomDate(oneMonthAgo, twoWeeksAgo);
    const emailVerifiedAt = getRandomDate(createdAt, oneDayAgo);

    mockUserAccounts.push({
        _id: userId,
        email: email,
        username: username,
        isVerified: true,
        emailVerifiedAt: emailVerifiedAt,
        createdAt: createdAt,
        updatedAt: emailVerifiedAt,
    });
}

// 3. Verified Users (Full Profiles - 7 users)
for (let i = 0; i < 7; i++) {
    const userId = generateUUID() as UserId;
    const email = getRandomEmailAddress(undefined, `full_profile${i}`);
    const username = getRandomUsername(`pro_user_${i}`);
    const createdAt = getRandomDate(threeMonthsAgo, oneMonthAgo);
    const emailVerifiedAt = getRandomDate(createdAt, oneWeekAgo);
    const updatedAt = getRandomDate(emailVerifiedAt, oneMinuteAgo);

    mockUserAccounts.push({
        _id: userId,
        email: email,
        username: username,
        isVerified: true,
        emailVerifiedAt: emailVerifiedAt,
        avatarUrl: getRandomAvatarUrl(),
        bio: getRandomBio(getRandomElement(['short', 'medium', 'long'])),
        createdAt: createdAt,
        updatedAt: updatedAt,
    });
}

// --- Edge Cases & Specific Scenarios ---

// 4. User with a very long bio
const longBioUserId = generateUUID() as UserId;
const longBioEmail = getRandomEmailAddress(getRandomElement(ALLOWED_SCHOOL_DOMAINS_EXTENDED), "epicwriter");
const longBioUsername = getRandomUsername("the_storyteller");
mockUserAccounts.push({
    _id: longBioUserId,
    email: longBioEmail,
    username: longBioUsername,
    isVerified: true,
    emailVerifiedAt: getRandomDate(twoWeeksAgo, oneWeekAgo),
    avatarUrl: getRandomAvatarUrl(),
    bio: getRandomBio('very-long'),
    createdAt: getRandomDate(oneMonthAgo, twoWeeksAgo),
    updatedAt: oneMinuteAgo,
});

// 5. User with no avatar set
const noAvatarUserId = generateUUID() as UserId;
const noAvatarEmail = getRandomEmailAddress(getRandomElement(ALLOWED_SCHOOL_DOMAINS_EXTENDED), "ghost_user");
const noAvatarUsername = getRandomUsername("no_pic_profile");
mockUserAccounts.push({
    _id: noAvatarUserId,
    email: noAvatarEmail,
    username: noAvatarUsername,
    isVerified: true,
    emailVerifiedAt: getRandomDate(oneMonthAgo, oneWeekAgo),
    // avatarUrl: undefined is default
    bio: getRandomBio('short'),
    createdAt: getRandomDate(oneMonthAgo, oneWeekAgo),
    updatedAt: oneHourAgo,
});

// 6. User with an explicitly empty bio
const emptyBioUserId = generateUUID() as UserId;
const emptyBioEmail = getRandomEmailAddress(getRandomElement(ALLOWED_SCHOOL_DOMAINS_EXTENDED), "empty_bio_person");
const emptyBioUsername = getRandomUsername("zen_master");
mockUserAccounts.push({
    _id: emptyBioUserId,
    email: emptyBioEmail,
    username: emptyBioUsername,
    isVerified: true,
    emailVerifiedAt: getRandomDate(oneMonthAgo, oneWeekAgo),
    avatarUrl: getRandomAvatarUrl(),
    bio: "", // Explicitly empty string
    createdAt: getRandomDate(oneMonthAgo, oneWeekAgo),
    updatedAt: oneHourAgo,
});

// 7. Users for username conflict testing (these usernames are 'taken')
const conflictUsername1 = "john_doe";
mockUserAccounts.push({
    _id: generateUUID() as UserId,
    email: getRandomEmailAddress(getRandomElement(ALLOWED_SCHOOL_DOMAINS_EXTENDED), "orig.john"),
    username: conflictUsername1,
    isVerified: true,
    emailVerifiedAt: getRandomDate(threeMonthsAgo, oneMonthAgo),
    createdAt: getRandomDate(threeMonthsAgo, oneMonthAgo),
    updatedAt: oneHourAgo,
    isUsernameConflictCandidate: true,
});
const conflictUsername2 = "testuser_123";
mockUserAccounts.push({
    _id: generateUUID() as UserId,
    email: getRandomEmailAddress(getRandomElement(ALLOWED_SCHOOL_DOMAINS_EXTENDED), "the.test"),
    username: conflictUsername2,
    isVerified: true,
    emailVerifiedAt: getRandomDate(threeMonthsAgo, oneMonthAgo),
    createdAt: getRandomDate(threeMonthsAgo, oneMonthAgo),
    updatedAt: thirtyMinutesAgo,
    isUsernameConflictCandidate: true,
});

// --- Pending Verifications for Specific Test Scenarios ---

// 8. Expired verification token (for TokenExpiredError)
const expiredEmail = getRandomEmailAddress(getRandomElement(ALLOWED_SCHOOL_DOMAINS_EXTENDED), "expired.token");
const expiredToken = generateUUID() as VerificationToken;
mockPendingVerifications.push({
    _id: expiredToken,
    email: expiredEmail,
    status: 'expired', // Custom status for clearer testing intent
    expiry: getRandomDate(oneMonthAgo, fiveMinutesAgo), // Expired in the past
    createdAt: oneWeekAgo,
});

// 9. Used verification token (for TokenUsedError)
const usedEmail = getRandomEmailAddress(getRandomElement(ALLOWED_SCHOOL_DOMAINS_EXTENDED), "used.token");
const usedToken = generateUUID() as VerificationToken;
mockPendingVerifications.push({
    _id: usedToken,
    email: usedEmail,
    status: 'used', // Custom status for clearer testing intent
    expiry: getRandomDate(twoWeeksAgo, oneDayAgo), // Expiry doesn't strictly matter for 'used', but should be in the past
    createdAt: twoWeeksAgo,
});
// Create a corresponding verified user for the 'used' token scenario
mockUserAccounts.push({
    _id: generateUUID() as UserId,
    email: usedEmail,
    username: getRandomUsername("usedtokenuser"),
    isVerified: true,
    emailVerifiedAt: getRandomDate(twoWeeksAgo, oneDayAgo),
    createdAt: twoWeeksAgo,
    updatedAt: getRandomDate(twoWeeksAgo, oneDayAgo),
});

// 10. Pending token for an already verified user (re-verification scenario)
const reVerificationEmail = getRandomEmailAddress(getRandomElement(ALLOWED_SCHOOL_DOMAINS_EXTENDED), "reverify");
const reVerificationToken = generateUUID() as VerificationToken;
mockUserAccounts.push({
    _id: generateUUID() as UserId,
    email: reVerificationEmail,
    username: getRandomUsername("reverifyuser"),
    isVerified: true,
    emailVerifiedAt: getRandomDate(threeMonthsAgo, oneMonthAgo),
    createdAt: getRandomDate(threeMonthsAgo, oneMonthAgo),
    updatedAt: oneDayAgo,
});
mockPendingVerifications.push({
    _id: reVerificationToken,
    email: reVerificationEmail,
    status: 'pending',
    expiry: getRandomDate(inOneMinute, inFiveMinutes), // Active, expires in future
    createdAt: oneMinuteAgo, // Token requested recently for re-verification
});

// Total users generated: 5 + 5 + 7 + 3 (edge case profiles) + 2 (conflict) + 1 (for used token) = 23 users.
// Total pending verifications generated: 5 (initial) + 3 (expired/used/reverify) = 8 pending verifications.
// This fulfills the requirement of at least 20-30 fake user records.

// --- Export the Generated Data ---
export const fakeTestData: FakeTestData = {
    mockPendingVerifications,
    mockUserAccounts,
};

// Optional: Log counts for verification during development
// console.log(`Generated ${fakeTestData.mockUserAccounts.length} mock user accounts.`);
// console.log(`Generated ${fakeTestData.mockPendingVerifications.length} mock pending verifications.`);
```
