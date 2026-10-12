# Authentication Plan

This document defines the account model and records the implementation boundary. Guest, Google, email/password, and readable player IDs are implemented. Apple is deferred.

## Current implementation status

Implemented:

- guest accounts backed by Better Auth anonymous sessions
- fixed Google accounts and one-way guest-to-Google protection
- explicit `guest | google | apple | email` account types
- immutable server-generated readable player IDs
- readable IDs throughout player-owned backend records and APIs
- stale/deleted guest-session recovery on lobby entry
- account screen variants for guest and Google accounts
- account deletion and protected-account deletion challenges
- removal of provider linking, `connectedMethods`, and login-method removal
- pre-release identity/history reset migration `0012_fixed_account_identity.sql`
- verified email signup that preserves the guest player
- returning email-code and optional password login
- email-code-authorized password add, replace, reset, and removal
- globally reserved, permanent account emails

Currently available to players: guest entry, Google authentication, and email accounts. Apple is a no-op and remains deferred.

## Account model

Better Auth owns authentication and secure cookie sessions. The game owns player identity, display names, ratings, progression, and match history.

Every player begins as a guest. A guest may remain a guest or permanently protect that player as exactly one account type:

- Google account
- Apple account
- Email account

An account never combines Google, Apple, and email identities. Google accounts stay Google accounts, Apple accounts stay Apple accounts, and email accounts stay email accounts. Matching email addresses never link or merge accounts. Normal player-facing UI has no provider-linking or connected-login-method management.

Protecting a guest account changes its authentication type without changing its game identity, readable player ID, display name, rating, progression, or match history. Once protected, its account type is fixed.

Email addresses are globally reserved. If an address already belongs to any account type, email signup with that address does not create or merge an account. The game reports that an existing account is associated with the address without revealing its account type. No email is sent. Any exceptional transfer is a manual support operation.

There is no legacy compatibility requirement. Pre-release accounts and sessions may be destroyed while this model is implemented.

## Game identity

Every player row has one immutable, unique, readable player ID, shaped like:

```text
apple-omega-pizza-turtle-45
```

This is a game-generated identifier. The words do not describe the account provider; `apple` in the example is simply a word. Provider names should not be deliberately placed in the ID.

The readable player ID is the canonical game-facing identity used by backend game records, APIs, moderation tools, match history, social/profile features, and player lookup. It is public and safe to show. It is assigned once and never changes, including when a guest becomes protected or changes display name.

Display names are public, mutable, and non-unique. They are presentation, not identity and never login credentials. Interfaces that need unambiguous attribution may show both:

```text
Cool Wizard
apple-omega-pizza-turtle-45
```

Authentication still uses separate private identifiers supplied by Better Auth and each provider. Google subject IDs, Apple subject IDs, email addresses, session IDs, OAuth tokens, and internal Better Auth user IDs are never player-facing identifiers. D1 links the private auth user to the readable player ID.

Readable IDs must be generated server-side with enough combinations to make guessing another ID harmless and collisions negligible. Creation still enforces a unique database constraint and retries on collision. IDs are never authentication secrets. Authorization always comes from the session, never possession of an ID.

Deleted accounts may leave a tombstone under the same readable ID when historical foreign keys require it. The tombstone loses its auth link, display name, rating, progression, and other personal profile data. Readable IDs are never recycled.

## Guest accounts

- Guest creation uses Better Auth anonymous authentication and a secure cookie session.
- No permanent credential is stored in local storage.
- Clearing cookies may permanently lose access to an unprotected guest.
- A guest chooses a display name and receives its immutable readable player ID at player-row creation.
- A guest may be protected once through Google, Apple, or verified email.
- Guest deletion requires explicit confirmation but no email challenge.

## Google accounts

- Google OAuth is the only login and recovery mechanism.
- The stable Google provider identity maps to one game account.
- An email returned by Google is provider/profile data, not an email-login credential.
- A Google account cannot add a game password, email-code login, or Apple login.
- Losing access to Google is handled through Google recovery. The game does not bypass Google ownership.

## Apple accounts

- Sign in with Apple is the only login and recovery mechanism.
- The stable Apple provider identity maps to one game account.
- Apple relay email and any other email returned by Apple are provider/profile data, not email-login credentials.
- An Apple account cannot add a game password, email-code login, or Google login.
- Losing access to Apple is handled through Apple recovery. The game does not bypass Apple ownership.
- Apple login must ship before an iOS client offers another third-party social login.

## Email accounts

Verified email ownership is the root identity of an email account.

- Signup collects a display name, email, optional password, Terms agreement, and Privacy Policy acknowledgment.
- Signup creates a short-lived verification challenge first. The protected account is created only after the email code succeeds.
- Successful verification atomically protects the guest, records the verified email and legal acceptance metadata, optionally stores the password credential, and preserves the player row.
- Email-code login is always available. It is the base login and recovery mechanism.
- A password is optional convenience, not a separate account type or second factor.
- A password may be added, changed, reset, or removed only after fresh email verification or another sufficiently fresh email-account session.
- Password changes revoke other sessions while preserving the newly verified current session.
- Account email is permanent and cannot be changed through the game. Losing inbox access requires manual support.
- Email accounts cannot add Google or Apple login.

Email-code requests for known and unknown addresses return equivalent public responses. A login-code flow never creates an account for an unknown address.

## Email codes

Email challenges are purpose-bound. A signup, sign-in, deletion, email-change, or password-management code cannot be reused for another purpose.

- Codes contain six decimal digits.
- Codes expire after ten minutes.
- At most three failed verification attempts are accepted per challenge.
- Codes are stored only as keyed hashes.
- Resending rotates the prior code.
- Request, resend, and verification are rate-limited using normalized email and client/IP signals.
- Responses do not disclose whether an account exists.

Resend is the production mail provider behind a small provider-independent mail interface. Local tests use a fake mailer. Email capabilities remain hidden until mail delivery or the localhost-only fake mailer is configured.

## Account screens

The account screen branches by fixed account type instead of managing a collection of login methods.

All account types show:

- display name editing
- immutable readable player ID
- account type
- logout
- account deletion

Google and Apple accounts show their single provider. Email accounts show the verified address and password status, with email/password management actions. Guest accounts eventually show the available one-time protection choices. At present, the Account screen offers only Google protection.

## Sessions and authorization

HTTP and lobby/whiteboard WebSockets authenticate only through Better Auth session cookies. Match WebSockets continue to use short-lived private seat tokens. Local storage may contain harmless display and interface preferences, never authentication material.

The readable player ID may appear in URLs and payloads, but it grants no authority. Every protected operation resolves the authenticated session to its player row server-side.

Sensitive account changes require recent authentication. Better Auth supplies password hashing, opaque sessions, expiry, rotation, revocation, CSRF protection, secure cookies, and encrypted OAuth-token storage.

## Deletion

Deleting an account removes its Better Auth user, provider identity or email credential, password credential if present, sessions, verification records, acceptance records, and personal player profile data. Device preferences remain.

Completed match history may retain an anonymized tombstone with the immutable readable player ID so results and foreign keys remain internally consistent. Deletion cannot be recovered.

## Email/password implementation

The implementation builds on the existing fixed `accountType` contract and preserves the current player row. It does not reintroduce provider arrays, provider linking, email-based merging, or public Better Auth identifiers.

Required email paths:

- guest to verified email protection, preserving the readable player ID and all game state
- returning email-code login
- optional password during protection
- add, change, reset, and remove password for email accounts only
- email account details and password status on the Account screen
- generic public responses for unknown/known email addresses
- purpose-bound challenges, expiry, attempt limits, rotation, hashing, and rate limits
- session revocation after password changes, excluding the newly verified current session

The existing title mock UI may be connected to these flows without redesigning the title layout. The disabled email routes and capability flags should become available only when their complete server flow is ready. Existing partial email code is not proof that a path is production-ready; review it against this document before enabling it.

## Deferred decisions

The temporary ID word pools remain isolated in `src/protocol/playerIdWords.ts` for later JP-authored replacement. IDs use four lowercase ASCII words plus a zero-padded `00-99` suffix. Phone login, passkeys, recovery codes, automated account merging, and player-to-player account transfer are out of scope.
