// ─────────────────────────────────────────────────────────────
// Red Dog — two cards dealt; the bet pays if the third card falls
// between them. Spread payout: 1 → 5:1, 2 → 4:1, 3 → 2:1,
// 4+ → 1:1. Consecutive cards and pairs push (pair + third of the
// same rank pays 11:1). Instant resolve.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { RedDogBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'
import { newDeck, rankVal } from './deck.js'

const GAME = 'redDog'

// return multiplier (incl. stake) by spread
const SPREAD_PAYOUT = { 1: 6, 2: 5, 3: 3 }
const pairTripPayout = 12 // pair + third of the same rank → 11:1 profit

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    card1: b.card1,
    card2: b.card2,
    card3: b.card3,
    spread: b.spread,
    seed: b.seed,
    result: b.result, // win | push | lose | triple
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    RedDogBet.find({ user: userId }).sort({ createdAt: -1 }).limit(30).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      spreadPayout: SPREAD_PAYOUT,
      pairTriple: 11,
    },
    history: recent.map(serialize),
  }
}

export const redDogRouter = Router()
redDogRouter.use(requireAuth)

redDogRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

redDogRouter.post('/deal', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Red Dog is paused. Please try again later.')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const deck = newDeck()
  const card1 = deck[0]
  const card2 = deck[1]
  const card3 = deck[2]
  const a = rankVal(card1)
  const b = rankVal(card2)
  const c = rankVal(card3)

  let result
  let multiplier = 0
  let win = 0
  let spread = 0

  if (a === b) {
    // Pair on the first two cards: beats only with the third card of the same rank
    if (c === a) {
      result = 'triple'
      multiplier = pairTripPayout
      win = Math.min(Math.floor(paise * pairTripPayout), Math.round(cfg.maxWin * 100))
    } else {
      result = 'push'
      win = paise
      multiplier = 1
    }
  } else {
    const high = Math.max(a, b)
    const low = Math.min(a, b)
    if (high - low === 1) {
      // consecutive cards — no room to win
      result = 'push'
      win = paise
      multiplier = 1
    } else {
      spread = high - low - 1
      if (c > low && c < high) {
        // third card falls between
        multiplier = spread >= 4 ? 2 : SPREAD_PAYOUT[spread]
        result = 'win'
        win = Math.min(Math.floor(paise * multiplier), Math.round(cfg.maxWin * 100))
      } else {
        result = 'lose'
      }
    }
  }

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await RedDogBet.create([{
      user: req.userId,
      amount: paise,
      card1,
      card2,
      card3,
      spread,
      seed,
      result,
      multiplier,
      win,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startRedDog() {
  console.log('Red Dog ready')
}
