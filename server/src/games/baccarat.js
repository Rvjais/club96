// ─────────────────────────────────────────────────────────────
// Baccarat (Punto Banco) — bet on Player, Banker, or Tie.
// Fixed drawing rules, no player decisions. House edge: 1.06% (Banker),
// 1.24% (Player), 14.36% (Tie at 8:1).
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { BaccaratBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'baccarat'

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

// Payouts
const PAYOUT_PLAYER = 1
const PAYOUT_BANKER = 0.95 // 1:1 minus 5% commission
const PAYOUT_TIE = 8

function newDeck() {
  const deck = []
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 13; r++) deck.push(r * 4 + s)
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function cardValue(cardIdx) {
  const r = Math.floor(cardIdx / 4)
  if (r === 0) return 1 // Ace = 1
  if (r >= 9) return 0 // 10, J, Q, K = 0
  return r + 1 // 2-9
}

function cardRank(cardIdx) {
  return RANKS[Math.floor(cardIdx / 4)]
}

function cardSuit(cardIdx) {
  return SUITS[cardIdx % 4]
}

function handValue(cards) {
  let total = 0
  for (const c of cards) total += cardValue(c)
  return total % 10
}

function handString(cards) {
  return cards.map(c => cardRank(c) + cardSuit(c)).join(' ')
}

function needsThirdCard(playerCards, bankerCards) {
  const playerTotal = handValue(playerCards)
  const bankerTotal = handValue(bankerCards)
  const playerThird = playerCards[2]

  // Natural: stand
  if (playerTotal >= 8 || bankerTotal >= 8) return false

  // Player draws on 0-5
  if (playerCards.length === 2 && playerTotal <= 5) return true

  // Player stood (6-7): banker draws on 0-5, stands on 6-7
  if (playerCards.length === 2) {
    return bankerTotal <= 5
  }

  // Player drew a third card — banker's decision depends on player's third card
  const p3 = cardValue(playerThird)
  if (bankerTotal <= 2) return true
  if (bankerTotal === 3) return p3 !== 8
  if (bankerTotal === 4) return p3 >= 2 && p3 <= 7
  if (bankerTotal === 5) return p3 >= 4 && p3 <= 7
  if (bankerTotal === 6) return p3 === 6 || p3 === 7
  return false // banker 7 stands
}

function serialize(bet) {
  return {
    id: String(bet._id),
    amount: toRupees(bet.amount),
    betOn: bet.betOn,
    playerCards: bet.playerCards.map(c => ({ rank: cardRank(c), suit: cardSuit(c) })),
    bankerCards: bet.bankerCards.map(c => ({ rank: cardRank(c), suit: cardSuit(c) })),
    playerValue: bet.playerValue,
    bankerValue: bet.bankerValue,
    status: bet.status,
    win: toRupees(bet.win),
    multiplier: bet.multiplier,
    result: bet.result,
    time: bet.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, active, recent] = await Promise.all([
    balanceOf(userId),
    BaccaratBet.findOne({ user: userId, status: 'active' }).lean(),
    BaccaratBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      playerPayout: PAYOUT_PLAYER,
      bankerPayout: PAYOUT_BANKER,
      tiePayout: PAYOUT_TIE,
    },
    active: active ? serialize(active) : null,
    recent: recent.map(serialize),
  }
}

async function activeRound(userId) {
  const bet = await BaccaratBet.findOne({ user: userId, status: 'active' }).lean()
  if (!bet) throw new HttpError(404, 'No round in progress')
  return bet
}

const sameRound = (bet) => ({ _id: bet._id, status: 'active' })
const raced = () => new HttpError(409, 'That move was already made')

export const baccaratRouter = Router()
baccaratRouter.use(requireAuth)

baccaratRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

baccaratRouter.post('/bet', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Baccarat is paused. Please try again later.')

  const betOn = String(req.body?.betOn)
  if (!['player', 'banker', 'tie'].includes(betOn)) throw new HttpError(400, 'Bet on player, banker, or tie')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const deck = newDeck()
  const playerCards = [deck.pop(), deck.pop()]
  const bankerCards = [deck.pop(), deck.pop()]

  let playerValue = handValue(playerCards)
  let bankerValue = handValue(bankerCards)

  // Natural check
  if (playerValue < 8 && bankerValue < 8) {
    // Player draws
    if (playerValue <= 5) {
      playerCards.push(deck.pop())
      playerValue = handValue(playerCards)
    }
    // Banker draws
    if (needsThirdCard(playerCards, bankerCards)) {
      bankerCards.push(deck.pop())
      bankerValue = handValue(bankerCards)
    }
  }

  let result, multiplier, win
  if (playerValue > bankerValue) {
    result = 'player'
    multiplier = betOn === 'player' ? 1 + PAYOUT_PLAYER : 0
    win = betOn === 'player' ? Math.floor(paise * (1 + PAYOUT_PLAYER)) : 0
  } else if (bankerValue > playerValue) {
    result = 'banker'
    multiplier = betOn === 'banker' ? 1 + PAYOUT_BANKER : 0
    win = betOn === 'banker' ? Math.floor(paise * (1 + PAYOUT_BANKER)) : 0
  } else {
    result = 'tie'
    multiplier = betOn === 'tie' ? 1 + PAYOUT_TIE : 0
    win = betOn === 'tie' ? Math.floor(paise * (1 + PAYOUT_TIE)) : 0
  }

  win = Math.min(win, Math.round(cfg.maxWin * 100))

  await tx(async (session) => {
    if (await BaccaratBet.exists({ user: req.userId, status: 'active' }).session(session)) {
      throw new HttpError(409, 'Finish your current round first')
    }
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await BaccaratBet.create([{
      user: req.userId,
      amount: paise,
      betOn,
      playerCards,
      bankerCards,
      playerValue,
      bankerValue,
      status: 'won',
      multiplier,
      win,
      result,
      finished: true,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startBaccarat() {
  const orphans = await BaccaratBet.find({ status: 'active', finished: { $ne: true } }).lean()
  for (const b of orphans) {
    await tx(async (session) => {
      const upd = await BaccaratBet.updateOne({ _id: b._id, status: 'active' }, { status: 'refunded', finished: true, settledAt: new Date() }, { session })
      if (upd.modifiedCount) await credit(session, b.user, b.amount, { type: 'refund', game: GAME, ref: b._id })
    })
  }
  if (orphans.length) console.log(`Baccarat: refunded ${orphans.length} unfinished round(s)`)
  console.log('Baccarat ready')
}