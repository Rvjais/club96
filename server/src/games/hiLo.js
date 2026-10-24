// ─────────────────────────────────────────────────────────────
// Hi-Lo Cards — Predict if the next card is higher or lower.
// Streak multipliers for consecutive correct guesses.
// House edge ~3.5% via tie rules and payout curve.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { HiLoBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'hiLo'
const SUITS = ['h', 'd', 'c', 's']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

// Rank values: A=1, 2=2... K=13 (Ace low for simplicity)
function rankValue(rank) {
  return RANKS.indexOf(rank) + 1
}

// Create a fresh shuffled deck
function newDeck() {
  const deck = []
  for (const s of SUITS) {
    for (const r of RANKS) deck.push(r + s)
  }
  // Fisher-Yates shuffle using crypto
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

// Payout multipliers by streak (capped for house edge)
const STREAK_PAYOUTS = [1.95, 2.0, 2.1, 2.25, 2.5, 3.0, 4.0, 5.5, 8.0, 12.0, 18.0, 28.0, 45.0, 70.0, 110.0]
// Probability of correct guess (excluding ties): ~46.3% per round
// With tie=loss, house edge ≈ 3.5% on first guess, compounding on streaks

function nextMultiplier(streak) {
  if (streak >= STREAK_PAYOUTS.length) return STREAK_PAYOUTS[STREAK_PAYOUTS.length - 1]
  return STREAK_PAYOUTS[streak]
}

function serialize(bet, cfg) {
  const active = bet.status === 'active'
  return {
    id: String(bet._id),
    amount: toRupees(bet.amount),
    streak: bet.streak,
    currentCard: bet.currentCard,
    multiplier: bet.multiplier,
    nextMultiplier: active ? nextMultiplier(bet.streak) : null,
    win: toRupees(bet.win),
    status: bet.status,
    time: bet.settledAt ?? bet.createdAt,
    // Server seed revealed only after cashout/loss
    ...(!active ? { seed: bet.seed } : {}),
  }
}

async function snapshotFor(userId) {
  const [balance, active, recent] = await Promise.all([
    balanceOf(userId),
    HiLoBet.findOne({ user: userId, status: 'active' }).lean(),
    HiLoBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])

  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
    },
    active: active ? serialize(active, cfg) : null,
    recent: recent.map(b => serialize(b, cfg)),
  }
}

async function activeRound(userId) {
  const bet = await HiLoBet.findOne({ user: userId, status: 'active' }).lean()
  if (!bet) throw new HttpError(404, 'No round in progress')
  return bet
}

// Every update is conditional on the streak we read
const sameRound = (bet) => ({ _id: bet._id, status: 'active', streak: bet.streak })
const raced = () => new HttpError(409, 'That move was already made')

async function cashOut(bet, cfg) {
  const win = Math.min(Math.floor(bet.amount * bet.multiplier + 1e-6), Math.round(cfg.maxWin * 100))
  return tx(async (session) => {
    const upd = await HiLoBet.findOneAndUpdate(
      sameRound(bet),
      { status: 'won', win, settledAt: new Date() },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
    const balance = await credit(session, bet.user, win, { type: 'win', game: GAME, ref: bet._id })
    return { bet: serialize(upd, cfg), balance: toRupees(balance) }
  })
}

export const hiLoRouter = Router()
hiLoRouter.use(requireAuth)

hiLoRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

hiLoRouter.post('/start', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Hi-Lo is paused. Please try again later.')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const deck = newDeck()
  const currentCard = deck.pop() // first card shown to player

  await tx(async (session) => {
    if (await HiLoBet.exists({ user: req.userId, status: 'active' }).session(session)) {
      throw new HttpError(409, 'Finish your current round first')
    }
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await HiLoBet.create([{
      user: req.userId,
      amount: paise,
      seed,
      deck: deck.slice(0, 15), // store next 15 cards (max streak)
      currentCard,
      streak: 0,
      multiplier: 1,
      status: 'active',
    }], { session })
  })

  res.json(await snapshotFor(req.userId))
})

hiLoRouter.post('/guess', async (req, res) => {
  const direction = String(req.body?.direction).toLowerCase() // 'higher' or 'lower'
  if (direction !== 'higher' && direction !== 'lower') throw new HttpError(400, 'Guess higher or lower')

  const cfg = getSettings(GAME)
  const bet = await activeRound(req.userId)

  const currentVal = rankValue(bet.currentCard.slice(0, -1))
  const nextCard = bet.deck[0]
  const nextVal = rankValue(nextCard.slice(0, -1))

  let newStreak = bet.streak
  let newMultiplier = bet.multiplier
  let newDeck = [...bet.deck]
  let newCurrentCard = nextCard
  let status = 'active'

  // Tie = loss (house edge)
  if (nextVal === currentVal) {
    status = 'lost'
    newMultiplier = 0
  } else {
    const correct = (direction === 'higher' && nextVal > currentVal) || (direction === 'lower' && nextVal < currentVal)
    if (correct) {
      newStreak += 1
      newMultiplier = nextMultiplier(newStreak - 1)
      newDeck.shift()
      newCurrentCard = newDeck[0] ?? nextCard // if deck exhausted, game ends on next guess
    } else {
      status = 'lost'
      newMultiplier = 0
    }
  }

  if (status === 'lost') {
    const upd = await HiLoBet.findOneAndUpdate(
      sameRound(bet),
      { status: 'lost', multiplier: 0, win: 0, settledAt: new Date() },
      { new: true },
    ).lean()
    if (!upd) throw raced()
    return res.json({ bet: serialize(upd, cfg), balance: toRupees(await balanceOf(req.userId)) })
  }

  const upd = await HiLoBet.findOneAndUpdate(
    sameRound(bet),
    { streak: newStreak, multiplier: newMultiplier, deck: newDeck, currentCard: newCurrentCard },
    { new: true },
  ).lean()
  if (!upd) throw raced()

  res.json({ bet: serialize(upd, cfg), balance: toRupees(await balanceOf(req.userId)) })
})

hiLoRouter.post('/cashout', async (req, res) => {
  const cfg = getSettings(GAME)
  const bet = await activeRound(req.userId)
  if (bet.streak === 0) throw new HttpError(400, 'Make at least one correct guess first')
  res.json(await cashOut(bet, cfg))
})

export async function startHiLo() {
  console.log('Hi-Lo Cards ready')
}