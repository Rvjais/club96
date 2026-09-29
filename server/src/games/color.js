// ─────────────────────────────────────────────────────────────
// Color Prediction — server-authoritative 30s periods.
// Periods are derived from the clock: period = floor(now / 30s).
// Betting closes LOCK_MS before the draw; the result is rolled on
// the server when the period ends and bets are settled immediately.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { createChannel } from '../sse.js'
import { ColorBet, ColorResult } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'

const GAME = 'color'
export const PERIOD_MS = 30000
export const LOCK_MS = 5000
const MIN_BET = 10
const MAX_BET = 100000

export const COLORS = {
  red: { multiplier: 2, weight: 0.45 },
  green: { multiplier: 2, weight: 0.45 },
  violet: { multiplier: 4.5, weight: 0.1 },
}

function rollColor() {
  const r = crypto.randomInt(0, 1_000_000) / 1_000_000
  if (r < COLORS.red.weight) return 'red'
  if (r < COLORS.red.weight + COLORS.green.weight) return 'green'
  return 'violet'
}

const periodIndex = (now) => Math.floor(now / PERIOD_MS)

/** 20260930 + sequence within the day, e.g. 202609300421 */
export function periodLabel(idx) {
  const start = new Date(idx * PERIOD_MS)
  const y = start.getFullYear()
  const m = String(start.getMonth() + 1).padStart(2, '0')
  const d = String(start.getDate()).padStart(2, '0')
  const midnight = new Date(y, start.getMonth(), start.getDate()).getTime()
  const seq = Math.floor((idx * PERIOD_MS - midnight) / PERIOD_MS) + 1
  return `${y}${m}${d}${String(seq).padStart(4, '0')}`
}

let lastIdx = periodIndex(Date.now())

/** Roll (once) and store the result for a finished period, then settle its bets. */
async function resolvePeriod(idx) {
  let result = await ColorResult.findById(idx).lean()
  if (!result) {
    try {
      result = (await ColorResult.create({ _id: idx, color: rollColor() })).toObject()
    } catch (err) {
      if (err?.code !== 11000) throw err
      result = await ColorResult.findById(idx).lean()
    }
  }
  const color = result.color
  const pending = await ColorBet.find({ period: idx, status: 'pending' }).lean()
  for (const bet of pending) {
    const won = bet.color === color
    const win = won ? Math.floor(bet.amount * COLORS[color].multiplier) : 0
    await tx(async (session) => {
      const upd = await ColorBet.updateOne({ _id: bet._id, status: 'pending' }, { status: won ? 'won' : 'lost', result: color, win }, { session })
      if (upd.modifiedCount && win) await credit(session, bet.user, win, { type: 'win', game: GAME, ref: bet._id })
    })
  }
}

let ticking = false
async function tick() {
  if (ticking) return
  const cur = periodIndex(Date.now())
  if (cur === lastIdx) return
  ticking = true
  try {
    for (let idx = lastIdx; idx < cur; idx++) await resolvePeriod(idx)
    lastIdx = cur
    channel.broadcast()
  } catch (err) {
    console.error('Color tick failed:', err)
  } finally {
    ticking = false
  }
}

// ── Snapshots ────────────────────────────────────────────────
async function snapshotFor(userId) {
  const now = Date.now()
  const cur = periodIndex(now)
  const prev = cur - 1
  const [balance, prevResult, prevBets, history, current, records] = await Promise.all([
    balanceOf(userId),
    ColorResult.findById(prev).lean(),
    ColorBet.find({ user: userId, period: prev }, { amount: 1, win: 1 }).lean(),
    ColorResult.find().sort({ _id: -1 }).limit(30).lean(),
    ColorBet.find({ user: userId, period: cur }).sort({ createdAt: 1 }).lean(),
    ColorBet.find({ user: userId, status: { $ne: 'pending' } }).sort({ createdAt: -1 }).limit(30).lean(),
  ])

  return {
    serverNow: now,
    balance: toRupees(balance),
    period: { id: cur, label: periodLabel(cur), endsAt: (cur + 1) * PERIOD_MS, periodMs: PERIOD_MS, lockMs: LOCK_MS },
    history: history.reverse().map((r) => ({ period: periodLabel(r._id), color: r.color })),
    bets: current.map((b) => ({ id: String(b._id), color: b.color, amount: toRupees(b.amount) })),
    records: records.map((b) => ({
      id: String(b._id),
      period: periodLabel(b.period),
      color: b.color,
      amount: toRupees(b.amount),
      result: b.result,
      win: toRupees(b.win),
    })),
    lastResult: prevResult
      ? {
          id: prev,
          period: periodLabel(prev),
          color: prevResult.color,
          played: prevBets.length > 0,
          staked: toRupees(prevBets.reduce((t, b) => t + b.amount, 0)),
          winnings: toRupees(prevBets.reduce((t, b) => t + b.win, 0)),
        }
      : null,
  }
}

const channel = createChannel(snapshotFor)

// ── Routes ───────────────────────────────────────────────────
export const colorRouter = Router()
colorRouter.use(requireAuth)

colorRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))
colorRouter.get('/stream', (req, res) => channel.connect(req, res))

colorRouter.post('/bet', async (req, res) => {
  const { color } = req.body ?? {}
  if (!COLORS[color]) throw new HttpError(400, 'Pick red, green or violet')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < MIN_BET * 100) throw new HttpError(400, `Minimum bet is ₹${MIN_BET}`)
  if (paise > MAX_BET * 100) throw new HttpError(400, `Maximum bet is ₹${MAX_BET.toLocaleString('en-IN')}`)

  const now = Date.now()
  const cur = periodIndex(now)
  if ((cur + 1) * PERIOD_MS - now <= LOCK_MS) throw new HttpError(409, 'Betting is closed for this period')

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await ColorBet.create([{ user: req.userId, period: cur, color, amount: paise }], { session })
  })
  channel.sendTo(req.userId)
  res.json(await snapshotFor(req.userId))
})

// ── Lifecycle ────────────────────────────────────────────────
export async function startColor() {
  const cur = periodIndex(Date.now())
  // Settle anything left pending from a previous server run
  const stale = await ColorBet.distinct('period', { status: 'pending', period: { $lt: cur } })
  for (const p of stale) await resolvePeriod(p)
  // Seed a little history on first boot so the board isn't empty
  if ((await ColorResult.estimatedDocumentCount()) === 0) {
    for (let i = 10; i >= 1; i--) await resolvePeriod(cur - i)
  }
  lastIdx = cur
  setInterval(tick, 200)
}
