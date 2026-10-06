# Remote

**A personal web control panel for a self-hosted [OpenCode](https://opencode.ai) server.**

Remote is a static React app. It talks **directly from your browser to your own OpenCode
server over HTTP + SSE** — there is no backend, no database, no queue, and no agent logic of
its own. OpenCode is the agent; Remote is the window into it.

```
┌──────────────────────────┐        HTTPS / HTTP + SSE        ┌───────────────────────────┐
│  Remote (static site)    │ ───────────────────────────────▶ │  OpenCode server          │
│  React + Vite bundle     │ ◀─────────────────────────────── │  opencode serve :4096     │
│  Render / any host       │        GET /global/event         │  your machine, your repo  │
└──────────────────────────┘                                  └───────────────────────────┘
        no proxy · no server-side storage · no secrets in the bundle
```

---

## Table of contents

- [What you get](#what-you-get)
- [Architecture](#architecture)
- [Quick start (local)](#quick-start-local)
- [Environment variables](#environment-variables)
- [Starting OpenCode](#starting-opencode)
- [Connecting Remote to OpenCode](#connecting-remote-to-opencode)
- [Authentication](#authentication)
- [CORS configuration](#cors-configuration)
- [Reaching your PC from outside the LAN](#reaching-your-pc-from-outside-the-lan)
  - [A. Local / LAN](#a-local--lan)
  - [B. Remote access over HTTPS](#b-remote-access-over-https-tunnel-or-vpn)
- [Deploying to Render](#deploying-to-render)
- [Scripts](#scripts)
- [Testing](#testing)
- [Project structure](#project-structure)
- [How Remote talks to OpenCode](#how-remote-talks-to-opencode)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)
- [Accessibility & performance](#accessibility--performance)

---

## What you get

**Header**

- Compact wordmark, a subtle connection indicator (`Disconnected` / `Connecting…` /
  `Connected` / `Connection error`) whose tooltip shows the server URL, OpenCode version,
  event-stream state and round-trip latency.
- Connect / reconnect / disconnect, plus a settings button.

**Developer chat**

- Streaming assistant output with full Markdown: lists, tables, blockquotes, links.
- Code blocks with language labels, lazy syntax highlighting (highlight.js core, ~24
  languages loaded on demand) and a copy button that falls back when the Clipboard API is
  unavailable (e.g. plain HTTP on a LAN IP).
- Tool activity rendered as compact one-liners — `Reading src/app.ts`, `Running npm test`,
  `Editing README.md` — expandable to inputs, output and timing; failures are shown inline
  without stack traces.
- Permission prompts, todo list, reasoning blocks (collapsible, toggleable), token/cost
  footers per assistant message, retry cards.

**Composer**

- Auto-growing textarea (capped height), `Enter` sends, `Shift+Enter` inserts a newline,
  `Esc` aborts a running turn, send is disabled while disconnected, `Stop` replaces `Send`
  while the agent is busy.
- Optional **command mode** that runs a shell command through OpenCode's
  `POST /session/:id/shell` — no separate terminal server, no local shell.

**Sessions** (all state lives in OpenCode)

- Sidebar (docked on desktop, drawer on phones) with title, relative activity, busy
  indicator and active row. Create, select, rename, delete.

**File activity**

- Modified / Created / Deleted paths from `GET /session/:id/diff` and `file.edited` events,
  with addition/deletion counts and an inline diff preview when the server can provide the
  file content. Clicking a path opens its diff; it is deliberately *not* a code browser.

**Settings**

- Server URL, username, password, **Test connection** (calls `GET /global/health` and shows
  `✓ Connected · OpenCode version: …`), auto-connect toggle, credential persistence
  (memory or session), clear credentials, live connection status.

**Mock mode (development only)**

- `VITE_MOCK_MODE=true` runs the whole UI against a simulated server so you can work on the
  interface without an agent. It is off by default, the module is lazy-loaded, and the UI
  shows a `Mock` badge while it is active.

---

## Architecture

| Concern        | Decision                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Frontend       | React 19 + TypeScript + Vite. Static bundle, no SSR.                                                            |
| Backend        | **None.** The browser is the client of the OpenCode HTTP API.                                                   |
| Realtime       | `GET /global/event` (SSE) through a hand-rolled reader; if the stream cannot be opened Remote polls instead.     |
| State          | Small purpose-built hooks. No Redux, no data-fetching framework, no global store library.                       |
| SDK            | `@opencode-ai/sdk` for request/response typing; SSE is read directly so failures degrade to polling cleanly.    |
| Auth           | HTTP basic, entered at runtime by you. Never compiled into the bundle.                                          |
| Hosting        | Any static host. Documented and tested against Render (`npm install && npm run build` → `dist`).                 |

Why no proxy? A proxy would have to hold your OpenCode password and your session history —
exactly what a personal panel should avoid. Browser → OpenCode keeps the credential in your
browser and the agent on your machine.

---

## Quick start (local)

```bash
# 1. Clone and install
git clone https://github.com/okwedavid/remote.git
cd remote
npm install

# 2. Configure the default server URL (optional in dev: http://localhost:4096 is used)
cp .env.example .env

# 3. Develop
npm run dev            # http://localhost:5173
```

Start OpenCode on the same machine (see below) and Remote connects automatically.

```bash
# Production-style check
npm run lint
npm test
npm run build          # emits dist/
npm run preview        # serves dist/ on http://localhost:4173
```

---

## Environment variables

| Variable            | Default                     | Notes                                                                                        |
| ------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `VITE_OPENCODE_URL` | `http://localhost:4096`     | Default URL offered in the UI. In production it is the value baked into the build.            |
| `VITE_MOCK_MODE`    | `false`                     | Development-only simulated server. Ignored in production builds.                               |

`.env.example` contains **only** these two variables. Copy it to `.env` for local work.

> **Never** put a password, token or API key in a `VITE_*` variable. Vite inlines them into
> public JavaScript. There is deliberately no `VITE_OPENCODE_PASSWORD`: credentials are typed
> into the Settings panel at runtime and kept in memory (or, if you opt in, sessionStorage).

Settings are stored in `localStorage` **without** credentials; the password lives only in
memory unless you enable “Keep the password for this tab”, which uses `sessionStorage`.

---

## Starting OpenCode

Remote does not start OpenCode; it only connects to it. Run the server on the machine that
holds your project:

```bash
# Local use only (binds 127.0.0.1, reachable only from this machine)
opencode serve --port 4096

# Expose on your LAN so Remote can reach it from your phone/other computer
opencode serve --hostname 0.0.0.0 --port 4096

# LAN + the exact page origins allowed to call it (recommended)
opencode serve --hostname 0.0.0.0 --port 4096 \
  --cors http://localhost:5173 \
  --cors https://remote.example.com

# With HTTP basic auth (strongly recommended whenever it leaves localhost)
OPENCODE_SERVER_PASSWORD="$(openssl rand -base64 24)" \
  opencode serve --hostname 0.0.0.0 --port 4096 \
  --cors http://localhost:5173 --cors https://remote.example.com
```

- `OPENCODE_SERVER_USERNAME` defaults to `opencode`.
- The OpenAPI document is served at `http://<host>:4096/doc` — that is the contract Remote is
  built against.

---

## Connecting Remote to OpenCode

1. Open Remote and click the connection indicator (or `Ctrl/Cmd + ,`) to open **Settings**.
2. Enter the server URL:
   - same machine → `http://localhost:4096`
   - another device on your LAN → `http://192.168.1.20:4096`
   - from the internet → `https://opencode.example.com` (tunnel/VPN, see below)
3. Enter the username (`opencode` by default) and password if you started OpenCode with
   `OPENCODE_SERVER_PASSWORD`.
4. Press **Test connection** — Remote calls `GET /global/health` and reports the version.
5. **Save & connect**. The indicator turns `Connected` and the session list loads.

---

## Authentication

Authentication is OpenCode's own HTTP basic auth. Remote performs no login of its own and
stores nothing on a server.

1. Start OpenCode with a password:
   ```bash
   OPENCODE_SERVER_PASSWORD='a-long-random-string' opencode serve --hostname 0.0.0.0 --port 4096
   ```
2. Type the same password into Settings. Remote sends
   `Authorization: Basic base64(username:password)` on every request, including the SSE stream.
3. The password is never logged, never included in error messages, and never written to
   `localStorage`. Use **Clear credentials** to forget it immediately.

A `401` surfaces as *“Unable to authenticate…”* with a Retry button; `403` as a forbidden
message. Remote never retries with credentials it does not have.

---

## CORS configuration

Because the browser calls OpenCode directly, OpenCode must allow the origin Remote is served
from. Without it the browser blocks the response and Remote reports
*“CORS blocked this request.”* — it also probes the URL with a `no-cors` request to tell
“server is down” apart from “server is up but blocked”.

| Remote is served from          | Add this `--cors` value            |
| ------------------------------ | ---------------------------------- |
| `http://localhost:5173` (dev)  | `--cors http://localhost:5173`     |
| `https://remote.onrender.com`  | `--cors https://remote.onrender.com` |
| `http://192.168.1.50:4173`     | `--cors http://192.168.1.50:4173`  |

`--cors` is repeatable; pass it once per origin. Exact origins only — no wildcards, no
trailing slash.

---

## Reaching your PC from outside the LAN

### A. Local / LAN

```bash
# On the PC that runs OpenCode
opencode serve --hostname 0.0.0.0 --port 4096 --cors http://localhost:5173
```

- Settings URL: `http://192.168.1.20:4096` (replace with your PC's LAN IP — `ipconfig` on
  Windows, `ip addr` / `ifconfig` on macOS and Linux).
- The browser device must be on the same network.
- `localhost` inside Remote means **the device showing the page**, not your PC.
- HTTPS pages cannot call plain `http://` servers: a page served over HTTPS needs an HTTPS
  OpenCode URL, which is what architecture B provides.

### B. Remote access over HTTPS (tunnel or VPN)

**Never expose port 4096 directly to the internet.** Put a TLS tunnel or a VPN in front of
it:

```bash
# Cloudflare Tunnel (no inbound ports, TLS terminated by Cloudflare)
cloudflared tunnel --url http://localhost:4096 --hostname opencode.example.com

# or Tailscale (private network; only your devices can reach it)
tailscale serve --bg --https=443 http://127.0.0.1:4096
```

then:

```bash
OPENCODE_SERVER_PASSWORD='a-long-random-string' \
  opencode serve --hostname 127.0.0.1 --port 4096 \
  --cors https://remote.onrender.com
```

- Settings URL: `https://opencode.example.com`.
- The tunnel keeps traffic encrypted in transit; the password is still required because the
  endpoint is reachable from the internet.
- **`remote.onrender.com` cannot reach `http://localhost:4096` on your PC.** `localhost` is
  resolved by the browser, so `http://localhost:4096` only works when the browser *and*
  OpenCode are on the same machine — that is why a tunnel, VPN or LAN address is required for
  any other combination.

---

## Deploying to Render

Remote is a static site; no Node runtime is needed in production.

| Setting          | Value                            |
| ---------------- | -------------------------------- |
| Type             | Static Site                      |
| Repository       | `https://github.com/okwedavid/remote` |
| Branch           | `main`                           |
| Build command    | `npm install && npm run build`   |
| Publish directory| `dist`                           |
| Environment      | `VITE_OPENCODE_URL=https://opencode.example.com` |

Notes

- Set `VITE_OPENCODE_URL` **before** the build; it is compiled into the bundle.
- Do not add `VITE_MOCK_MODE` in production.
- Routing: the app has **no client-side router** (one entry point), so no SPA rewrite rule is
  required. If you add routes later, add a rewrite from `/*` to `/index.html`.
- Add the Render origin to OpenCode's `--cors` list
  (`--cors https://remote.onrender.com`).
- Then open the site, and enter your password in Settings (memory or session storage).

---

## Scripts

| Command             | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | Vite dev server on `http://localhost:5173`.             |
| `npm run build`     | Type-checks (`tsc -b`) and builds `dist/`.               |
| `npm run preview`   | Serves the production build on port 4173.               |
| `npm run lint`      | ESLint (typescript-eslint + react-hooks).                |
| `npm run typecheck` | `tsc -b` only.                                          |
| `npm test`          | Vitest unit/integration suite.                           |
| `npm run test:e2e`  | Playwright end-to-end suite (see below).                 |

## Testing

```bash
npm test          # 147 unit + integration tests (Vitest, jsdom)
npm run test:e2e  # 19 end-to-end tests (Playwright, real browser + real SSE)
```

The end-to-end suite boots a **fake OpenCode server** (`e2e/fake-opencode-server.mjs`) that
implements the endpoints Remote uses — including the `/global/event` SSE stream — and drives
the real UI against it. It covers the happy path (connect → session → prompt → streamed
Markdown reply → tool activity → file diff → abort), command mode, clipboard copy, session
rename/delete, credential failures, an unreachable server, the settings health check,
keyboard shortcuts, the phone layout, and the production bundle served by `vite preview`.

Playwright starts three things automatically: the fake OpenCode server on `:4096`, the Vite
dev server on `:5173`, and a preview build on `:4173`. Chromium only:

```bash
npx playwright install chromium   # once
```

---

## Project structure

```
src/
├── App.tsx                     # shell: header, sidebar, chat, composer, panels, shortcuts
├── main.tsx                    # React root
├── config.ts                   # env parsing, defaults, timeouts, UI limits
├── styles.css                  # single hand-written stylesheet (tokens → components)
├── types/opencode.ts           # API types + Remote's own view models
├── lib/
│   ├── opencode.ts             # OpenCode transport (SDK + SSE reader)   ← the only network layer
│   ├── transport.ts            # OpenCodeTransport interface + factory (lazy mock)
│   ├── mock.ts                 # dev-only simulated server
│   ├── errors.ts               # normalisation: offline/CORS/401/timeout/… + sanitising
│   ├── storage.ts              # settings (localStorage) + credentials (memory/session)
│   ├── conversation.ts         # message/part folding, streaming & optimistic reconciliation
│   ├── format.ts, diff.ts, highlight.ts, clipboard.ts, urls.ts
├── hooks/
│   ├── useOpenCode.ts          # composition root (settings → connection → sessions → …)
│   ├── useConnection.ts        # health probe, liveness, test-connection
│   ├── useEvents.ts            # GET /global/event subscription
│   ├── useSession.ts, useMessages.ts, useFiles.ts, useCatalog.ts
│   └── useSettings.ts, useMediaQuery.ts, useTicker.ts
└── components/
    ├── Header/, ConnectionStatus/
    ├── Chat/                   # transcript, markdown, code blocks, tool activity, permissions
    ├── Composer/               # prompt + command mode
    ├── SessionList/, FileActivity/
    ├── Settings/               # connection settings drawer
    └── common/                 # icons, drawer, error banner, empty states
```

## How Remote talks to OpenCode

| Purpose            | Endpoint                                                        |
| ------------------ | --------------------------------------------------------------- |
| Health / version   | `GET /global/health`                                             |
| Event stream (SSE) | `GET /global/event`                                              |
| Sessions           | `GET/POST /session`, `GET/PATCH/DELETE /session/:id`, `GET /session/status` |
| History            | `GET /session/:id/message?limit=`                                |
| Prompt (async)     | `POST /session/:id/prompt_async` (204 + events)                  |
| Abort              | `POST /session/:id/abort`                                        |
| Shell (command mode) | `POST /session/:id/shell`                                       |
| Permissions        | `POST /session/:id/permissions/:permissionID`                    |
| Diff / todos       | `GET /session/:id/diff`, `GET /session/:id/todo`                 |
| Catalog            | `GET /agent`, `GET /config/providers`                            |
| File preview       | `GET /file/content?path=`                                        |

Assistant replies always arrive as events (`message.updated`, `message.part.updated`,
`session.idle`); nothing in Remote fabricates progress or text.

---

## Troubleshooting

**“OpenCode server is offline.”**
OpenCode is not running, or the URL points somewhere unreachable from *this browser*.
Check `opencode serve` is running, then `curl http://<host>:4096/global/health`. Remember
`localhost` = the device showing the page.

**“CORS blocked this request.”**
The server answered but the browser refused to hand the response to the page. Restart
OpenCode with the page's exact origin: `--cors http://localhost:5173` (dev) or
`--cors https://remote.onrender.com` (production).

**“Unable to authenticate…”**
Password missing or wrong. OpenCode's username defaults to `opencode`; the password must
match `OPENCODE_SERVER_PASSWORD`. Enter both in Settings → Test connection.

**“Connection timed out.”** / **“Session no longer exists.”**
The PC is unreachable (tunnel down, wrong LAN IP, firewall) / the session was deleted on the
server — pick another session or create one.

**Live updates unavailable banner**
`GET /global/event` could not be opened (proxy, CORS, or the tunnel strips SSE). Remote keeps
working and polls the message history every few seconds. Fix the proxy/`--cors` config to
restore instant updates.

**Everything works but the sidebar is empty**
The sidebar mirrors `GET /session` only. If OpenCode has no sessions yet, create one
(*New session*) — Remote stores nothing locally.

**Phone cannot reach the PC**
Use `--hostname 0.0.0.0`, allow port 4096 through the firewall, and make sure both devices
are on the same network; then `http://<LAN-IP>:4096`.

---

## Security notes

- **Nothing secret is ever committed.** `.env*` is git-ignored (except `.env.example`, which
  has empty values), and there is no build-time credential variable at all.
- **No credentials in the bundle.** The password is typed at runtime, kept in memory by
  default, optionally in `sessionStorage` for the tab, and added to requests as an
  `Authorization` header only.
- **No credential leakage in errors.** Error detail strings are sanitised — `Authorization`
  headers, `user:pass@host` URLs and long opaque tokens are redacted, stack traces dropped.
- **No credential logging.** The console is only used for warnings and errors, and never with
  credentials.
- **Nothing is stored server-side.** No database, no session store, no analytics, no
  third-party scripts or fonts.
- **Bind OpenCode to `127.0.0.1` and reach it through a tunnel or VPN.** Port 4096 has no
  transport security of its own; do not port-forward it from the internet.
- **Keep the password out of URLs.** Use the username/password fields; URLs with embedded
  credentials are rejected by the settings form.

## Accessibility & performance

- Semantic landmarks (`header`, `aside`, `main`), real `<button>`s, labelled form fields,
  `aria-current` on the active session, `aria-pressed` on toggles, `role="alert"` for errors,
  `role="status"` for the connection indicator and copy confirmations.
- Keyboard: `Tab` order follows the UI, `Ctrl/Cmd + B` toggles the session list,
  `Ctrl/Cmd + ,` opens Settings, `Esc` closes overlays (otherwise aborts a running turn),
  focus returns to the trigger when a drawer closes, visible focus rings, `prefers-reduced-motion`
  honoured, `prefers-contrast: more` supported.
- Performance: one stylesheet, six runtime dependencies, split vendor chunks, highlight.js
  languages loaded on demand, the mock module lazy-loaded and development-only, transcript
  capped to the most recent messages.
