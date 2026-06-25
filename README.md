<div align="center">

<img src="assets/logo.png" alt="MAX" width="120" height="120" />

# Max Web

**Self-hosted [MAX](https://max.ru) web client — run the messenger from your own domain.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED.svg?logo=docker&logoColor=white)](docker-compose.yml)
[![nginx](https://img.shields.io/badge/nginx-reverse--proxy-009639.svg?logo=nginx&logoColor=white)](nginx/)

</div>

---

## What is this

Max Web serves the official MAX web client from **your own server**, so you can
use the messenger on your own domain. All messaging still runs on MAX's
infrastructure — your server only:

1. serves the official client over your domain, and
2. relays the single backend WebSocket (`api.oneme.ru`) while fixing the
   `Origin` header.

> **Why the relay is required.** The MAX backend rejects the WebSocket handshake
> with **HTTP 403** when the page `Origin` is not an official MAX domain, and a
> browser cannot forge that header. So nginx relays the socket and sets
> `Origin: https://web.max.ru`. This was verified empirically, not assumed.

There is no separate backend to maintain — the "backend" is one `location` block
in nginx.

---

## Installation

### Quick try (local, no domain needed)

```bash
git clone https://github.com/WallD3v/MaxWeb.git
cd MaxWeb
docker compose -f docker-compose.local.yml up
```

Open **http://localhost:8080** and sign in with the QR code.

### Production (your domain, HTTPS)

```bash
git clone https://github.com/WallD3v/MaxWeb.git
cd MaxWeb
cp .env.example .env              # set MAX_DOMAIN and LETSENCRYPT_EMAIL
./scripts/init-letsencrypt.sh     # one-time TLS certificate
docker compose up -d
```

Open **https://your-domain** and sign in with the QR code.

**Requirements:** Docker + Docker Compose, a domain with an A/AAAA record
pointing at the server, and ports 80/443 open.

---

## Configuration

| Variable            | Description                                   | Example              |
| ------------------- | --------------------------------------------- | -------------------- |
| `MAX_DOMAIN`        | Domain that serves the client                 | `max.example.com`    |
| `LETSENCRYPT_EMAIL` | Email for certificate expiry notices          | `you@example.com`    |

---

## Privacy hardening

A small script (`nginx/brand/inject.js`) runs before the app and, without
breaking messaging:

- **Blocks analytics & crash trackers** — drops the product-analytics frames
  (WS opcode 5) and neutralizes the AppTracer crash/perf SDK and OK calls
  telemetry beacons.
- **Spoofs the device fingerprint** sent in the connection handshake:
  `osVersion` and browser name are masked to `Secret`, while `User-Agent`,
  screen size and timezone are randomized (stable per browser). `deviceType`,
  `appVersion`, locale and the per-origin `deviceId` are left intact so the
  client keeps working.
- **Polyfills `crypto.randomUUID`** so the client also runs in non-secure
  contexts.

---

## Caveats

- **Not independent.** It fully depends on MAX's backend; if MAX changes the
  client or tightens checks, it may break or be blocked.
- **Traffic passes through your server.** TLS is terminated at your nginx and
  re-encrypted to MAX, so the relayed socket is visible to your box. Fine for
  personal self-hosting — **do not** deploy this to collect other people's
  logins.
- **Trademarks / ToS.** "MAX" and its logo belong to their owner. This is an
  unofficial wrapper for personal use and may be subject to MAX's terms.

---

## Author

**WallD3v** — built this as a self-hosting wrapper around the MAX web client.

## Contacts

- 📧 Email: walldevnewthon@gmail.com
- 💬 Telegram: [@gptabsolute](https://t.me/gptabsolute)
- 🐙 GitHub: [@WallD3v](https://github.com/WallD3v)

---

<div align="center">
<sub>Licensed under <a href="LICENSE">MIT</a> · Unofficial, not affiliated with MAX</sub>
</div>
