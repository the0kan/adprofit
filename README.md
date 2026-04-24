# AdProfit

Premium-style **product demo** that combines **Meta Ads** performance with **WooCommerce / Shopify**–style revenue so teams focus on **profit and margin**, not vanity ROAS.

| Area | Stack |
|------|--------|
| Marketing site | Static HTML + `styles.css` |
| Dashboard | `dashboard.html` + `dashboard.css` + ES modules |
| Logic | `data.js`, `metrics.js`, `insights-engine.js`, `chart.js` (SVG trend), `auth.js`, `config.js` |
| API | Node + Express + PostgreSQL + Prisma + JWT (`backend/`) |
| Docs | `docs/*.md` (backend, database, integrations) |

**License:** [MIT](LICENSE)

**What is real vs mocked:** With the API running and the UI pointed at it, **signup/login** hit PostgreSQL (bcrypt + JWT). The **dashboard** route checks workspace membership and still serves **demo metrics** from `data.js` + the insights engine until metrics are persisted. **Meta Ads OAuth** stores the user access token **encrypted** on the `Connection` row for the configured workspace (see `TOKEN_ENCRYPTION_SECRET` + `DEFAULT_META_WORKSPACE_SLUG` in `backend/.env.example`); campaign insights read from that row after account selection. Without an API base URL, **auth stays offline** (`localStorage` + mock workspace id).

### Data storage & trust (production)

- **Database:** Production uses **Neon PostgreSQL** (or any Postgres compatible with Prisma). The **API + database** are the **source of truth** for users, workspaces, workspace members, **Meta connections**, **encrypted Meta user tokens**, selected **ad account** metadata, **Meta sync logs**, and (later) Stripe subscriptions plus WooCommerce / Shopify connection rows.
- **Browser `localStorage`** may hold only: **demo/offline session** shape, **UI preferences**, optional **`adprofit.apiBase`**, and the **admin panel token** (`adprofit.admin.token`) for internal operators — **never** Meta access tokens or app secrets.
- **Frontend** calls the API for Meta OAuth start, account list, connect, connection status, and campaign insights; tokens are **not** exposed in JSON responses.

---

## Production URLs (okan-ozkan.eu)

| What | URL |
|------|-----|
| Marketing site / app entry | `https://okan-ozkan.eu` |
| Privacy Policy | `https://okan-ozkan.eu/privacy.html` |
| Terms of Use | `https://okan-ozkan.eu/terms.html` |
| Data deletion instructions | `https://okan-ozkan.eu/data-deletion.html` |

**Meta OAuth callback:** In `backend/.env`, set `META_REDIRECT_URI` to the **exact** URL your deployed API exposes for the callback route (this repo: `GET /v1/integrations/meta/callback`). For Render-hosted API, use `https://adprofit.onrender.com/v1/integrations/meta/callback`. The same string must appear under **Meta app → Facebook Login → Settings → Valid OAuth Redirect URIs**.

**CORS:** Set `CORS_ORIGIN` to include `https://okan-ozkan.eu` when the browser loads the UI from that origin. Local development can keep `http://localhost:5173` (comma-separated list).

**OAuth redirect back to the dashboard:** Set `FRONTEND_URL=https://okan-ozkan.eu` on the API so `GET /v1/integrations/meta/callback` can redirect to `https://okan-ozkan.eu/dashboard.html?meta=…` (JSON debug: add `&format=json`).

### Render (API `adprofit.onrender.com`) + PostgreSQL

**Required env vars on the Web Service**

- `DATABASE_URL` — Postgres connection string  
- `JWT_SECRET` — long random signing secret  
- `TOKEN_ENCRYPTION_SECRET` — **required when `NODE_ENV=production`**; AES-256-GCM key material for Meta tokens at rest (see `backend/.env.example`)  
- `ADMIN_TOKEN` — Bearer secret for `/v1/admin/*`  
- `CORS_ORIGIN` — e.g. `https://okan-ozkan.eu`  
- `FRONTEND_URL` — e.g. `https://okan-ozkan.eu` (OAuth success redirect)  
- `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` (`https://adprofit.onrender.com/v1/integrations/meta/callback`), `META_API_VERSION` (e.g. `v20.0`), `META_SCOPES` (e.g. `ads_read`)

**Optional**

- `DEFAULT_META_WORKSPACE_SLUG` — defaults to `adprofit-demo` (created by `npm run db:seed`)  
- `DEFAULT_META_WORKSPACE_ID` — if set, overrides slug lookup

**Managed Postgres** (any provider works): [Neon](https://neon.tech), [Supabase](https://supabase.com), [Render Postgres](https://render.com/docs/databases), [Railway](https://railway.app).

**Release / first deploy** (from `backend/`): `npx prisma generate && npx prisma migrate deploy && npm run db:seed` (seed once so the demo workspace exists, unless you rely on `DEFAULT_META_WORKSPACE_ID` only).

---

## Quick start (local)

**First time:** install dependencies (root scripts + API):

```bash
npm run setup
```

### 1. Frontend only (mock data)

Do **not** open files as `file://` — ES modules require HTTP.

```bash
npx serve .
# open http://localhost:3000 or the URL printed (e.g. port 5000)
```

- Landing: `/index.html`
- Dashboard: `/dashboard.html` (uses embedded mock + client rule engine)
- Sign in: `/login.html` (demo session in `localStorage`)

### 2. Backend (PostgreSQL + API)

1. Install [PostgreSQL](https://www.postgresql.org/) locally or via Docker.
2. Copy and edit env:

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL, JWT_SECRET, TOKEN_ENCRYPTION_SECRET (any non-empty string locally),
# CORS_ORIGIN (e.g. http://localhost:5173), and Meta vars if testing OAuth.
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

See **[docs/backend-setup.md](docs/backend-setup.md)** for details.

Auth endpoints: `POST /v1/auth/signup`, `POST /v1/auth/login`, `GET /v1/auth/me` (Bearer token).  
Protected: `GET /v1/workspaces/:workspaceId/dashboard` (requires JWT + workspace membership).

### 3. Frontend + API together

```bash
npm install
cd backend && npm install && cd ..
```

**Terminal 1 — API** (default `http://localhost:3000`):

```bash
cd backend && npm run dev
```

**Terminal 2 — static site** (e.g. port 5173):

```bash
npx serve -l 5173 .
```

Point the UI at the API (dashboard **and** login/signup use the same base):

- **Query:**  
  `http://localhost:5173/login.html?api=http://localhost:3000`  
  then open the dashboard with the same query, or set storage once:  
  `localStorage.setItem('adprofit.apiBase', 'http://localhost:3000')`
- **Meta tag:** set `adprofit-api-base` on `dashboard.html`, `login.html`, or `signup.html`.

Sign up or sign in against the API; the client stores the JWT and **real workspace id**. The dashboard sends `Authorization: Bearer …`.

Or use:

```bash
npm run dev
```

(from repo root after `npm install`; see `package.json`).

### 4. API alone (health check)

```bash
cd backend && npm start
curl -s http://localhost:3000/v1/health
```

---

## Docker (API)

From the **repository root**:

```bash
docker build -t adprofit-api .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/adprofit" \
  -e JWT_SECRET="your-long-secret" \
  -e TOKEN_ENCRYPTION_SECRET="openssl-rand-or-similar-32+-chars" \
  -e CORS_ORIGIN="https://okan-ozkan.eu" \
  -e FRONTEND_URL="https://okan-ozkan.eu" \
  adprofit-api
```

Run migrations against the same database before traffic (e.g. `npx prisma migrate deploy` in CI or an init container).

---

## Deploy (static site)

Deploy the **entire repo root** as a static site (no build step):

- **Netlify:** drag-and-drop or connect repo; `netlify.toml` is included.
- **Vercel:** import project as static; `vercel.json` sets basic security headers.
- **GitHub Pages:** enable Pages for branch; site serves `index.html` at `/`.

Set the dashboard API base via **meta tag** on `dashboard.html` or **localStorage** / **query** as above. Use **HTTPS** in production.

**Production:** Use strong `JWT_SECRET`, HTTPS, narrow `CORS_ORIGIN`, rate limits, and secrets management. The dashboard route requires authentication.

**Client hardening (included):** API base URLs are validated (`http`/`https` only). After login, the `next=` query parameter only allows a simple `*.html` filename on the same origin (no open redirects).

---

## Optional: require login before dashboard

In the browser console:

```js
localStorage.setItem('adprofit.auth.required', '1');
```

Use `?dev=1` on `dashboard.html` to bypass the guard while developing.

---

## Repository layout

```
├── index.html, styles.css     # Landing
├── dashboard.html, dashboard.css, dashboard.js
├── data.js, metrics.js, insights-engine.js, chart.js
├── auth.js, config.js, login.html, signup.html, …
├── assets/favicon.svg
├── backend/                   # Express + Prisma + JWT (see docs/backend-setup.md)
├── docs/                      # Planning docs
├── Dockerfile                 # API image
├── netlify.toml, vercel.json
└── robots.txt
```

---

## CI

GitHub Actions runs a quick syntax check on the API when you push (see `.github/workflows/ci.yml`).

---

## Roadmap (short)

- ~~PostgreSQL + Prisma + JWT auth foundation~~ (Phase 1)
- Persist campaigns, orders, and insights (replace mock assembly in dashboard service)
- OAuth + Meta / Woo / Shopify sync per `docs/api-integration-plan.md`
- Refresh tokens, webhooks, background workers for `SyncJob`

Contributions welcome; treat this repo as a **starting point**, not production-hardened infrastructure.

---

## Deploy (cPanel frontend)

Upload to `public_html` (or your domain document root):

- `index.html`
- `login.html`
- `signup.html`
- `dashboard.html`
- `settings.html`
- `admin.html`
- `privacy.html`
- `terms.html`
- `data-deletion.html`
- `styles.css`
- `auth.css`
- `dashboard.css`
- `auth.js`
- `config.js`
- `login.js`
- `signup.js`
- `dashboard.js`
- `settings.js`
- `admin.js`
- `admin.css`
- `data.js`
- `metrics.js`
- `insights-engine.js`
- `chart.js`
- `assets/` (including `favicon.svg`)

Do **not** upload:

- `backend/`
- `.env` files
- `node_modules/`
- local IDE/cache files

Frontend defaults to `https://adprofit.onrender.com` via `<meta name="adprofit-api-base">` in `dashboard.html`, `login.html`, and `signup.html`.

## Deploy (Render backend)

- **Root directory:** `backend`
- **Build command:** `npm install && npx prisma generate && npx prisma migrate deploy`
- **Start command:** `npm start`

Required environment variables:

- `NODE_ENV=production`
- `PORT=10000` (or Render default)
- `DATABASE_URL=...`
- `JWT_SECRET=...`
- `JWT_EXPIRES_IN=7d`
- `ADMIN_TOKEN=<long-random-admin-password>`
- `CORS_ORIGIN=https://okan-ozkan.eu`
- `META_APP_ID=...`
- `META_APP_SECRET=...`
- `META_REDIRECT_URI=https://adprofit.onrender.com/v1/integrations/meta/callback`
- `META_API_VERSION=v20.0`
- `META_SCOPES=ads_read`
- `STRIPE_SECRET_KEY=`
- `STRIPE_WEBHOOK_SECRET=`
- `STRIPE_PRICE_STARTER=`
- `STRIPE_PRICE_GROWTH=`
- `STRIPE_PRICE_PRO=`

## Internal admin panel

- URL: `https://okan-ozkan.eu/admin.html`
- Requires header auth token via UI input (`Authorization: Bearer <ADMIN_TOKEN>`).
- Routes:
  - `GET /v1/admin/summary`
  - `GET /v1/admin/users`
  - `GET /v1/admin/workspaces`
  - `GET /v1/admin/integrations`
  - `GET /v1/admin/system`

Security notes:

- Admin routes never return access tokens or app secrets.
- System response only exposes safe booleans like `hasMetaSecret` / `hasStripeKey`.
- Current admin data is `demoMode: true` where DB-backed analytics are not yet available.
- Production target should move to DB-backed RBAC and audited admin identities.
