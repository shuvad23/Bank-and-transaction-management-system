# NexBank — Modern Banking System

Full-stack banking app with FastAPI backend and React + Vite frontend.

## Architecture

- **Backend** (`backend/`) — FastAPI + Motor (async MongoDB) + JWT auth
  - `main.py` — entrypoint; mounts routers, manages lifespan (DB + cache)
  - `routes/` — auth, accounts, admin, notifications, charts, ws
  - `services/` — business logic (account, transaction, auth, notification, audit, fraud, cache, websocket manager)
  - `models/` — Pydantic schemas with strict validation
  - `core/` — config, db, security
- **Frontend** (`frontend/`) — React 18, React Router 6, Axios, Recharts
  - `src/pages/` — Dashboard, Transactions, Transfer, Admin, Login, Register, Accounts
  - `src/components/` — Navbar, Layout, ProtectedRoute, NotificationBell, Charts
  - `src/hooks/useRealtime.js` — WebSocket subscription with auto-reconnect
  - `src/services/api.js` — axios client + typed helpers
  - `src/context/AuthContext.jsx` — auth state

## Workflows

- **Backend** — `cd backend && uvicorn main:app --host 0.0.0.0 --port 8000` (console output)
- **Frontend** — `cd frontend && npm run dev` (port 5000, webview)

Vite proxies `/api/*` and `/ws` to `http://localhost:8000` so the browser only talks to the dev server.

## Features (all 3 levels)

### Level 1
- **Email notifications** — `notification_service` writes to DB and sends via SMTP if `SMTP_HOST` env is set; otherwise logs to console. Bell icon in navbar shows unread count and pushes via WebSocket.
- **Transaction IDs** — every transaction has a unique `txn_id` (`TXN-XXXXXXXX`), shown on Dashboard / Transactions / Admin.
- **Stronger validation** — passwords ≥8 chars with letters+numbers; usernames 3–30 chars (letters/digits/underscore); account numbers `^BNK\d{9}$`; per-txn cap $1,000,000; both client- and server-side validation; FastAPI validation arrays surfaced as readable errors.

### Level 2
- **Dashboard charts** — `Charts.jsx` (recharts): daily money flow area, type breakdown pie, balance bars (user view); plus stacked daily volume + count line for admin.
- **Admin panel** — tabbed: Charts / Transactions / Users / Audit Logs / Fraud. Live WS connection counter in header.
- **Audit logs** — `audit_service` records every important action (user create/login, account create, txn, fraud flag/block, admin views) with severity (info / warning / critical) and metadata.

### Level 3
- **Fraud detection** — `fraud_service` runs rules: very high single amount, daily outflow vs limit, rapid burst (≥5 txns in 60s), round-amount + late-night heuristics. Score ≥80 = block, ≥40 = flag. Blocked txns return HTTP 400; flagged txns persist with `status: flagged` and reason list.
- **Redis caching** — `cache_service` uses Redis when `REDIS_URL` is set; falls back to in-process memory. Caches admin stats, charts, and per-user transaction lists; auto-invalidates on writes.
- **WebSockets** — `/api/ws?token=…`, JWT-authenticated. Server pushes `transaction.new`, `notification`, `fraud.alert`, `audit`, `account.created`. Client (`useRealtime`) auto-reconnects with backoff and 25s ping keep-alive.

## Environment variables

Backend reads from `backend/.env`:
- `MONGO_URL` (required) — MongoDB Atlas connection string
- `JWT_SECRET_KEY` (required) — JWT signing secret
- `REDIS_URL` (optional) — enables Redis cache backend
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (optional) — enables real email delivery

Frontend `frontend/.env`: `VITE_API_URL` empty (Vite proxy handles it).

## Notable conventions

- Account number format: `BNK` + 9 digits (regex `^BNK\d{9}$`)
- Transaction reference: `TXN-XXXXXXXX` (8 hex chars)
- Fraud thresholds: block at score ≥ 80, flag at ≥ 40; absolute block on single txn ≥ $50k or daily outflow > $50k
- All endpoints under `/api/...`; WebSocket at `/api/ws`
- CORS allows ports 3000, 5000, 5173 + `*` for the dev proxy
