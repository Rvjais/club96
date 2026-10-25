// ─────────────────────────────────────────────────────────────
// Money Wheel (Big Six) — one spot bet against a 54-segment wheel:
//   x1 × 24 segments pay 2x · x2 × 15 pay 3x · x5 × 8 pay 6x ·
//   x10 × 4 pay 11x · x20 × 2 pay 21x · Joker × 1 pays 41x
// (return multipliers, stake included). The spin lands on a
// segment: if it shows the bet spot → payout, otherwise lose.
// The wheel layout is deterministic and shared with the client.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { MoneyWheelBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'moneyWheel'

// spot → { return mult, segments }
const SPOTS = [
  { id: 'x1', return: 2, segments: 24 },
  { id: 'x2', return: 3, segments: 15 },
  { id: 'x5', return: 6, segments: 8 },
  { id: 'x10', return: 11, segments: 4 },
  { id: 'x20', return: 21, segments: 2 },
  { id: 'joker', return: 41, segments: 1 },
]

const TOTAL_SEGS = SPOTS.reduce((t, s) => t + s.segments, 0)

// Deterministic 54-segment layout: the most valuable spots are
// placed at evenly spaced ideal positions; collisions shift right.
const LAYOUT = (() => {
  const out = new Array(TOTAL_SEGS).fill(null)
  const ordered = [...SPOTS].sort((a, b) => b.segments - a.segments)
  for (const s of ordered) {
    for (let k = 0; k < s.segments; k++) {
      let idx = Math.floor((k + 0.5) * TOTAL_SEGS / s.segments) % TOTAL_SEGS
      while (out[idx]) idx = (idx + 1) % TOTAL_SEGS
      out[idx] = { spot: s.id, mult: s.return }
    }
  }
  return out
})()

function land(index) {
  return LAYOUT[index % TOTAL_SEGS]
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    spot: b.spot,
    index: b.index,
    landedSpot: b.landedSpot,
    seed: b.seed,
    status: b.status,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    MoneyWheelBet.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      total: TOTAL_SEGS,
      wheel: LAYOUT,
      spots: SPOTS.map(s => ({ id: s.id, return: s.return, segments: s.segments })),
    },
    history: recent.map(serialize),
  }
}

export const moneyWheelRouter = Router()
moneyWheelRouter.use(requireAuth)

moneyWheelRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

moneyWheelRouter.post('/spin', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Money Wheel is paused. Please try again later.')

  const spotId = String(req.body?.spot ?? '')
  const spot = SPOTS.find(s => s.id === spotId)
  if (!spot) throw new HttpError(400, 'Pick a spot on the wheel')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const index = crypto.randomInt(0, TOTAL_SEGS)
  const landed = land(index)
  const won = landed.spot === spot.id
  const multiplier = won ? spot.return : 0
  const win = won ? Math.min(Math.floor(paise * spot.return), Math.round(cfg.maxWin * 100)) : 0

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await MoneyWheelBet.create([{
      user: req.userId,
      amount: paise,
      spot: spot.id,
      index,
      landedSpot: landed.spot,
      seed,
      status: won ? 'won' : 'lost',
      multiplier,
      win,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startMoneyWheel() {
  console.log('Money Wheel ready')
}
