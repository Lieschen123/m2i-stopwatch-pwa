# M2I Burpees V1 Spec

*Created: 2026-07-18*

## Goal

Add Burpees V1 to the M2I stopwatch PWA as a timed, self-attested rep challenge.

MVP user story:

> I create or join a burpee challenge, run a fixed timer, enter my rep count, and sign a local claim. The group board can rank claims by reps.

## Product decisions

| Question | Decision | Why |
|---|---|---|
| Verification | Self-attested signed claim | Keeps privacy thesis, no camera/body-data surveillance |
| First exercise | Burpees | Simple, measurable, no external data needed |
| Scoring | Reps for time | Good for short challenges and easy ranking |
| Default duration | 7 minutes | Common fitness-test format |
| Anti-cheat | Social trust + signed receipt | V1 is proof-of-claim, not proof-of-truth |
| Payments | Keep existing manual/private settlement | No new payment scope |

## Claim schema additions

For burpee claims include:

```json
{
  "activity_type": "burpees",
  "scoring_model": "reps_for_time",
  "proof_type": "self_attested",
  "rep_count": 83,
  "duration_seconds": 420
}
```

Existing movement claims remain backwards-compatible.

## Challenge schema additions

Add optional fields:

```json
{
  "activityType": "burpees",
  "scoringModel": "reps_for_time",
  "durationSeconds": 420,
  "minReps": null
}
```

Defaults:
- `activityType: "movement"`
- `scoringModel: "duration"`

## UI MVP

- Challenge creation can choose `Movement / Run` or `Burpees`.
- Burpees show duration selector/input in minutes, default 7.
- Workout start copies challenge activity config into active workout.
- Finish flow for burpees asks for reps before signing.
- Claim screen shows burpee score.
- History/board displays reps for burpee claims.

## Validation

Movement challenge validity remains current logic.

Burpee challenge validity:
- linked to challenge
- within challenge window
- `activity_type === "burpees"`
- `scoring_model === "reps_for_time"`
- `proof_type === "self_attested"`
- `duration_seconds >= challenge.durationSeconds`
- `rep_count > 0`
- if `minReps` set, `rep_count >= minReps`

## Board/ranking

For burpee challenge board:
- valid claim = one score entry
- rank by `rep_count DESC`, then `duration_seconds ASC`, then older timestamp first
- participant completion for roster challenges counts at least one valid burpee claim per required active day, same day model as movement.

## Copy

Use honest wording:

> Signed self-attestation. The receipt proves who claimed what and when. It does not prove the movement objectively happened.

## Tests

Add/adjust tests for:
- create burpee challenge plan
- create burpee claim with rep_count/proof_type
- burpee workoutMeetsChallenge valid/invalid cases
- movement tests remain passing

## Out of scope V1

- Camera pose detection
- Watch/phone motion rep counting
- Video upload
- Public proof of actual movement
- New backend/bot commands
