# Spec: Multi-Day Group Challenges

## Status

Implementation spec for M2I PWA V1.1.

## Goals

- Allow users to create a multi-day challenge such as 30 days / 10 active days / 45 minutes each.
- Allow more than two participants in one challenge.
- Let users start workouts from an existing challenge without re-entering the code.
- Store workout claims locally and aggregate progress in-app.
- Keep payment requests manual and private.
- Keep public Nostr sharing redacted.

## Data Model

### Challenge

```json
{
  "id": "challenge-...",
  "code": "JUNE-RUN",
  "durationDays": 30,
  "requiredActiveDays": 10,
  "minMinutesPerActiveDay": 45,
  "minDistanceKm": null,
  "createdAt": 1782290000000,
  "startsAt": 1782290000000,
  "endsAt": 1784882000000,
  "participants": [
    { "id": "participant-1", "displayName": "Nono", "npub": "" }
  ],
  "paymentRequests": []
}
```

### Workout Claim

Each workout claim remains a signed claim event. The local history entry links it back to `challengeId`.

```json
{
  "challenge_id": "challenge-...",
  "challenge_code": "JUNE-RUN",
  "duration_seconds": 2700,
  "distance_km": 4.2,
  "gps_used": true,
  "claim_hash": "..."
}
```

### Progress

Computed from local history. No server required.

A valid active day is a local calendar day where at least one workout attached to the challenge meets:

- duration >= minMinutesPerActiveDay
- if configured: distance >= minDistanceKm

Progress output:

```json
{
  "validActiveDays": 4,
  "requiredActiveDays": 10,
  "isComplete": false,
  "totalWorkouts": 6,
  "remainingActiveDays": 6
}
```

## UI Requirements

### Home / Challenge Dashboard

Show active challenges:

- challenge code/name
- progress, for example `4 / 10 valid days`
- challenge window
- participant count
- payment model summary

Actions:

- Open challenge
- Create challenge
- History

### Create Challenge

Fields:

- Challenge name/code
- Start date
- Challenge duration in days
- Required active days
- Minimum minutes per active day
- Optional minimum km per active day
- Participants, one per line
- Optional USDt payment request
- Optional sats payment request

### Challenge Detail

Show:

- start and end date
- rules
- progress
- participants
- local workout claims
- payment model

Actions:

- Start workout
- Copy invite text
- Copy private settlement JSON
- Back

### Start Workout

Start from challenge detail. The workout inherits:

- challenge id/code
- minimum duration target
- payment request configuration

GPS copy:

> Enable location in Safari to include a local movement aggregate. No route is stored or uploaded.

### Finish Workout

On finish:

- create signed claim
- attach to challenge
- store locally
- update progress
- show private claim screen

### Settlement

Settlement is generated when the user opens private settlement from a challenge.

It includes:

- challenge rules
- local progress
- local signed claims
- manual payment requests

It excludes:

- auto-pay instruction
- wallet spend authority
- custody fields
- settlement polling claims

## Privacy Requirements

Private/local can include diagnostics and payment requests.

Public Nostr must exclude:

- payment requests
- private settlement package
- route/coordinates/raw GPS samples
- GPS diagnostic counts/errors
- precise start/stop timestamps
- participants/counterparties unless a future explicit public roster mode is added

## Testing Requirements

Unit tests:

- challenge creation computes end date and rules
- participants parse correctly
- progress counts valid active days
- workouts below minimum duration do not count
- challenge payment requests remain private
- public projection still redacts payment/private fields

Manual iPhone tests:

- create 30-day challenge
- add 2 USDt manual request
- start workout from challenge
- verify GPS accepted samples
- finish workout
- verify progress increments
- verify private settlement shows payment request
- verify public share stays redacted

## Coordination Lock

Participants are local roster entries, not email accounts. The field should be understood as:

> Group members, optional. Names only, one per line. Use npub only if you want private Nostr identity binding.

No email invitation flow is part of V1.

Group chat remains external. The app should generate invite text for copy/paste into the user's existing group chat.

Final group accountability should not require the organizer to import every workout. The next coordinator layer is a final-attestation bot:

- PWA computes success/fail locally.
- Participant submits one final signed success/fail attestation.
- Bot groups submissions by challenge hash.
- Bot shows who succeeded, who failed, and what failed participants owe the Team jar.
- Bot does not receive workouts, GPS, rules, or daily progress by default.

The challenge hash is computed from the canonical local challenge rules. The bot does not need the plaintext rules.
