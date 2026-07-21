# M2I Coordination Layer — V1 Spec

**Datum:** 2026-07-07
**Status:** Live-Doc, wird während Loop-Modus aktualisiert
**Kontext:** Nach Konversation mit Lieschen — Reframe von M2I als Commitment-Device zwischen Menschen die sich kennen.

---

## Kern-These (fixiert 2026-07-07)

> "Ich von heute will, dass ich von morgen etwas anderes will."

M2I löst das **älteste menschliche Problem** durch strukturierte Kombination von:
1. Ich-heute macht Commitment mit echtem Wert (Sats oder USDt, nicht Punkte)
2. Ich-morgen kann nicht mogeln (kryptographischer Beweis)
3. Andere Menschen sind dabei (sozialer Vertrag, nicht einsam)
4. Konsequenz ist real und nicht verhandelbar
5. Kein Konzern in der Mitte (P2P, souverän)

**Wir bauen KEINE Fitness-App. Wir bauen ein Commitment-Device mit echtem Skin.**

## Zielgruppe (klar geworden)

- Kleine Gruppen (2-8 Menschen) die sich **kennen**
- Fitness ernst nehmen, nicht nur als Deko
- Offen für Privacy-Prinzipien (BTC-nativ oder BTC-neugierig)
- Können ihre Menschen auf Keet holen (Nono's Einschätzung)

**NICHT** Zielgruppe (V1):
- Stranger-Pools ohne Vertrauen
- Massen-Rollout
- Kids/Familien
- Reine Fitness-Tracker-User

## Die vier Layer-Trennung (fixiert)

```
┌─────────────────────────────────────────────────────┐
│  1. CANONICAL CLAIM (unverändert, deine Juni-Base)  │
│     Signed JSON, kind 30316                         │
│     Wahrheit über Aktivität, Transport-agnostisch   │
├─────────────────────────────────────────────────────┤
│  2. COORDINATION LAYER (das was wir bauen)          │
│     Peer-to-Peer Sichtbarkeit während Challenge     │
│     V1: Manual-Share via Copy/Paste                 │
│     V2: Auto-Sync via Keet-Room                     │
├─────────────────────────────────────────────────────┤
│  3. BOARD (PWA-View)                                │
│     Rendert Coordination-Zustand als Team-Status    │
│     Lokal in Browser, keine Backend-Abhängigkeit    │
├─────────────────────────────────────────────────────┤
│  4. BOT (Setup + Reminders + Settlement)            │
│     Nostr-Bot (primary), Telegram-Bot (fallback)    │
│     KEIN Keet-Bot                                   │
│     Sieht keine Progress-Daten während Challenge    │
└─────────────────────────────────────────────────────┘
```

**Prinzip:** Signed Claim ist die Wahrheit. Transport ist austauschbar. Board rendert lokal.

## Privacy-Prinzip (fixiert)

> "Wir teilen keine Daten, die jemand nicht selber teilt."

Alle Design-Entscheidungen müssen diesem Prinzip standhalten. Konkret:
- Kein zentraler Server sieht Progress-Aggregat
- Jeder User entscheidet was er in die Gruppe published
- Board zeigt nur was Teilnehmer aktiv geteilt haben
- Bot sieht keine wöchentlichen Updates zwischen Teilnehmern

## Stake-Optionen (fixiert)

- **Sats/Lightning** — für Bitcoin-native User (steht zuerst)
- **USDt/TON** — Bridge-Option für Non-BTC-User (steht danach)
- Beide gleichwertig, User wählt
- **Warum USDt bewusst dabei ist:** Bridge zu BTC + Wallet-Nutzung + keine DE-Steuer-Trigger auf Wertänderung
- Team Jar (nicht Cause) — Missed-Pot bleibt in der Gruppe

## Trust-Satz (muss unter beiden Stakes stehen)

> "M2I never holds funds, pays automatically, or monitors settlement."

---

## Loop-Modus Struktur

### Track A — Test with what we have (SOFORT)
Manual-Share V1 diese Woche bauen und mit erstem Buddy testen.

### Track B — Build the destination (PARALLEL)
Keet-Integration erforschen und prototypen, damit V2-Ready wenn Track A Learning liefert.

### Warum Dual-Track

- Track A liefert schnelle Learning ob Board an sich sinnvoll ist
- Track B baut die "richtige" Lösung wo wir hin wollen
- Fallback wenn Track B (Keet) blockiert wird durch SDK-Reife
- Compaction-safe: beides läuft parallel in Files dokumentiert

---

## Track A — Manual-Share V1 (this week)

**Goal:** Board läuft in PWA mit Manual-Share zwischen Teilnehmern via beliebigen Chat.

### V1 Feature Set

**Board-View in PWA:**
- Liste Teilnehmer + Progress-Zahlen
- Frische-Timestamp pro Buddy ("last update: 2h ago")
- Ampel-Farben (green/yellow/red für "on track / behind / at risk")
- Missed-Pot-Vorhersage ("If nothing changes: Ben → 2100 sats to Team Jar")
- Team Jar Wallet + History

**"Share my update" Button:**
- Aggregiere meine Claims in ein JSON-Payload
- Signiere mit meinem Schlüssel
- Copy to Clipboard
- User pasted in beliebigen Chat (Keet, WhatsApp, Signal, Telegram)

**"Import buddy update" Button:**
- Paste-Field für buddy update
- Signatur-Verifikation
- Merge in lokale Datenbank
- Board rendert neu

**Weekly Reminder (via Nostr-Bot):**
- Sonntag Abend Cron
- DM an alle Teilnehmer: "Share your state for the week"
- Kein Progress-Zugriff durch Bot, nur Timer

### Codex-Aufgabe für Track A

Repository: `~/Projects/m2i-stopwatch-pwa/`

Neue/geänderte Files:
- `src/board.js` (neu) — Board-View + Progress-Berechnung
- `src/share.js` (neu) — Copy/Paste-Interface
- `src/store.js` (bestehend) — Erweiterung um buddy_claims Tabelle
- `src/main.js` (bestehend) — Board-Route + Navigation

Estimated Code: ~280 Zeilen, 3-5 Tage Codex-Zeit.

Nutzung von bestehendem Code:
- `computeParticipantProgress` (in challenge.js)
- `getChallengeSettlementStatus` (in challenge.js)
- Signatur-Verifikation via `envelope.js`
- Datenbank-Schema aus challenge.js

### Track A Test-Plan

1. Codex baut Board + Share/Import
2. Nono selbst-testet mit zwei Browser-Profilen
3. Nono lädt ersten Buddy ein (Name pending)
4. Erste echte Challenge läuft
5. Wöchentliche Manual-Sync-Test
6. Learning-Log geführt in `docs/TRACK-A-LEARNINGS.md`

### Learning-Fragen für Track A

- Nutzen Buddies das Board überhaupt oder ist es Deko?
- Ist Manual-Share zumutbar oder abschreckend?
- Was fehlt sofort? (Notifications, bessere Frische-Info, ...)
- Ist wöchentliche Sync-Frequenz richtig?
- Löst das Board tatsächlich soziale Kontrolle aus?

---

## Track B — Keet-Integration Research + Prototyp

**Goal:** In 2-4 Wochen einen laufenden Prototypen haben der PWA + Keet-Room-Sync zeigt.

### Was zu klären ist (Research-Phase, Woche 1)

**Keet-SDK-Reifegrad:**
- Existiert öffentliches SDK oder API?
- Docs verfügbar? Beispiele?
- Wo ist die Developer-Community?
- Breaking-Change-Frequenz einschätzen

**Integrations-Muster:**
- Kann PWA (Browser) sich mit Keet-Room verbinden?
- Oder braucht es Native-App / Wrapper?
- WebRTC / Hyperswarm-in-Browser möglich?
- Falls Browser nicht geht: Fallback via Companion-App auf Desktop?

**Reference-Implementations:**
- Andere Apps mit Keet-Integration finden
- Von deren Learnings profitieren

### Wenn Research grün (Woche 2-4)

**Keet-Room-Bridge:**
- PWA published Claims in Keet-Room automatisch
- PWA lauscht Keet-Room für Buddy-Updates
- Kein Manual-Share mehr nötig
- Board auto-updated

**Onboarding-Flow:**
- Buddy installiert Keet
- Nono lädt Buddy in Keet-Room ein
- PWA verbindet sich mit Keet-Room (QR-Code oder Deep-Link)
- Fertig

**Fallback bleibt Manual-Share** im Code für User ohne Keet.

### Wenn Research rot (Blockade in SDK/Browser-Support)

Alternativen die vorbereitet sein müssen:
- Nostr NIP-17 Auto-Sync (existiert im Bot bereits)
- Manual-Share bleibt Standard
- Warten auf besseren Keet-Support (Watch-Item, nicht Bau-Item)

### Track B Meilensteine

- **Woche 1:** Research-Report als `docs/TRACK-B-KEET-RESEARCH.md`
- **Woche 2:** Prototyp "hello world" — PWA published in Keet-Room
- **Woche 3:** Prototyp "board sync" — beide PWAs sehen dasselbe Board
- **Woche 4:** Entscheidung: V2 bauen? Wenn ja, Migration-Plan zu V2.

---

## Bot-Architektur (fixiert)

**Nostr-Bot bleibt Primary:**
- Setup (Challenge-Definition, Roster, Stakes)
- Weekly Reminder (Cron, kein Progress-Zugriff)
- Settlement am Ende der Challenge
- User-Identität via npub

**Telegram-Bot bleibt Fallback:**
- Für User ohne Nostr-Kenntnisse
- Gleiche Commands, gleiche DB
- Minimal-Maintain, nicht aktiv gepusht

**Kein Keet-Bot:**
- Keet-Rooms sind FÜR Coordination, nicht FÜR Bot-Presence
- Bot als Room-Teilnehmer sieht alles = Privacy-Verstoß
- Coordination läuft PWA-zu-PWA in Keet-Room

**Der Sinn-Test:**
> "Wenn der Bot tot wäre, funktioniert die Challenge trotzdem?"

Mit diesem Design: **Ja.** Setup manuell möglich. Reminders selbst. Board läuft. Settlement per Trust zwischen Buddies. Bot ist Convenience, nicht Trust-Layer.

---

## Board Design (V1)

```
Team Aufwachen — 20/30 aktive Tage
Deadline: 31. Juli 2026 (24 Tage übrig)
Team Jar: 4200 sats + 8 USDt

Status:
✅ Nono         18/20 aktive Tage    last: 5 min ago      ✓ on track
🟡 Alex         14/20 aktive Tage    last: 2 days ago     ⚠ 2 behind
🔴 Ben           8/20 aktive Tage    last: 5 days ago     ⚠ likely miss
✅ Sarah        20/20 aktive Tage    last: 1h ago         ✓ complete!

Prognose:
Wenn niemand nachlegt: Ben → 2100 sats an Team Jar

[Share my update]  [Import buddy update]

Team Jar Wallet: bc1q... (History)
```

### Design-Prinzipien

1. **Aggressive Transparenz mit Opt-Out** — wer nicht will kann verstecken, aber Default ist "zeig alles"
2. **Ehrlichkeit über Frische** — "last: X ago" macht klar dass Info alt sein kann
3. **Prognose statt Beschuldigung** — Zahlen sprechen, keine Wertung
4. **Missed-Pot-Vorhersage** — macht Konsequenz greifbar in Real-Time

---

## Weekly Reminder Flow (V1)

**Sonntag Abend, Nostr-Bot Cron:**

DM an alle Teilnehmer:
```
📊 Wochenrückblick fällig

Team Aufwachen — Woche 2 von 4

Bitte teile deinen Stand:
1. Öffne PWA
2. Klick "Share my update"
3. Paste in Keet-Room / Chat

Danke!
```

**Bot published:** nur den Reminder-Text
**Bot sieht:** nichts von deinem Progress
**Bot speichert:** timestamp des Reminders für Debug

---

## Migration-Pfad V1 → V2

Wenn Track A Learnings + Track B Prototyp beide grün:

**Woche 5-6:**
- Board V2 Design mit Auto-Sync
- Migration-Doku für bestehende Alpha-User
- Manual-Share bleibt als Fallback im Code
- Nostr-Bot Reminder-Text erweitert um "in Keet-Room passiert alles automatisch"

**Compatibility:**
- Alte signed Claims funktionieren in V2 unverändert
- V1 Board-View bleibt für Legacy-User verfügbar
- User kann pro Challenge wählen: Manual oder Keet-Auto

---

## Open Questions (für Loop-Iterations)

1. **Erster Buddy — wer?** Name pending. Alex? Bruder? BTC-Kumpel?
2. **Keet-SDK-Reife** — muss Track B Research klären
3. **Board für Solo-Challenges** — ist das sinnvoll oder nur Multi-Player?
4. **Notifications** — V1 ohne Push? Oder minimal ("neuer Buddy-Update")?
5. **History-View** — braucht Board eine Zeitachse ("Alex war Tag 5-10 stark")?

---

## Referenzen

- Kern-Konvers (Kontext): Telegram-Chat mit Lieschen am 2026-07-07
- Juni-2026 Architektur-Doc: `~/Projects/move2improve/ARCHITECTURE-PRIVACY-DECISIONS-2026-06-19.md`
- PWA-Repo: `~/Projects/m2i-stopwatch-pwa/`
- Bot-Repo: `~/Projects/move2improve/`
- Paolo/QVAC-Inspiration: X-Post 2026-07-07 (Keet + On-device translation)

## Change-Log

- **2026-07-07 13:37** Erstellt. Basis für Loop-Modus Track A + Track B.
