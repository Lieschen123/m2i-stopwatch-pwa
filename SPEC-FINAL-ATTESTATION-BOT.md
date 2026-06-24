# Spec: Final Attestation + Team Jar Noticeboard Bot

## Status

Architecture lock for the post-PWA coordinator layer.

## Thesis

The bot is not a payment agent, wallet, judge, or workout tracker. The bot is a minimal final-result noticeboard.

The PWA does the private work:

- stores challenge rules locally
- tracks workouts locally
- computes progress locally
- keeps GPS aggregate diagnostics locally
- keeps payment request details locally unless explicitly shared

The bot receives only final attestations.

## Bot Role

At the end of a challenge, each participant submits one signed final attestation.

The bot displays:

- who submitted success
- who submitted fail
- who owes the team jar
- expected manual amount per failed participant
- expected total to team jar

The group can socially verify whether the total sums up.

## Bot Must Not Receive

- workout logs
- daily progress
- raw GPS samples
- route points
- coordinates
- precise start/stop timestamps
- full plaintext challenge rules by default
- wallet spend authority
- NWC credentials
- automatic payment instructions
- settlement polling events

## Minimal Bot-Visible Payload

```json
{
  "type": "m2i-final-attestation-v1",
  "challenge_hash": "sha256(local canonical challenge rules)",
  "participant": "npub or pseudonym",
  "result": "succeeded",
  "signature": "participant signature"
}
```

For a failed participant:

```json
{
  "type": "m2i-final-attestation-v1",
  "challenge_hash": "sha256(local canonical challenge rules)",
  "participant": "npub or pseudonym",
  "result": "failed",
  "owed": {
    "asset": "USDt",
    "amount": 2,
    "recipient_label": "Team jar"
  },
  "signature": "participant signature"
}
```

The bot does not need to know that the rule was `30 days / 10 active days / 45 minutes`. It only needs the shared `challenge_hash` to group submissions and prevent obvious mismatch.

## Team Jar Noticeboard

Example final bot output:

```text
Challenge ended: 7c8a...d91

Submitted:
✅ Nono — succeeded
✅ Alex — succeeded
❌ Mia — failed

Settlement:
Mia pays 2 USDt to Team jar.
Expected total: 2 USDt.

Manual payment only. M2I does not custody funds, initiate payment, or monitor settlement.
```

## Payment Model

The bot may show an agreed team jar instruction only if the group explicitly includes it in the final noticeboard flow.

Preferred privacy-minimal modes:

1. Bot shows only amount owed and `Team jar` label.
2. Group checks the actual address from their private invite/group chat.
3. If address display is needed, the final noticeboard includes the address only at the end, not in daily activity.

## Group Chat

M2I does not host group chat in V1.

The invite is shared in an external group chat:

- Signal
- WhatsApp
- Telegram
- Keet
- Nostr DM/group

The PWA should say:

> Share this invite in your group chat. M2I does not host chat or participant messages.

## Privacy Model: Public Web App, Private Local Data

The PWA can be hosted on GitHub Pages because GitHub only serves the app shell.

GitHub sees:

- normal file requests such as `index.html`, `main.js`, `sw.js`
- normal web metadata such as IP/user-agent/time

GitHub does not see:

- challenge rules
- group members
- payment requests
- GPS samples
- routes
- private settlement JSON
- local history
- success/failure unless the user explicitly sends it elsewhere

## Product Decision

Locked architecture:

> PWA tracks locally. Bot receives final success/fail attestations only. Group verifies the team jar settlement socially.
