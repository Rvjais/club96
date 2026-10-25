// ─────────────────────────────────────────────────────────────
// High Card Draw — one card each, highest rank wins (Ace high).
// Tie pushes (stake returned). Payout 1.92x on a win.
// House edge ~3.7%.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { HighCardBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'
import { newDeck, rankVal } from './deck.js'

const GAME = 'highCard'
const PAYOUT_MULT = 1.92

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    playerCard: b.playerCard,
    dealerCard: b.dealerCard,
    seed: b.seed,
    result: b.result, // playerWins | dealerWins | push
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    HighCardBet.find({ user: userId }).sort({ createdAt: -1 }).limit(30).lean(),
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

export const highCardRouter = Router()
highCardRouter.use(requireAuth)

highCardRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

highCardRouter.post('/draw', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'High Card Draw is paused. Please try again later.')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const deck = newDeck()
  const playerCard = deck[0]
  const dealerCard = deck[1]

  let multiplier = PAYOUT_MULT
  let result
  let win = 0
  if (rankVal(playerCard) > rankVal(dealerCard)) {
    result = 'playerWins'
    win = Math.min(Math.floor(paise * PAYOUT_MULT), Math.round(cfg.maxWin * 100))
    multiplier = PAYOUT_MULT
  } else if (rankVal(playerCard) < rankVal(dealerCard)) {
    result = 'dealerWins'
    multiplier = 0
  } else {
    result = 'push'
    win = paise
    multiplier = 1
  }

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await HighCardBet.create([{
      user: req.userId,
      amount: paise,
      playerCard,
      dealerCard,
      seed,
      result,
      multiplier,
      win,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startHighCard() {
  console.log('High Card Draw ready')
}
