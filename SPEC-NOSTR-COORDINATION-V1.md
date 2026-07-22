# M2I Nostr Coordination V1 Spec

**Date:** 2026-07-22  
**Status:** Draft, comparison lane after Holepunch prototype  
**Goal:** Test whether M2I signed envelopes can be represented cleanly as Nostr events for group coordination without changing M2I's canonical truth model.

---

## 1. Decision frame

M2I should not pivot the live Runner 2 alpha away from the current PWA/manual-share flow.

This spec is a small architecture lane answering one question:

> Can M2I envelopes ride on Nostr/BUZZ-style group infrastructure better than Holepunch/Pear for human challenge coordination?

Current recommendation:

- **Alpha:** keep PWA + manual share/import.
- **Coordination V2:** prefer Nostr/BUZZ-style signed events if the UX/ecosystem matures.
- **Private sync research:** keep Holepunch/Pear as a transport lane, not canonical truth.

---

## 2. Non-negotiables

M2I canonical truth remains:

1. Local user action.
2. Local claim/proof creation.
3. M2I signed envelope.
4. Deterministic reducer.

Nostr, BUZZ, Holepunch, Signal, Telegram, QR codes, files, and future transports are only delivery layers.

M2I must not claim:

- cheat-proofness
- surveillance proof
- GPS proof by default
- automatic payouts
- escrow/custody
- investment/gambling framing

Privacy rules:

- Health/body data stays local.
- Raw route, heart-rate, video, camera, and sensor streams are not published.
- Public Nostr is never default for private friend-stakes.
- Payment/settlement remains manual/social.
- Own German relay remains avoided unless legal/operator obligations are intentionally accepted.

---

## 3. Why Nostr/BUZZ may fit better than Holepunch for M2I coordination

### Nostr/BUZZ strengths

- Async by default: people do not need to be online simultaneously.
- Social/group-native: challenge updates fit chat/group timelines.
- Signed events are conceptually aligned with M2I signed envelopes.
- Relays provide simple availability without us running central backend state.
- Existing identity/social graph may help onboarding in Bitcoin/Nostr communities.
- BUZZ may eventually provide a polished humans-plus-agents workspace shell.

### Holepunch strengths

- Stronger private P2P direction.
- No public relay dependency.
- Better for direct local-device sync if the runtime is available.
- Useful for sovereign/private research.

### Holepunch weaknesses observed

- PWA/iPhone story is harder.
- Discovery/reconnect timing is non-trivial.
- Users do not naturally understand the UX.
- More infrastructure before alpha learning.

### Nostr weaknesses

- Nostr is not automatically private.
- Public relays leak metadata.
- Relay retention/moderation varies.
- Group encryption standards and client support are uneven.
- Spam/replay/discovery rules need care.

---

## 4. Event representation principle

Nostr event content should carry the **M2I envelope as payload**, not replace it.

Recommended Nostr event shape:

```json
{
  "kind": 30316,
  "content": "<canonical M2I envelope JSON or encrypted envelope JSON>",
  "tags": [
    ["d", "m2i:<challenge_id>:<envelope_hash>"],
    ["m2i", "envelope", "v1"],
    ["m2i_type", "m2i.claim.v1"],
    ["challenge", "<challenge_id>"],
    ["challenge_code", "RUNNER2-DAILY-BURPEES"],
    ["envelope_hash", "<sha256>"],
    ["privacy", "private|public-redacted"],
    ["activity", "burpees"]
  ],
  "created_at": 1784701800,
  "pubkey": "<nostr pubkey>",
  "sig": "<nostr signature>"
}
```

Notes:

- `kind: 30316` is already used by M2I PWA public claim experiments. Keep for continuity unless a better custom/application kind is chosen.
- The **M2I envelope hash** remains the reducer/dedupe ID.
- The **Nostr event id** is transport/audit metadata, not canonical proof identity.
- Public-redacted events may contain only brag-safe summaries, not full private details.

---

## 5. Envelope type mapping

| M2I envelope type | Nostr use | Public? | Notes |
|---|---|---:|---|
| `m2i.challenge.v1` | Challenge announcement / group seed | Maybe | Public only if challenge itself is meant to be public. Private friend challenges should be encrypted/group-scoped. |
| `m2i.join.v1` | Participant joins challenge | Usually private | Joining leaks social graph and intent. Prefer encrypted group/DM path. |
| `m2i.claim.v1` | Signed self-attestation / proof update | Private by default | Public version should be redacted brag only. |
| `m2i.outcome.v1` | Final reduced result | Private by default | Public only as voluntary summary. |
| `m2i.payment_request.v1` | Manual settlement instruction | Private only | Never public by default. Avoid money metadata leakage. |
| `m2i.receipt.v1` | Social/manual paid marker | Private only | No preimage/custody assumptions. |

---

## 6. Privacy modes

### Mode A: Manual share, current alpha

- PWA creates envelope.
- User copies/shares proof/update in Signal/Telegram/WhatsApp.
- Coordinator imports.

Best for Runner 2 alpha.

### Mode B: Private Nostr DM/group

- PWA or companion tool wraps envelope in encrypted Nostr message.
- Group participants or coordinator receive it.
- Reducer imports envelopes locally.

Best likely V2 path if client support is good.

Candidate standards:

- NIP-17 private DMs for 1:1 delivery.
- NIP-29 or emerging group specs only after client/ecosystem check.
- BUZZ if it exposes a usable group/event API and encrypted/private workspace semantics.

### Mode C: Public redacted Nostr brag

- Optional.
- User deliberately posts redacted summary, e.g. “Day 3 done, 41 burpees in 2:30.”
- No private roster, payment, raw proof, health data, or settlement metadata by default.

Best for community growth, not for canonical coordination.

---

## 7. BUZZ-specific hypothesis

BUZZ may become useful if it offers:

- private group rooms backed by Nostr events
- human + agent participants
- searchable/auditable signed event history
- code/workflow integrations
- self-hostable or relay-configurable deployment
- API/export access to raw signed events
- usable mobile UX

Potential M2I use:

- One BUZZ room per challenge/community.
- M2I agent watches room events.
- Participants post/import signed M2I envelope updates.
- Agent summarizes board state and settlement reminders.
- Coordinator still controls private/manual settlement.

But M2I should not depend on BUZZ unless it is open, exportable, and does not trap data/workflows.

---

## 8. Minimal Nostr prototype plan

Build a local no-network prototype first:

1. Reuse Runner 2 sample envelopes.
2. Wrap each envelope in a Nostr-like event object.
3. Include tags for challenge id, envelope type, envelope hash, and privacy mode.
4. Unwrap events back into M2I envelopes.
5. Feed them to the existing deterministic reducer.
6. Assert final board state equals direct-envelope reducer state.

Acceptance test:

```text
same envelopes -> nostr-wrapped events -> unwrapped envelopes -> same board state
```

No relay, no BUZZ dependency, no UI.

---

## 9. Future network prototype plan

Only after local mapping passes:

1. Publish encrypted/private test events to configured relay(s).
2. Fetch by challenge tag.
3. Unwrap and reduce locally.
4. Confirm dedupe by envelope hash.
5. Confirm public relay metadata leakage is acceptable or clearly documented.
6. Compare against BUZZ if API/client is available.

---

## 10. Recommendation

Proceed with a **Nostr envelope mapping prototype** next, not a BUZZ integration.

Reason:

- The envelope mapping is the durable architecture.
- BUZZ may or may not become the best UI shell.
- Nostr events are the substrate we can test now.
- It keeps the same principle learned from Holepunch: transport is replaceable.

**Strong architecture line:**

> M2I does not choose a network first. M2I chooses a proof object first, then lets the best network carry it.

---

## 11. Prototype checkpoint — 2026-07-22

Implemented the local no-network prototype:

- `prototypes/nostr-coordination/nostr-envelope-events.js`
- `prototypes/nostr-coordination/demo-local.mjs`
- `tests/nostr-coordination.test.mjs`

Added script:

```bash
npm run prototype:nostr:local
```

Result:

```text
✅ Nostr coordination prototype passed: wrap → unwrap → same M2I board state.
```

Regression coverage:

1. Raw M2I envelopes and Nostr-wrapped envelopes reduce to identical board state.
2. Nostr tags expose transport metadata while `envelope_hash` remains canonical proof id.
3. Tag/content mismatch is rejected.
4. Tampered event content is rejected by recomputing the Nostr event hash before trusting content.

Important implementation lesson:

`verifyEvent(event)` alone was not enough for our trust boundary in this local test. The wrapper now explicitly checks `getEventHash(event) === event.id` before accepting the event signature/content pair.

Updated conclusion:

The Nostr/BUZZ lane is technically plausible. M2I envelopes can be carried as Nostr events without changing reducer semantics. The next decision is privacy mode and relay strategy, not proof-object design.

---

## 12. Privacy decision — private room first, bot-blind by design

Nono's preference: start with **private room coordination**, not public brag events and not 1:1-only DMs.

Decision:

- One challenge/community room should show shared status to participants.
- Participants should be able to see the board/status together.
- The M2I bot/agent should **not** know private information by default.
- The bot must not receive raw private envelopes, settlement instructions, health/body data, or full participant proof history unless explicitly invited for a narrow purpose.

### NIP-17 clarification

NIP-17 is mainly useful for private direct delivery between sender and recipient(s). If we have a real private room/group layer, NIP-17 is not necessarily the main UX primitive.

Possible use of NIP-17:

- fallback direct message delivery
- coordinator-only delivery
- pairwise encrypted fanout when no mature private-room standard exists

But the desired product model is **one private room**, not many confusing 1:1 DM threads.

### Bot-blind room model

The room should separate two channels:

1. **Private encrypted room data**
   - Full M2I envelopes.
   - Participant joins.
   - Claims/proofs.
   - Manual settlement notes.
   - Visible only to human room members / local clients with room key access.

2. **Redacted room status**
   - Minimal derived state, e.g. participant display names or aliases, day counts, freshness, completion state.
   - No raw proof details, payment metadata, health/body data, route, heart-rate, or private notes.
   - This is all a bot may read by default.

If the bot needs to post reminders or summaries, it should operate from redacted status events only.

### Consequence

A bot-blind architecture means the bot cannot be the canonical reducer for private state unless users explicitly grant it room-key access. That is acceptable.

Preferred flow:

1. Human clients hold/decrypt private envelopes.
2. Human clients locally reduce full board state.
3. A coordinator/client publishes a redacted status projection for shared convenience.
4. Bot/agent reads only the redacted projection and can remind/summarize without seeing private proof data.

### Open design question

We still need to choose the concrete private-room mechanism:

- mature BUZZ private room API, if available and exportable
- Nostr group encryption, if client support is usable
- pairwise NIP-17 fanout as fallback
- non-Nostr private room with Nostr public/redacted projection

Until that is proven, the current PWA/manual-share alpha remains the live path.
