# Track B — Keet-Integration Research

**Ziel:** In 2-4 Wochen laufender Prototyp PWA + Keet-Room-Sync.
**Timeline:** Woche 1 Research, Woche 2-4 Prototyp.
**Status:** ✅ **Woche-1-Research abgeschlossen 2026-07-07 — Entscheidungsvorlage bereit**

---

## TL;DR — Empfehlung nach Research

**Direkte PWA → Keet-Room-Integration ist heute NICHT möglich.** Der Weg ist versperrt durch drei harte Blocker:

1. **Kein öffentliches Keet-Bot-SDK.** Explizit dokumentiert im GitHub-Issue `holepunchto/hyperswarm#210` (März 2026): "The true Keet Bot SDK has been quietly under development" — externe Devs haben kein Zugriff. Selbst wer hyperswarm+hypercore erfolgreich nutzt, kann nicht in Keet-Rooms senden weil das Payload-Format proprietär ist (Protobuf/Compact Encoding, undokumentiert).

2. **Browser-Pfad ist tot.** `hyperswarm-web` (die einzige browser-taugliche Implementierung) ist seit 4 Jahren nicht mehr released (letzte Version Feb 2022, v2.2.0). Aktueller Hypercore/Hyperswarm-Stack ist Node.js + Bare Runtime only.

3. **Pear ist Desktop-Runtime, nicht Web-Runtime.** Holepunch positioniert Pear explizit als installierbare P2P-Runtime für Desktop/Mobile/Terminal. Docs sagen "unstoppable, zero-infrastructure P2P apps" — aber nicht "im Browser".

**Konsequenz:** Track B als "PWA↔Keet-Room" ist nicht realistisch für V2 in 2-4 Wochen. Wir haben drei ehrliche Alternativen (siehe unten).

**Sofortige Aktion:** Track A (Manual-Share V1) ist damit noch wichtiger geworden. Learning-Loop-First bleibt richtig.

---

## Research-Ergebnisse (Woche 1)

### 1. Keet-SDK Reifegrad

- **Existiert öffentliches SDK / API?** ❌ Nein für Bot/Room-Interop. Ja für Bare/Hypercore/Hyperswarm einzeln.
- **Docs-URL:** `https://docs.pears.com/` (früher docs.holepunch.to, redirected)
- **Breaking-Change-Frequenz:** Pear/Bare als "unstable" bzw. "experimental" markiert in offiziellen Docs
- **Aktive Community-Kanäle:** GitHub `holepunchto/*` (aktiv), Keet-App selbst als Chat-Kanal, kein öffentliches Discord
- **Wichtiger Fund:** GitHub-Issue #210 auf hyperswarm bestätigt dass externe Entwickler keinen Zugang zum Keet-Bot-Nachrichtenformat haben. Zitat: *"we cannot parse the specific Protobuf/Compact Encoding multiplexing used internally by the Pear Runtime / Keet GUI."*

### 2. Integration-Pfade — was geht, was nicht

| Pfad | Machbarkeit | Aufwand | V1-Kompatibel |
|------|-------------|---------|---------------|
| PWA (Browser) ↔ Keet-Room direkt | ❌ Nein | — | Nein |
| PWA ↔ Hypercore-Room (nicht Keet) via `hyperswarm-web` | ❌ Nein (Lib tot) | — | Nein |
| Pear-Desktop-App ↔ Hypercore-Room | ⚠️ Möglich, aber nicht PWA | 3-4 Wochen | Nein |
| Pear-Mobile-App (Bare Runtime) | ⚠️ Möglich, sehr neu | 4-6 Wochen | Nein |
| Companion Desktop-App zur PWA | ⚠️ Möglich, komplexes UX | 2-3 Wochen | Ja (als Sidecar) |
| Nostr NIP-17 Auto-Sync via bot | ✅ Existiert schon (im move2improve Repo) | 3-5 Tage | Ja |

### 3. Reference-Implementations gefunden

- **`holepunchto/hello-pear-electron`** — offizielles Template, Electron + Bare Runtime
- **`holepunchto/keet-mobile-releases`** — Keet Mobile, aber ohne SDK-Zugriff
- **`RangerMauve/hyperswarm-web`** — der historische Browser-Ansatz, seit 2022 tot
- **CoPaw / AgentScope Integration-Versuch (März 2026)** — bestätigt: Node.js Sidecar mit hyperswarm/hypercore funktioniert, aber Keet-Room-Payload lässt sich nicht dekodieren

### 4. Alternative Track-B-Pfade wenn Keet-direkt-Sync nicht geht

**Alternative A — Nostr NIP-17 Auto-Sync ausbauen (bevorzugt):**
- Signed Claims werden automatisch als encrypted DMs zwischen Buddies gepusht
- PWA horcht auf Nostr-Relay, dekodiert NIP-17, verifiziert Signature, updated Board
- Nutzt existing Nostr-Bot-Code in `~/Projects/move2improve/nostr-bot.js`
- UX: Board updated automatisch alle X Min ohne Copy/Paste
- Aufwand: ~5-7 Tage (Nostr-Relay-Subscription in PWA, NIP-17 unwrap client-side, Duplicate-Handling)
- **Privacy:** Bleibt strong. NIP-17 ist E2E-encrypted, Relay sieht nur verschlüsselte Blobs.
- Nachteil: Nostr-Relay als Trust-Anchor (aber nicht als Data-Holder)

**Alternative B — Pear Desktop Companion Sidecar:**
- User installiert Pear-App neben PWA
- Sidecar hält Hypercore-Room offen, PWA reicht Claims via localhost:XXXX rüber
- Sidecar published in Room, andere Buddies (auch mit Sidecar) empfangen
- Aufwand: 3-4 Wochen (Electron/Bare-App neu schreiben)
- Nachteil: 2 Apps zu installieren, brechen die "smooth PWA-UX" These
- Vorteil: True P2P, kein Relay als Vermittler

**Alternative C — Warten auf Keet Bot SDK (undefiniertes Datum):**
- GitHub-Issue #210 bestätigt: "quietly under development"
- Kein öffentlicher Release-Termin
- Aufwand: 0 Woche jetzt, unklar wann verfügbar
- Nachteil: Weder Priorität noch Timing planbar. Nicht als V2-Path.

### Meine Empfehlung (nach Research)

**Reframe Track B von "Keet direkt" zu "Nostr NIP-17 Auto-Sync".** Das bringt uns 90% des UX-Wins von Keet (kein Copy/Paste, automatische Board-Updates) ohne die harten Blocker. Keet-Path bleibt als V3+ Watch-Item wenn Bot-SDK released wird.

---

## Angepasste Prototyp-Milestones (Woche 2-4)

**Umbenannt: Track B = "Auto-Sync V2 über Nostr NIP-17"**

### Meilenstein 1: Nostr-Sub in PWA
- [ ] PWA öffnet WebSocket zu Damus/Primal-Relays beim Board-Öffnen
- [ ] Filter auf NIP-17 DMs an eigenen Pubkey mit M2I-Tag
- [ ] Empfangene DMs werden dekodiert (nutzt existing `nostr.js`)

### Meilenstein 2: Signed Claim Discovery
- [ ] Auf Buddy-Update-Nachrichten filtern (`m2i_share` Marker + version)
- [ ] Signature-Verifikation client-side
- [ ] Duplikate erkennen (event.id)
- [ ] Automatisch als `saveImportedProof` speichern

### Meilenstein 3: Board Auto-Update
- [ ] Board re-rendert alle X Sekunden mit neuen Claims
- [ ] Freshness-Timestamp echt-Zeit
- [ ] Manual-Share-Button bleibt als Fallback ("Sync failed? Copy/Paste")

### Meilenstein 4: Nono ↔ Runner 2 Live-Test
- [ ] Beide PWAs verbunden mit gleichen Relays
- [ ] Auto-Board-Update ohne Chat-Copy/Paste
- [ ] Vergleich UX zu Manual-Share V1

---

## Research-Log

### Session 1: Erste Keet-SDK-Suche (2026-07-07)

**Quellen geprüft:**
- github.com/holepunchto — Overview repo bestätigt Ecosystem, kein Public Keet-SDK
- docs.holepunch.to → docs.pears.com — Getting-Started-Docs, keine Keet-Bot-API
- github.com/holepunchto/hyperswarm/issues/210 — **kritischer Fund**: externe Devs blockiert
- keet.io — Endnutzer-Landing, nichts für Devs

**Kern-Zitate:**
- Bitcoin Magazine 2022: "a single frontend developer to build Keet in under four months"
- Holepunch: "collection of small Javascript modules that can be combined"
- Issue #210 (März 2026): "raw messages are dropped or fail to decode because we cannot parse the specific Protobuf/Compact Encoding multiplexing used internally by the Pear Runtime / Keet GUI"

**Fazit Session 1:** Keet-Bot-SDK nicht public. hyperswarm-web tot. Pear ist Desktop-Runtime. → Reframe nötig.

---

## Angepasste Risiken

**Hoch:**
- ~~Keet-SDK nicht production-ready~~ **NEU:** Keet-Bot-SDK nicht public, unklare Timeline
- ~~Browser-Support fehlt~~ **NEU:** Browser-Support existiert nicht, `hyperswarm-web` seit 4 Jahren tot

**Mittel:**
- Nostr-Relays als Vermittler (aber E2E-encrypted → kein Content-Leak)
- NIP-17 Adoption noch klein — nicht alle Clients supporten
- Nono/Runner 2 müssen beide PWA offen halten für Auto-Sync (oder Push-Notifications später bauen)

**Niedrig:**
- Nostr-Relays gehen gleichzeitig offline (3-4 Relays parallel = fällt einer aus, andere übernehmen)

## Entscheidungs-Gate — Nono muss wählen

**Nach dem Research heute stehen 3 Pfade offen:**

### Pfad 1 — Track B = Nostr Auto-Sync (Empfehlung)
- Timeline: 5-7 Tage nach Track A Live-Test
- Behält "Auto-Sync ohne Bot als Trust-Anchor" These
- Nutzt existing NIP-17-Code
- **Realistischer 2-Wochen-Zeitrahmen**

### Pfad 2 — Track B = Warten auf Keet Bot SDK
- Timeline: Unklar (Wochen bis Monate)
- Reine Beobachtung, kein Bau
- **Nicht empfohlen** — Track B wird zu Beobachtungs-Item

### Pfad 3 — Track B = Pear Desktop Companion
- Timeline: 3-4 Wochen
- Bricht "PWA-Only-UX" These
- True P2P via Hypercore, kein Relay
- **Nur wenn Nono P2P-Purismus über UX-Simplicity stellt**

## ✅ Entscheidung 2026-07-07 15:21

**Track B = Nostr NIP-17 Auto-Sync.** Implementation Start: nach Track A Live-Test mit Runner 2 (voraussichtlich Woche 2 nach Buddy-Onboarding).

**Keet = V3+ Watch-Item.** Still beobachten, aktiv nicht bauen.

### Watch-Trigger für Keet-Re-Evaluation

Einer der folgenden Trigger → aktive Re-Evaluation ob Track B/C von Nostr zu Keet migriert werden soll:

1. **Keet Bot SDK wird öffentlich released** (aktuell "quietly under development" laut Issue #210)
2. **hyperswarm-web bekommt neuen Release** oder wird durch Nachfolger ersetzt (aktuell seit 2022 tot)
3. **Pear kommt als Web/Browser-Runtime** (aktuell nur Desktop/Mobile/Terminal)
4. **Keet-Adoption in Zielgruppe (BTC/Nostr) wird signifikant** — wenn Buddies eh schon Keet nutzen, kippt die UX-Rechnung

**Wenn kein Trigger feuert:** Stille Beobachtung im Quartals-Rhythmus, kein Bau.

### QVAC-Positionierung bleibt gültig

Unabhängig vom Transport-Layer: Move2Improve teilt das QVAC-Kernprinzip (lokale Wahrheit, kryptographisch verifiziert, kein Server als Wahrheitsbroker). Die öffentliche These "Move2Improve wendet QVAC-Prinzip auf Commitment an" ist unabhängig davon ob wir konkret auf Keet gehen oder auf Nostr bleiben — das ist Transport, nicht Prinzip.

---

## Change-Log

- **2026-07-07 15:21** Entscheidung: Track B = Nostr Auto-Sync. Keet = V3+ Watch-Item mit klaren Re-Evaluation-Triggern. QVAC-These separat von Transport-Layer.
- **2026-07-07 14:45** Research-Session 1 abgeschlossen. Keet-direkt = nicht möglich. Nostr NIP-17 als realistischer V2-Pfad identifiziert.
- **2026-07-07 12:xx** File erstellt (Kickoff), Research pending
