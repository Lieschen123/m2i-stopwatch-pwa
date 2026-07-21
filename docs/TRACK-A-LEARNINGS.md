# Track A — Manual-Share V1 Learnings

**Ziel:** Board + Manual-Share in PWA, mit ersten echten Buddy testen.
**Timeline:** 5 Tage Bau, dann Live-Test.
**Status:** ⏳ Kickoff pending (Codex-Task muss gestartet werden)

---

## Bau-Phase

### Codex-Auftrag (bereit für Kickoff)

**Repo:** `~/Projects/m2i-stopwatch-pwa/`

**Files to add/change:**
- `src/board.js` (new)
- `src/share.js` (new)
- `src/store.js` (extend for buddy_claims)
- `src/main.js` (add Board route)
- `src/index.html` (Board UI)

**Estimated:** ~280 LOC, 3-5 Tage Codex-Zeit.

**Spec:** siehe `COORDINATION-V1-SPEC.md` Track A Section.

**Command to start:**
```bash
codex exec "Read docs/COORDINATION-V1-SPEC.md fully. Implement Track A V1: Board-View + Share/Import buttons. Use existing computeParticipantProgress from challenge.js. Follow privacy principle: no data leaves except via explicit Share button. Write progress to docs/TRACK-A-LEARNINGS.md after each milestone."
```

### Bau-Milestones (zu tracken)

- [x] `board.js` skeleton mit Progress-Berechnung — done 2026-07-07
- [x] Board UI (HTML/CSS) — Liste + Farben + Frische — done 2026-07-07
- [x] `share.js` mit Copy-to-Clipboard — done 2026-07-07 (`board-share.js`)
- [x] Import-Interface mit Signatur-Verifikation — done 2026-07-07 (nutzt existing envelope)
- [x] `store.js` erweitert um buddy_claims — nutzt existing `saveImportedProof`
- [x] Merge in main.js + Navigation — done 2026-07-07
- [x] Tests (8 board-tests grn, 56 total) — done 2026-07-07
- [x] Build grün (162 KB bundle) — done 2026-07-07
- [ ] Selbst-Test mit 2 Browser-Profilen ✓ — pending: `npm run dev`
- [ ] Deploy als GitHub Pages — pending
- [ ] Bug-Sweep — pending

---

## Test-Phase

### Erster Buddy

**Name:** **Runner 2** (Selbst-Alias, aussuchen sobald sie mitmacht — der Namensakt ist Teil des Commitments)
**Kanal:** ⏳ offen (Runner 2's Wahl — Nostr / Signal / WhatsApp / Keet)
**Challenge:** ⏳ offen (Vorschlag Default: 20 Runs / 30 Tage, Stake 21.000 sats oder 20 USDt, Team Jar)
**Status:** ⏳ Invite noch nicht versendet (Message-Varianten in `RUNNER-2-INVITE.md`)

### Setup-Session (~30 Min)

- [ ] Buddy PWA installieren
- [ ] Nostr-Bot Setup (challenge via Nostr-DM)
- [ ] Erste Test-Sync (Manual-Share funktioniert?)
- [ ] Board sichtbar bei beiden?

### Live-Test (7 Tage minimum)

- [ ] Tag 1: Beide erste Runs, Sync via Chat
- [ ] Tag 3: Mid-week Check — funktioniert Frische-Anzeige?
- [ ] Tag 7: Ende Woche — Sunday-Reminder testen
- [ ] Weekly Debrief mit Buddy

---

## Learnings (wird während Live-Test befüllt)

### Was funktioniert
_(pending Live-Test)_

### Was nervt
_(pending Live-Test)_

### Was fehlt sofort
_(pending Live-Test)_

### Ist Manual-Share zumutbar?
_(pending Live-Test)_

### Ist wöchentliche Frequenz richtig?
_(pending Live-Test)_

### Löst Board wirklich soziale Kontrolle aus?
_(pending Live-Test)_

---

## Entscheidungs-Gate für Track B

Nach 7 Tagen Live-Test:

**Wenn Board sinnvoll + Manual-Share nervt:**
→ Track B (Keet-Integration) mit hoher Priorität weiter

**Wenn Board sinnvoll + Manual-Share ok:**
→ Track B weniger dringend, Fokus auf Board-Polish

**Wenn Board nicht sinnvoll:**
→ Reframe der Coordination-These
→ Track B pausieren

---

## Change-Log

- **2026-07-07** File erstellt, Codex-Task ready für Kickoff
