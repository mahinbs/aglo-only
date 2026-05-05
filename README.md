# ChartMate — Algo-only dashboard

Single-page **TradingSmart.AI** command center on its own subdomain, using the **same Supabase Auth + database** as [`chartmate-trading-widget`](../chartmate-trading-widget).

**Security:** This app is aligned with the [`vapt-algo`](../vapt-algo) stack — in-memory Supabase storage (no JWT in `localStorage`), **HttpOnly BFF session**, TOTP gating, idle/EOD sign-out, and optional **admin** route. See [`SECURITY.md`](./SECURITY.md).
## TradingSmart Algo frontend bundle

The repo [`tradingsmartalgo`](../tradingsmartalgo) is copied into **`public/tradingsmartalgo/`** (served as static files, same visual assets)
| Path | Source |
|------|--------|
| `/tradingsmartalgo/platform.html` | `tradingsmartalgo/index.html` (standalone login + dashboard; demo `VALID_ACCOUNTS` only) |
| `/tradingsmartalgo/onboarding.html` | `tradingsmartalgo/onboarding.html` (links back to `platform.html`) |
| `/tradingsmartalgo/TradingSmartDashboard.html` | static dashboard HTML |
| `/tradingsmartalgo/TradingSmartDashboard.jsx` | reference copy of the JSX file |

**ChartMate-backed app:** `/login` → Supabase, `/` → React `TradingSmartDashboard` wired to Edge functions + optional BFF (this is the production path).

## Backend integration (no mandatory code forks)

| Service | Role for algo-only |
|---------|-------------------|
| **Supabase** | Auth, DB, Edge (`manage-strategy`, `start-trade-session`, `get-zerodha-login-url`, `sync-broker-session`, …) |
| [**chartmate-algo-only-bff**](../chartmate-algo-only-bff) | Optional JWT BFF: dashboard summary, proxy broker/options (live) |
| [**chartmate-options-api**](../chartmate-options-api) | Options execute/signal; default `ALLOW_ORIGINS=*` — tighten `allow_origins` in production if you drop wildcard |
| [**openalgo**](../openalgo) | Used via Edge + options-api (user API keys); no algo-only–specific OpenAlgo patches required |
| [**chartmate-strategy-engine**](../chartmate-strategy-engine) / [**chartmate-monitor**](../chartmate-monitor) | Same DB rows (`pending_conditional_orders`, `active_trades`, …); run workers as today — no repo changes required for hosting algo-only |

## ChartMate widget source (vendored inside this repo)

`algo-only` now includes the required widget source directly under:

- `vendor/chartmate-trading-widget/`

This makes the project self-contained for Vercel and removes the need for
`CHARTMATE_WIDGET_REPO` / submodule setup.

## Local dev

```bash
cd algo-only
cp .env.example .env   # add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (same as widget)
npm install
npm run dev             # http://127.0.0.1:5174
```

Optional: run [`chartmate-algo-only-bff`](../chartmate-algo-only-bff) and set `VITE_ALGO_ONLY_BFF_URL=http://127.0.0.1:8010` for aggregated `/api/dashboard/summary` and proxied options/broker calls.

### Dual-BFF routing (shared frontend, client-specific backend stacks)

You can keep one frontend build and route users to a secondary BFF by identity:

- `VITE_ALGO_ONLY_BFF_URL` (primary BFF)
- `VITE_ALGO_ONLY_BFF_URL_SECONDARY` (secondary BFF)
- one or more match lists:
  - `VITE_ALGO_ONLY_BFF_SECONDARY_USER_IDS`
  - `VITE_ALGO_ONLY_BFF_SECONDARY_USER_EMAILS`
  - `VITE_ALGO_ONLY_BFF_SECONDARY_EMAIL_DOMAINS`

When a signed-in user matches any secondary list, frontend auth/session/broker/options calls use the secondary BFF.

## Production subdomain

1. Build: `npm run build` and host static files on `https://algo.yourdomain.com`.
2. In **Supabase Dashboard → Authentication → URL configuration**, add Site URL / Redirect URLs for `https://algo.yourdomain.com` and `https://algo.yourdomain.com/broker-callback`.
3. Deploy BFF to e.g. `https://api-algo.yourdomain.com` with the same Supabase secrets as production; set `CORS_ALLOW_ORIGINS` to include your algo origin.
4. Point `VITE_ALGO_ONLY_BFF_URL` at that host in the frontend build env.

## Smoke checks

- Log in with an existing ChartMate user (email + password).
- Open **Connect broker (Zerodha)** → complete OAuth → lands on `/broker-callback` → redirects home.
- **Save strategy** → `manage-strategy` create (subscription rules same as widget).
- **Activate strategy** → popup for symbol / exchange / qty / product, then `manage-strategy` update + toggle (ChartMate broker portfolio flow); requires live broker session.
- **Options live execute** → popup with ChartMate-style params; `is_paper=false`; needs `VITE_ALGO_ONLY_BFF_URL` or `VITE_OPTIONS_API_URL` + running options API and live broker session.
