// ─────────────────────────────────────────────────────────────
// Double (Red-Black) — 50/50 color bet, 1.95x payout.
// Simple, instant, mobile-friendly. House edge ~2.5%.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { DoubleBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'double'
const COLORS = ['red', 'black']

// Payout multiplier (1.95x = 2.5% house edge on a fair 50/50)
const PAYOUT_MULT = 1.95

function pickColor(seed) {
  // Use first byte of hash for deterministic but fair result
  const n = parseInt(seed.slice(0, 2), 16)
  return COLORS[n % 2]
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    DoubleBet.find({ user: userId }).sort({ createdAt: -1 }).limit(30).lean(),
  ])

  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      payout: PAYOUT_MULT,
    },
    history: recent.map(b => ({
      id: String(b._id),
      color: b.color,
      result: b.result,
      amount: toRupees(b.amount),
      multiplier: b.multiplier,
      win: toRupees(b.win),
      time: b.createdAt,
    })),
  }
}

export const doubleRouter = Router()
doubleRouter.use(requireAuth)

doubleRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

doubleRouter.post('/bet', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Double is paused. Please try again later.')

  const color = String(req.body?.color).toLowerCase()
  if (!COLORS.includes(color)) throw new HttpError(400, 'Pick red or black')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const result = pickColor(seed)
  const won = result === color
  const multiplier = won ? PAYOUT_MULT : 0
  const win = won ? Math.min(Math.floor(paise * PAYOUT_MULT), Math.round(cfg.maxWin * 100)) : 0

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await DoubleBet.create([{
      user: req.userId,
      amount: paise,
      color,
      result,
      multiplier,
      win,
      seed,
    }], { session })
    if (won) {
      await credit(session, req.userId, win, { type: 'win', game: GAME })
    }
  })

  res.json(await snapshotFor(req.userId))
})

export async function startDouble() {
  // No background process needed — fully request-driven
  console.log('Double (Red-Black) ready')
}