# Move2Improve Stopwatch PWA

A static, browser-only stopwatch that signs workout duration claims with a local Nostr key. No server, no registration, no sensors, no GPS, no HealthKit, no analytics.

## What It Does

- Generates a new Nostr private key (`nsec`) locally or imports an existing one.
- Stores the key only in this origin's `localStorage`.
- Runs a timestamp-based stopwatch that survives tab backgrounding and can resume from stored active state.
- Requests Wake Lock only after the user starts a workout.
- Creates canonical JSON claims and signs them as Nostr addressable events.
- Publishes to user-configured Nostr relays or wraps the event as a NIP-17 DM to a counterpart npub.
- Keeps local claim history for copy/resend.
- Installs as an offline-capable PWA.

## Nostr Kind

The original draft proposed `kind:30315`, but current NIPs assign that kind to NIP-38 User Status. This app uses `kind:30316` for Move2Improve stopwatch claims. Events include:

- `d`: challenge code
- `duration`: duration in seconds
- `target`: optional target seconds
- `counterpart`: optional counterpart pubkey hex
- `client`: `m2i-stopwatch-v1`
- `t`: `m2i`

## Local Development

This session could not reach `registry.npmjs.org`, so `package.json` uses local `file:` dependencies for the already-installed Move2Improve Nostr packages. On a normal machine, these can be changed back to registry versions before publishing.

```bash
npm install
npm run dev
```

Open the URL printed by the dev server, normally:

```text
http://127.0.0.1:5173
```

In this OpenClaw sandbox, binding a local port returns `EPERM`, so the dev server script builds correctly but cannot listen here. Run it in a normal terminal for interactive testing.

## Build

```bash
npm run build
```

Output goes to `dist/`. The production bundle is self-contained and static-hostable.

## Test

```bash
npm test
```

Smoke tests cover:

- canonical JSON sorting
- claim hash stability
- Nostr key generation
- sign-and-verify round trip
- localStorage adapter persistence
- NIP-17 wrapping helper availability

## Cloudflare Pages Deploy

Do not deploy from this repo automatically until Nono is ready. Manual setup:

```bash
npm install
npm run build
npx wrangler pages project create m2i-stopwatch-pwa
npx wrangler pages deploy dist --project-name m2i-stopwatch-pwa
```

For GitHub-based Pages deployment:

- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`

## DNS For igotthis.move2improve.io

In Cloudflare DNS for `move2improve.io`:

- Type: `CNAME`
- Name: `igotthis`
- Target: the Cloudflare Pages hostname for the project, for example `m2i-stopwatch-pwa.pages.dev`
- Proxy: enabled unless Cloudflare Pages custom domain setup says otherwise

Then add `igotthis.move2improve.io` as a custom domain in Cloudflare Pages.

## HTTPS Verification

After DNS propagation:

```bash
curl -I https://igotthis.move2improve.io
```

Expected:

- HTTP status `200` or `304`
- Valid TLS certificate in browser
- Service worker registers from the same origin
- `_headers` applies the CSP and privacy headers

## Privacy Checklist

- Private key is never sent to relays or servers.
- Only signed public Nostr events or NIP-17 wrapped messages are transmitted.
- No cookies.
- No analytics.
- No third-party runtime scripts or CDNs.
- Service worker only caches same-origin GET requests.
- CSP allows only same-origin assets and WebSocket relay connections.

## Notes For Publishing

Before making this public, replace local `file:` dependencies with normal registry versions and run `npm install` on a machine with network access. The app code itself does not require any server component.
