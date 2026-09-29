// ─────────────────────────────────────────────────────────────
// Plinko — a ball drops through rows of pegs, bouncing left or right
// at each row, and lands in a payout bucket. The server rolls every
// bounce; the client only animates the path it is given. Payout tables
// (per row count and risk level) are edited in the admin panel.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { PlinkoBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { PLINKO_ROWS, RISKS, getSettings } from '../settings.js'

const GAME = 'plinko'

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    rows: b.rows,
    risk: b.risk,
    path: b.path,
    bucket: b.bucket,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

export const describePlinko = (b) => `${b.rows} rows · ${b.risk} risk · landed ${b.multiplier}x`

function publicRules() {
  const cfg = getSettings(GAME)
  return { enabled: cfg.enabled, rows: PLINKO_ROWS, risks: RISKS, tables: cfg.tables, minBet: cfg.minBet, maxBet: cfg.maxBet, maxWin: cfg.maxWin }
}

// ── Routes ───────────────────────────────────────────────────
export const plinkoRouter = Router()
plinkoRouter.use(requireAuth)

plinkoRouter.get('/state', async (req, res) => {
  const [balance, recent] = await Promise.all([
    balanceOf(req.userId),
    PlinkoBet.find({ user: req.userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  res.json({ balance: toRupees(balance), rules: publicRules(), recent: recent.map(serialize) })
})

plinkoRouter.post('/drop', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Plinko is paused. Please try again later.')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  if (paise > Math.round(cfg.maxBet * 100)) throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  const rows = Number(req.body?.rows)
  if (!PLINKO_ROWS.includes(rows)) throw new HttpError(400, `Pick ${PLINKO_ROWS.join(', ')} rows`)
  const risk = req.body?.risk
  if (!RISKS.includes(risk)) throw new HttpError(400, 'Pick a risk level')

  const table = cfg.tables[rows][risk]
  const path = Array.from({ length: rows }, () => crypto.randomInt(0, 2))
  const bucket = path.reduce((t, s) => t + s, 0)
  const multiplier = table[bucket]
  const win = Math.min(Math.floor(paise * multiplier + 1e-6), Math.round(cfg.maxWin * 100))

  const _id = new mongoose.Types.ObjectId()
  const out = await tx(async (session) => {
    let balance = await debit(session, req.userId, paise, { type: 'bet', game: GAME, ref: _id })
    const [bet] = await PlinkoBet.create([{ _id, user: req.userId, amount: paise, rows, risk, path, bucket, multiplier, win }], { session })
    if (win > 0) balance = await credit(session, req.userId, win, { type: 'win', game: GAME, ref: _id })
    return { bet: serialize(bet.toObject()), balance: toRupees(balance) }
  })
  // The table the result was paid from, in case it changed since the page loaded
  res.json({ ...out, table })
})
