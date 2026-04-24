# Algo-only security model (aligned with `vapt-algo`)

This app matches the **VAPT-hardened** frontend patterns from [`vapt-algo/vapt-algo-frontend`](../vapt-algo/vapt-algo-frontend). Summary:

| Risk (legacy algo-only) | Mitigation here |
|-------------------------|-----------------|
| **JWT in localStorage** (XSS → session theft) | Supabase session stored in **in-memory** storage only (`lib/supabase.ts`). Short-lived access token + **HttpOnly `vapt_session`** via BFF `/api/auth/exchange` (`useAuth`). |
| **No TOTP / IP controls** | Enforced by **BFF** when `VITE_ALGO_ONLY_BFF_URL` is set: `/totp-setup`, `/session-totp`, **IP whitelist** and TOTP on trading routes (`RequireTradingSession`). |
| **No rate limiting** | **Per-IP / per-user limits** on the BFF and options API (`slowapi` in `vapt-algo-bff` / `vapt-algo-options-api`) — not in the SPA. |
| **No audit / RBAC** | **WORM `order_audit_log`** and **super_admin** flows live in **Supabase + BFF**; `/admin` requires a verified BFF session with an admin role. |
| **No server-side logout** | **`bffLogout()`** clears the BFF cookie; **`useSessionExpiry`** idle + EOD sweep; session rows in `algo_sessions` can be revoked server-side. |

## What you must deploy

1. **`vapt-algo-bff`** (or equivalent) with the same env as [`vapt-algo-bff/.env.example`](../vapt-algo/vapt-algo-bff/.env.example).
2. Set **`VITE_ALGO_ONLY_BFF_URL`** in the algo-only build to that BFF origin.
3. **CSP** in `index.html` — extend `connect-src` in production to include your BFF hostname.
4. Production secrets: use a **secret manager**, not a committed `.env`.

## Optional

- This folder is kept in sync with VAPT UI/security files; the **reference implementation** for the full stack is [`vapt-algo/`](../vapt-algo).
