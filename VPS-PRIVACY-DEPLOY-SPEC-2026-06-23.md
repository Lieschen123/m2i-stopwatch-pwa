# M2I PWA VPS Privacy Deployment Spec

Date: 2026-06-23
Status: Draft before deploy

## Goal

Deploy the M2I Move2Improve App over HTTPS for real iPhone GPS testing without weakening the privacy model.

The VPS must only serve the static PWA. It must not become a tracker, GPS backend, payment observer, or settlement authority.

## Preferred Shape

Use a dedicated subdomain, not a path on the existing bot host.

Preferred:

- `https://app.move2improve.io/`
- static files from `/var/www/m2i-stopwatch-pwa/current/`

Avoid for production-like testing:

- `https://auth.move2improve.io/pwa/`

Reason: the current PWA build assumes root paths for `/manifest.webmanifest`, `/sw.js`, `/assets/...`, and service-worker scope. A subpath deploy needs a base-path patch. A dedicated subdomain keeps the PWA simple and isolates it from the bot.

## Privacy Requirements

The server must not receive or store workout data.

Hard rules:

- no analytics
- no tracking pixels
- no external JS/CDNs/fonts
- no route upload
- no coordinate upload
- no payment settlement callbacks
- no wallet-open telemetry
- no bot-observed payment behavior
- no challenge/user/IP correlation beyond unavoidable short operational logs

## Server Log Policy

Preferred nginx policy:

- disable access logs for the PWA host, or
- log only operational errors, not access events

Recommended:

```nginx
access_log off;
error_log /var/log/nginx/m2i-app.error.log warn;
```

If temporary access logs are needed for debugging, retention must be short and explicitly time-boxed.

## Security Headers

The deployed static host should set:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src wss://*; manifest-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(self), microphone=(), camera=(), payment=()
```

GPS is allowed only for the same-origin PWA. Camera, microphone, and browser payment APIs stay disabled.

## Data Flow

Allowed:

- browser downloads static app files
- browser asks user for GPS permission
- GPS samples stay in browser memory
- browser calculates aggregate distance locally
- browser discards route points on finish
- browser creates locally signed private claim
- optional redacted public Nostr share

Not allowed:

- server-side GPS processing
- server-side route storage
- server-side payment verification
- server-side wallet telemetry
- raw health data
- user tracking analytics

## Deployment Steps

1. Build locally:

```bash
npm test
npm run build
```

2. Upload only `dist/` to VPS release directory.

3. Point nginx host root to release directory or update `current` symlink.

4. Reload nginx.

5. Verify:

```bash
curl -I https://app.move2improve.io/
curl -I https://app.move2improve.io/sw.js
curl -I https://app.move2improve.io/manifest.webmanifest
```

6. iPhone smoke test:

- open HTTPS URL
- enable GPS aggregate
- confirm iOS location permission prompt
- walk 2-3 minutes
- verify distance changes from waiting/no samples to non-zero estimate
- finish claim
- verify final claim contains aggregate distance only

## Deployment Gate

Do not call the GPS feature verified until the HTTPS iPhone smoke test shows accepted GPS samples and a non-zero aggregate distance.

## Open Questions Before Deploy

- Is DNS for `app.move2improve.io` already pointed at the VPS?
- If not, should we use existing `auth.move2improve.io` temporarily, or create DNS first?
- Which nginx config owns the existing `auth.move2improve.io` bot host?
- Can we add a second server block without disturbing the production bot?
