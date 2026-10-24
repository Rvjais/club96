// ─────────────────────────────────────────────────────────────
// Teen Patti (3-Card) vs House — player gets 3 cards, can Play
// or Fold against the dealer. Optional Pair+ side bet.
// House edge: ~3.5% on ante, ~7% on Pair+.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { TeenPattiBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'teenPatti'

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

// Hand rankings: 0=high card, 1=pair, 2=color, 3=sequence, 4=pure sequence, 5=trial
function handRank(cards) {
  const vals = cards.map(c => RANKS.indexOf(c.slice(0, -1)) + 1) // A=1..K=13
  const suits = cards.map(c => c.slice(-1))
  const sorted = [...vals].sort((a, b) => b - a)

  const isTrial = vals[0] === vals[1] && vals[1] === vals[2]
  const isPureSeq = (sorted[0] === sorted[1] + 1 && sorted[1] === sorted[2] + 1) && suits[0] === suits[1] && suits[1] === suits[2]
  const isSeq = sorted[0] === sorted[1] + 1 && sorted[1] === sorted[2] + 1
  const isColor = suits[0] === suits[1] && suits[1] === suits[2]
  const isPair = vals[0] === vals[1] || vals[1] === vals[2] || vals[0] === vals[2]

  if (isTrial) return 5
  if (isPureSeq) return 4
  if (isSeq) return 3
  if (isColor) return 2
  if (isPair) return 1
  return 0
}

function handName(rank) {
  return ['High Card', 'Pair', 'Color', 'Sequence', 'Pure Sequence', 'Trial'][rank]
}

function handString(cards) {
  return cards.map(c => c).join(' ')
}

function newDeck() {
  const deck = []
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 13; r++) deck.push(RANKS[r] + SUITS[s])
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function compareHands(playerCards, dealerCards) {
  const pr = handRank(playerCards)
  const dr = handRank(dealerCards)
  if (pr !== dr) return pr > dr ? 1 : -1
  // Same rank — compare high cards
  const pv = playerCards.map(c => RANKS.indexOf(c.slice(0, -1)) + 1).sort((a, b) => b - a)
  const dv = dealerCards.map(c => RANKS.indexOf(c.slice(0, -1)) + 1).sort((a, b) => b - a)
  for (let i = 0; i < 3; i++) {
    if (pv[i] !== dv[i]) return pv[i] > dv[i] ? 1 : -1
  }
  return 0 // tie — dealer wins ties
}

// Pair+ payout: pair=1:1, color=3:1, sequence=5:1, pure sequence=30:1, trial=40:1
const PAIR_PLUS_PAYOUTS = { 0: 0, 1: 1, 2: 3, 3: 5, 4: 30, 5: 40 }

function serialize(bet) {
  return {
    id: String(bet._id),
    amount: toRupees(bet.amount),
    pairPlus: toRupees(bet.pairPlus),
    playerCards: bet.playerCards,
    dealerCards: bet.dealerCards,
    playerRank: bet.playerRank,
    dealerRank: bet.dealerRank,
    playerHand: handName(bet.playerRank),
    dealerHand: handName(bet.dealerRank),
    status: bet.status,
    multiplier: bet.multiplier,
    win: toRupees(bet.win),
    result: bet.result,
    time: bet.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, active, recent] = await Promise.all([
    balanceOf(userId),
    TeenPattiBet.findOne({ user: userId, status: 'active' }).lean(),
    TeenPattiBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      pairPlusPayouts: PAIR_PLUS_PAYOUTS,
    },
    active: active ? serialize(active) : null,
    recent: recent.map(serialize),
  }
}

async function activeRound(userId) {
  const bet = await TeenPattiBet.findOne({ user: userId, status: 'active' }).lean()
  if (!bet) throw new HttpError(404, 'No round in progress')
  return bet
}

const sameRound = (bet) => ({ _id: bet._id, status: 'active' })
const raced = () => new HttpError(409, 'That move was already made')

export const teenPattiRouter = Router()
teenPattiRouter.use(requireAuth)

teenPattiRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

teenPattiRouter.post('/deal', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Teen Patti is paused. Please try again later.')

  const ante = toPaise(req.body?.ante)
  if (!Number.isInteger(ante) || ante < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (ante > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const pairPlus = toPaise(req.body?.pairPlus ?? 0)
  if (pairPlus > 0 && pairPlus > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, 'Pair+ exceeds maximum bet')
  }

  const deck = newDeck()
  const playerCards = [deck.pop(), deck.pop(), deck.pop()]
  const dealerCards = [deck.pop(), deck.pop(), deck.pop()]
  const playerRank = handRank(playerCards)
  const dealerRank = handRank(dealerCards)

  await tx(async (session) => {
    if (await TeenPattiBet.exists({ user: req.userId, status: 'active' }).session(session)) {
      throw new HttpError(409, 'Finish your current round first')
    }
    const totalStake = ante + pairPlus
    await debit(session, req.userId, totalStake, { type: 'bet', game: GAME })
    await TeenPattiBet.create([{
      user: req.userId,
      amount: totalStake,
      ante,
      pairPlus,
      deck,
      playerCards,
      dealerCards,
      playerRank,
      dealerRank,
      status: 'active',
      multiplier: 0,
      win: 0,
      result: null,
      finished: false,
    }], { session })
  })

  res.json(await snapshotFor(req.userId))
})

teenPattiRouter.post('/play', async (req, res) => {
  const cfg = getSettings(GAME)
  const bet = await activeRound(req.userId)
  if (bet.status !== 'active') throw new HttpError(409, 'Round already finished')

  // Player plays: must match the ante as play bet
  const playBet = bet.ante
  const totalStake = bet.amount + playBet

  if (totalStake > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, 'Play bet exceeds maximum')
  }

  const cmp = compareHands(bet.playerCards, bet.dealerCards)
  let anteWin = 0, playWin = 0, pairPlusWin = 0, result

  if (cmp > 0) {
    // Player wins ante and play (1:1 each)
    anteWin = bet.ante
    playWin = playBet
    result = 'playerWins'
  } else if (cmp < 0) {
    result = 'dealerWins'
  } else {
    // Tie — dealer wins ties, but ante/play push
    anteWin = bet.ante
    playWin = playBet
    result = 'push'
  }

  // Pair+ side bet — independent of dealer
  const ppRank = handRank(bet.playerCards)
  const ppMult = PAIR_PLUS_PAYOUTS[ppRank]
  pairPlusWin = ppMult > 0 ? Math.floor(bet.pairPlus * (1 + ppMult)) : 0

  const win = anteWin + playWin + pairPlusWin

  await tx(async (session) => {
    await debit(session, req.userId, playBet, { type: 'bet', game: GAME })
    const upd = await TeenPattiBet.findOneAndUpdate(
      sameRound(bet),
      {
        status: win > 0 ? 'won' : 'lost',
        multiplier: win > 0 ? (win / bet.amount) : 0,
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

teenPattiRouter.post('/fold', async (req, res) => {
  const bet = await activeRound(req.userId)
  if (bet.status !== 'active') throw new HttpError(409, 'Round already finished')

  // Fold: lose ante, Pair+ still resolves
  const ppRank = handRank(bet.playerCards)
  const ppMult = PAIR_PLUS_PAYOUTS[ppRank]
  const pairPlusWin = ppMult > 0 ? Math.floor(bet.pairPlus * (1 + ppMult)) : 0

  await tx(async (session) => {
    const upd = await TeenPattiBet.findOneAndUpdate(
      sameRound(bet),
      {
        status: pairPlusWin > 0 ? 'won' : 'lost',
        multiplier: pairPlusWin > 0 ? (pairPlusWin / bet.amount) : 0,
        win: pairPlusWin,
        result: 'folded',
        finished: true,
      },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
    if (pairPlusWin > 0) await credit(session, bet.user, pairPlusWin, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startTeenPatti() {
  const orphans = await TeenPattiBet.find({ status: 'active', finished: { $ne: true } }).lean()
  for (const b of orphans) {
    await tx(async (session) => {
      const upd = await TeenPattiBet.updateOne({ _id: b._id, status: 'active' }, { status: 'refunded', finished: true, settledAt: new Date() }, { session })
      if (upd.modifiedCount) await credit(session, b.user, b.ante, { type: 'refund', game: GAME, ref: b._id })
    })
  }
  if (orphans.length) console.log(`Teen Patti: refunded ${orphans.length} unfinished round(s)`)
  console.log('Teen Patti ready')
}