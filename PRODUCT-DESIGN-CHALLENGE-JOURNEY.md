# M2I Product Design: Multi-Day Group Challenge Journey

## Product Thesis

Move2Improve is not a payment app and not a GPS surveillance app. It is a local-first challenge tool that lets people commit to movement, collect signed local workout claims, and optionally settle manually at the end.

Core promise:

> Local movement verification + signed claims + optional manual settlement request + optional redacted public proof.

## Consumer Journey

### 1. Create Challenge

The user creates a challenge plan, not a single workout.

Required fields:

- Challenge name/code
- Challenge window, for example 30 days
- Commitment target, for example 10 active days
- Minimum active-day duration, for example 45 minutes

Optional fields:

- Minimum active-day distance
- Participants / group roster
- USDt manual payment request
- sats / Lightning manual payment request
- Teamkasse / cause recipient

Example:

> 30-day challenge. Complete 10 active days. Each active day must be at least 45 minutes. Optional stake: 2 USDt to Teamkasse if commitment is missed.

### 2. Invite / Join Group

A challenge can have more than two participants. The shared object is the challenge rule set.

Participants have:

- display name
- optional npub
- joined timestamp
- progress
- settlement status

The invite can be copied as a text block. Joining a challenge imports the same rule set locally. The current PWA implementation starts with local roster/progress; cross-device synchronization can come later through private bot/DM/import flows.

### 3. Start Workout

The user should not re-enter the challenge code for every workout.

Flow:

- Open active challenge
- Tap Start workout
- App attaches the workout to the challenge automatically
- If GPS aggregate is enabled, app prompts for browser location permission
- Route points stay memory-only and are discarded at finish

Required copy before GPS:

> Enable location in Safari to include a local movement aggregate. No route is stored or uploaded.

### 4. Finish Workout

Each workout creates one signed local claim attached to the challenge.

The app stores locally:

- challenge id/code
- workout claim
- duration
- optional aggregate distance
- GPS diagnostics for private troubleshooting
- signed event

The app computes locally:

- active days completed
- total valid workouts
- remaining days
- whether the commitment is met

### 5. Private Settlement

Settlement is private and manual.

At the end of the challenge, or whenever participants review progress, the app creates a private settlement package containing:

- challenge rules
- participant progress
- signed workout claims
- manual payment request instructions, if any

The loser/payer pays manually from their own wallet. M2I never initiates payment, watches settlement, holds funds, stores wallet authority, or connects to NWC.

### 6. Public Share

Public sharing is separate opt-in.

Public Nostr proof can include:

- challenge code/name
- duration
- aggregate distance
- verification method
- proof/signature

Public Nostr proof must not include:

- payment details
- participants/counterparties unless explicitly public later
- exact route or coordinates
- raw GPS samples
- precise timestamps
- private notes

## Product Guardrails

- No custody
- No auto-pay
- No NWC spend authority
- No pooled funds
- No settlement polling
- No raw routes persisted or transmitted
- No public payment metadata
- Teamkasse/cause recipient preferred over winner payout for group challenges
- Public sharing remains opt-in

## Near-Term Scope

Build now:

- Local challenge plan
- Group participants field
- Start workout from challenge
- Local aggregation of signed workout claims
- Progress dashboard
- Private settlement package
- Public share remains redacted

Defer:

- Bot synchronization
- Cross-device merge
- On-chain settlement verification
- Winner payout logic
- Own Nostr relay
- HealthKit / Strava imports
