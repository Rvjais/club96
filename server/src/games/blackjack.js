// ─────────────────────────────────────────────────────────────
// Blackjack — single-player vs house dealer.
// Standard rules: dealer hits on 16, stands on 17, blackjack pays 3:2.
// Player can hit, stand, double, split. House edge ~0.5% with basic strategy.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { BlackjackBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'blackjack'
const BLACKJACK_PAYOUT = 1.5 // 3:2 for natural blackjack
const DEALER_STAND_ON = 17

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

function newDeck() {
  const deck = []
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 13; r++) deck.push(r * 4 + s)
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function cardValue(cardIdx) {
  const r = Math.floor(cardIdx / 4)
  if (r >= 9) return 10 // J, Q, K = 10
  return r + 1 // A=1..9=9
}

function cardRank(cardIdx) {
  return RANKS[Math.floor(cardIdx / 4)]
}

function cardSuit(cardIdx) {
  return SUITS[cardIdx % 4]
}

function handValue(cards) {
  let total = 0
  let aces = 0
  for (const c of cards) {
    const v = cardValue(c)
    if (v === 1) aces += 1
    total += v
  }
  while (aces > 0 && total + 10 <= 21) {
    total += 10
    aces -= 1
  }
  return total
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21
}

function handString(cards) {
  return cards.map(c => cardRank(c) + cardSuit(c)).join(' ')
}

function serialize(bet) {
  return {
    id: String(bet._id),
    amount: toRupees(bet.amount),
    betAmount: toRupees(bet.betAmount),
    playerCards: bet.playerCards.map(c => ({ rank: cardRank(c), suit: cardSuit(c) })),
    dealerCards: bet.dealerCards.map(c => ({ rank: cardRank(c), suit: cardSuit(c) })),
    playerValue: bet.playerValue,
    dealerValue: bet.dealerValue,
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
    BlackjackBet.findOne({ user: userId, status: 'active' }).lean(),
    BlackjackBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      blackjackPayout: BLACKJACK_PAYOUT,
      dealerStandsOn: DEALER_STAND_ON,
    },
    active: active ? serialize(active) : null,
    recent: recent.map(serialize),
  }
}

async function activeRound(userId) {
  const bet = await BlackjackBet.findOne({ user: userId, status: 'active' }).lean()
  if (!bet) throw new HttpError(404, 'No round in progress')
  return bet
}

const sameRound = (bet) => ({ _id: bet._id, status: 'active' })
const raced = () => new HttpError(409, 'That move was already made')

export const blackjackRouter = Router()
blackjackRouter.use(requireAuth)

blackjackRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

blackjackRouter.post('/deal', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Blackjack is paused. Please try again later.')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const deck = newDeck()
  const playerCards = [deck.pop(), deck.pop()]
  const dealerCards = [deck.pop(), deck.pop()]
  const playerValue = handValue(playerCards)
  const dealerValue = handValue(dealerCards)

  let status, result, multiplier, win
  const playerBJ = isBlackjack(playerCards)
  const dealerBJ = isBlackjack(dealerCards)

  if (playerBJ && dealerBJ) {
    status = 'won'
    result = 'push'
    multiplier = 1
    win = paise
  } else if (playerBJ) {
    status = 'won'
    result = 'blackjack'
    multiplier = 1 + BLACKJACK_PAYOUT
    win = Math.floor(paise * (1 + BLACKJACK_PAYOUT))
  } else if (dealerBJ) {
    status = 'lost'
    result = 'dealerBlackjack'
    multiplier = 0
    win = 0
  } else {
    status = 'active'
    result = null
    multiplier = 1
    win = 0
  }

  await tx(async (session) => {
    if (await BlackjackBet.exists({ user: req.userId, status: 'active' }).session(session)) {
      throw new HttpError(409, 'Finish your current round first')
    }
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await BlackjackBet.create([{
      user: req.userId,
      amount: paise,
      betAmount: paise,
      deck: deck,
      playerCards,
      dealerCards,
      playerValue,
      dealerValue,
      status,
      multiplier,
      win,
      result,
      finished: status !== 'active',
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

blackjackRouter.post('/hit', async (req, res) => {
  const cfg = getSettings(GAME)
  const bet = await activeRound(req.userId)
  if (bet.status !== 'active') throw new HttpError(409, 'Round already finished')

  const deck = bet.deck
  const playerCards = [...bet.playerCards, deck.pop()]
  const playerValue = handValue(playerCards)

  let status = bet.status
  let result = bet.result
  let multiplier = bet.multiplier
  let win = bet.win
  let finished = bet.finished

  if (playerValue > 21) {
    status = 'lost'
    result = 'bust'
    multiplier = 0
    win = 0
    finished = true
  }

  await tx(async (session) => {
    const upd = await BlackjackBet.findOneAndUpdate(
      sameRound(bet),
      {
        deck,
        playerCards,
        playerValue,
        status,
        multiplier,
        win,
        result,
        finished,
      },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
  })

  res.json({ ...(await snapshotFor(req.userId)), hit: { card: { rank: cardRank(playerCards[playerCards.length - 1]), suit: cardSuit(playerCards[playerCards.length - 1]) }, value: playerValue, bust: playerValue > 21 } })
})

blackjackRouter.post('/stand', async (req, res) => {
  const cfg = getSettings(GAME)
  const bet = await activeRound(req.userId)
  if (bet.status !== 'active') throw new HttpError(409, 'Round already finished')

  let deck = [...bet.deck]
  let dealerCards = [...bet.dealerCards]
  let dealerValue = handValue(dealerCards)

  // Dealer hits until 17
  while (dealerValue < DEALER_STAND_ON) {
    dealerCards.push(deck.pop())
    dealerValue = handValue(dealerCards)
  }

  const playerValue = bet.playerValue
  let status, result, multiplier, win

  if (dealerValue > 21) {
    status = 'won'
    result = 'dealerBust'
    multiplier = 2
    win = bet.betAmount * 2
  } else if (dealerValue > playerValue) {
    status = 'lost'
    result = 'dealerWins'
    multiplier = 0
    win = 0
  } else if (dealerValue < playerValue) {
    status = 'won'
    result = 'playerWins'
    multiplier = 2
    win = bet.betAmount * 2
  } else {
    status = 'won'
    result = 'push'
    multiplier = 1
    win = bet.betAmount
  }

  await tx(async (session) => {
    const upd = await BlackjackBet.findOneAndUpdate(
      sameRound(bet),
      {
        deck,
        dealerCards,
        dealerValue,
        status,
        multiplier,
        win,
        result,
        finished: true,
      },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
    if (win > 0) await credit(session, bet.user, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

blackjackRouter.post('/double', async (req, res) => {
  const cfg = getSettings(GAME)
  const bet = await activeRound(req.userId)
  if (bet.status !== 'active') throw new HttpError(409, 'Round already finished')
  if (bet.playerCards.length !== 2) throw new HttpError(409, 'Can only double on first two cards')

  const additional = bet.betAmount
  const newBetAmount = bet.betAmount * 2

  if (newBetAmount > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, 'Double exceeds maximum bet')
  }

  const deck = [...bet.deck]
  const playerCards = [...bet.playerCards, deck.pop()]
  const playerValue = handValue(playerCards)

  let status = 'active'
  let result = null
  let multiplier = bet.multiplier
  let win = bet.win
  let finished = false

  if (playerValue > 21) {
    status = 'lost'
    result = 'bust'
    multiplier = 0
    win = 0
    finished = true
  }

  await tx(async (session) => {
    await debit(session, req.userId, additional, { type: 'bet', game: GAME })
    const upd = await BlackjackBet.findOneAndUpdate(
      sameRound(bet),
      {
        deck,
        playerCards,
        playerValue,
        betAmount: newBetAmount,
        amount: bet.amount + additional,
        status,
        multiplier,
        win,
        result,
        finished,
      },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
  })

  if (finished) {
    res.json(await snapshotFor(req.userId))
  } else {
    // Auto-stand after double on one card
    let dealerCards = [...bet.dealerCards]
    let dealerValue = handValue(dealerCards)
    while (dealerValue < DEALER_STAND_ON) {
      dealerCards.push(deck.pop())
      dealerValue = handValue(dealerCards)
    }

    let finalStatus, finalResult, finalMultiplier, finalWin
    if (dealerValue > 21) {
      finalStatus = 'won'
      finalResult = 'dealerBust'
      finalMultiplier = 2
      finalWin = newBetAmount * 2
    } else if (dealerValue > playerValue) {
      finalStatus = 'lost'
      finalResult = 'dealerWins'
      finalMultiplier = 0
      finalWin = 0
    } else if (dealerValue < playerValue) {
      finalStatus = 'won'
      finalResult = 'playerWins'
      finalMultiplier = 2
      finalWin = newBetAmount * 2
    } else {
      finalStatus = 'won'
      finalResult = 'push'
      finalMultiplier = 1
      finalWin = newBetAmount
    }

    await tx(async (session) => {
      const upd = await BlackjackBet.findOneAndUpdate(
        { _id: bet._id, status: 'active' },
        {
          deck,
          dealerCards,
          dealerValue,
          status: finalStatus,
          multiplier: finalMultiplier,
          win: finalWin,
          result: finalResult,
          finished: true,
        },
        { new: true, session },
      ).lean()
      if (!upd) throw raced()
      if (finalWin > 0) await credit(session, bet.user, finalWin, { type: 'win', game: GAME })
    })

    res.json(await snapshotFor(req.userId))
  }
})

export async function startBlackjack() {
  // Refund unfinished games from previous run
  const orphans = await BlackjackBet.find({ status: 'active', finished: { $ne: true } }).lean()
  for (const b of orphans) {
    await tx(async (session) => {
      const upd = await BlackjackBet.updateOne({ _id: b._id, status: 'active' }, { status: 'refunded', finished: true, settledAt: new Date() }, { session })
      if (upd.modifiedCount) await credit(session, b.user, b.betAmount, { type: 'refund', game: GAME, ref: b._id })
    })
  }
  if (orphans.length) console.log(`Blackjack: refunded ${orphans.length} unfinished round(s)`)
  console.log('Blackjack ready')
}