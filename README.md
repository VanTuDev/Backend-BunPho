# BunPho API

Express + Mongoose + TypeScript backend for the BunPho ordering app: menu catalog,
tables & QR ordering, orders with Telegram notifications, and admin auth
(seeded owner + Google login for registered emails).

## Stack

- Node 20+, Express 4, Mongoose 8, Zod
- **helmet** (security headers), **cors** (allow-list), **morgan** (request logs),
  **express-rate-limit** (auth + order endpoints)
- MongoDB Atlas · Cloudinary (images) · Telegram Bot API (order alerts)
- JWT auth (7-day tokens), bcrypt password hashes, Google ID-token verification

## CORS

Configured in `src/middleware/cors.ts` using the `cors` package. Allowed origins
(`src/config/env.ts` → `allowedOrigins`):

- `FRONTEND_URL` (your Vercel URL)
- any `*.vercel.app` (preview deploys)
- `localhost` on any port
- anything in `CORS_ORIGIN` (comma-separated)

Requests with **no** `Origin` header (curl, health checks, server-to-server) always
pass. In development, non-listed browser origins are allowed with a warning; in
production they are rejected.

## Local development

```bash
cp .env.example .env      # then fill in the values
npm install
npm run seed              # load the starter menu + tables 1..20
npm run dev               # http://localhost:4000  (GET /health)
```

`npm run seed -- --wipe` clears categories + menu items before reseeding.

### Can't reach Atlas?

```bash
npm run check-db          # diagnoses env → IP → DNS → TCP → TLS → handshake
```

`MongooseServerSelectionError` / `ReplicaSetNoPrimary` is almost always the
**Atlas IP allow-list**: cloud.mongodb.com → Network Access → Add IP Address →
`0.0.0.0/0`. `check-db` prints your current public IP and the exact fix.

### Fully offline dev

```bash
npm run dev:local         # spins up an in-memory MongoDB, seeds it, starts the API
```

No Atlas, no network, no allow-list. The DB is wiped + reseeded on every start.
Admin login: `owner@local.test` / `local-admin-123`. First run downloads a small
`mongod` binary over HTTPS (then cached).

## Environment

See `.env.example`. Required to boot: `MONGODB_URI`, `JWT_SECRET`.
Everything else degrades gracefully and is reported by `GET /health` → `features`.

| Group | Vars |
|---|---|
| Core | `MONGODB_URI`, `JWT_SECRET`, `PORT`, `NODE_ENV` |
| Owner seed | `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME` |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Frontend/CORS | `FRONTEND_URL`, `CORS_ORIGIN` |

The owner account is (re)created on every boot from `OWNER_*`. Additional admins are
invited from the admin panel with an email + password. There is no Google / OAuth
login — admins sign in with email + password only.

## API

Public (no auth):

| Method | Path | |
|---|---|---|
| GET | `/api/categories` | active categories |
| GET | `/api/menu` | active dishes — `?category=<slug>`, `?featured=true` |
| GET | `/api/menu/:id` | one dish |
| GET | `/api/tables/:code` | resolve a scanned table code |
| POST | `/api/orders` | place an order (revalidated + repriced server-side) |
| GET | `/api/orders/:id` | order status |

Admin (`Authorization: Bearer <jwt>`):

| Method | Path | |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` |
| GET | `/api/auth/me` | current admin |
| GET/POST | `/api/admins` · PATCH/DELETE `/api/admins/:id` | owner only |
| POST | `/api/uploads` | multipart `file` → `{ image: { url, publicId } }` |
| POST/PATCH/DELETE | `/api/categories[/:id]` | |
| POST/PATCH/DELETE | `/api/menu[/:id]` | |
| GET/POST/PATCH/DELETE | `/api/tables[/:id]` · POST `/api/tables/bulk` | |
| GET | `/api/orders` | `?status=`, `?active=true`, `?table=`, `?date=YYYY-MM-DD` |
| PATCH | `/api/orders/:id/status` | `{ status }` |

## Deploy (Render)

Web Service · Build `npm install && npm run build` · Start `npm start` · Health `/health`.
Set the env vars from the table above. Run the seed once from the Render Shell:
`npm run seed`. See `render.yaml` for a blueprint.
