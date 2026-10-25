// ─────────────────────────────────────────────────────────────
// Coin Flip — heads or tails, 1.95x payout. Instant resolve.
// House edge ~2.5% (same math as Double red/black).
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { CoinFlipBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'coinFlip'
const SIDES = ['heads', 'tails']
const PAYOUT_MULT = 1.95

function flip(seed) {
  const n = parseInt(seed.slice(0, 2), 16)
  return SIDES[n % 2]
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    side: b.side,
    result: b.result,
    seed: b.seed,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    CoinFlipBet.find({ user: userId }).sort({ createdAt: -1 }).limit(30).lean(),
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
    history: recent.map(serialize),
  }
}

export const coinFlipRouter = Router()
coinFlipRouter.use(requireAuth)

coinFlipRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

coinFlipRouter.post('/bet', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Coin Flip is paused. Please try again later.')

  const side = String(req.body?.side).toLowerCase()
  if (!SIDES.includes(side)) throw new HttpError(400, 'Pick heads or tails')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const result = flip(seed)
  const won = result === side
  const multiplier = won ? PAYOUT_MULT : 0
  const win = won ? Math.min(Math.floor(paise * PAYOUT_MULT), Math.round(cfg.maxWin * 100)) : 0

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await CoinFlipBet.create([{
      user: req.userId,
      amount: paise,
      side,
      result,
      seed,
      multiplier,
      win,
    }], { session })
    if (won) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startCoinFlip() {
  console.log('Coin Flip ready')
}
