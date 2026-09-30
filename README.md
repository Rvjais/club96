# 55CLUB

Three apps in one repo (npm workspaces):

| Folder | What | Dev URL |
| --- | --- | --- |
| `client/` | Player site: lobby, Aviator, Color Prediction (React + Vite) | http://localhost:5173 |
| `admin/` | Admin panel: users, wallets, bet history (React + Vite) | http://localhost:5174/admin/ |
| `server/` | Express API + game engines, MongoDB via Mongoose | http://localhost:4000 |

Players sign up with a phone number and play every game from one shared wallet. Game results
and payouts are decided on the server.

## Setup

1. **MongoDB Atlas**: create a free cluster at https://www.mongodb.com/atlas, add a database user,
   allow your IP under *Network Access*, then *Connect → Drivers* and copy the connection string.
2. Copy `server/.env.example` to `server/.env` and fill in `MONGODB_URI` (put a database name such as
   `viccky` before the `?`), plus `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
3. Install and run everything:

```bash
npm install
npm run dev
```

On first start the server creates the **admin** account from `ADMIN_USERNAME` / `ADMIN_PASSWORD`
(dev default `admin` / `admin123`).

The sign-up bonus (default ₹25, with a welcome pop-up), the minimum wallet balance needed to play
(default ₹100), UPI deposits and withdrawal rules are set in the admin panel under
**Game settings → Bonus & limits**.

**Deposits** work without a payment gateway: players scan a QR for the UPI ID set in the admin panel,
pay, and submit the 12-digit UTR. An admin checks the money arrived and approves it under **Deposits**,
which credits the amount received. Deposits are unavailable until a UPI ID is saved.

## Production

```bash
npm run build          # builds client/dist and admin/dist
NODE_ENV=production npm start
```

The server then serves the site at `/`, the admin panel at `/admin` and the API at `/api` on one port.
`JWT_SECRET` and `ADMIN_PASSWORD` must be set in production.

## Admin panel

- Dashboard: total users, active in 24h, total player balances, house profit (24h)
- Users table: search by username/phone, filter by status, sort, paging
- User page: profile (ID, username, phone, invite code, join date, signup/last-login IP, login count),
  wallet with add/remove funds (note required, logged as an `adjustment` transaction),
  lifetime stats, full transaction / Aviator / Color Prediction history,
  block / unblock, force logout, reset password

**Game settings** (`/admin/games`): per game, set the odds, payouts, min/max bet and pause/resume.
- Aviator: house edge, instant-crash chance, max multiplier. Color Prediction: chance and payout per colour
  (chances must total 100%). The page previews return-to-player and house edge before you save.
- Odds apply from the next round/period; every bet keeps the payout it was placed at. Limits and pause apply
  immediately. Players see the current odds inside each game, and every change is logged with the admin's name.

Passwords are stored as bcrypt hashes and cannot be viewed by anyone. Use **Reset password** to set a
new one; this also logs the user out of every device.

## Server layout

```
server/src/
  index.js          app setup, routes, static hosting in production
  config.js         environment settings
  db.js             Mongo connection + tx() transaction helper
  models/index.js   User, Transaction, AviatorRound, AviatorBet, ColorResult, ColorBet, Admin
  wallet.js         atomic debit/credit (paise) + ledger
  auth.js           player signup / login / logout / me
  routes/wallet.js  balance, transactions, UPI QR deposits, bank account, withdrawals
  routes/support.js customer-service chat (player side; admin side in routes/admin.js)
  routes/admin.js   admin login + user management
  sse.js            live updates (server-sent events)
  games/aviator.js  crash game rounds, bets, cash-outs
  games/color.js    color prediction periods, bets, settlement
```

Money is stored as integer paise. Every balance change runs in a MongoDB transaction together with its
ledger entry (Atlas clusters support transactions).

## Environment (`server/.env`)

| Var | Default | |
| --- | --- | --- |
| `MONGODB_URI` | — | **required** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` in dev | **required** in production |
| `JWT_SECRET` | generated into `server/.dev-secret` in dev | **required** in production |
| `PORT` | `4000` | |

## Adding a game

1. Client: create `client/src/games/<name>/` with the UI and an `index.js` exporting its card/route
   metadata (copy `aviator/index.js`), then add it to `client/src/games/index.js`.
2. Server: add `server/src/games/<name>.js`, move money only with `debit`/`credit` inside `tx()`,
   and mount its router in `server/src/index.js`.
3. Admin: add its bets to `GET /api/admin/users/:id` and a tab in `admin/src/pages/UserDetail.jsx`.
