// ─────────────────────────────────────────────────────────────
// Pai Gow Poker — 7 cards each for player and dealer, both split
// automatically into a five-card high hand and a two-card low hand
// (house way). Win both hands → paid 1:1 minus 5% commission,
// split 1-1 → push, otherwise lose. Instant resolve.
// House edge ~2.8% (commission).
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { PaiGowBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'
import { newDeck, rankVal } from './deck.js'
import { eval5, compare5 } from './handEval.js'

const GAME = 'paiGow'
const COMMISSION = 5 // % of the profit taken on a win

function splitHouse(cards) {
  // 7 cards → { low: [2], high: [5] } by a simplified house way
  const counts = new Map()
  for (const c of cards) counts.set(rankVal(c), (counts.get(rankVal(c)) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const quads = groups.filter(g => g[1] === 4)
  const trips = groups.filter(g => g[1] === 3)
  const pairs = groups.filter(g => g[1] === 2)
  const singles = groups.filter(g => g[1] === 1)

  if (quads.length) {
    // quads stay together, best two of the rest go to the low hand
    const rest = singles.map(g => g[0]).sort((a, b) => b - a)
    const high = [...cards.filter(c => rankVal(c) === quads[0][0]), ...cards.filter(c => rankVal(c) === rest[0])]
    const low = cards.filter(c => rest.includes(rankVal(c))).slice(0, 2)
    return makeSplit(low, high, cards)
  }

  if (trips.length && pairs.length) {
    // full house: trips + pair exactly fill the high hand
    const high = cards.filter(c => rankVal(c) === trips[0][0] || rankVal(c) === pairs[0][0])
    return makeSplit(cards.filter(c => !high.includes(c)), high, cards)
  }

  if (trips.length) {
    // trips in the back, two highest singles in front
    const rest = singles.map(g => g[0]).sort((a, b) => b - a)
    const lowRanks = rest.slice(0, 2)
    const low = cards.filter(c => lowRanks.includes(rankVal(c)))
    return makeSplit(low, cards.filter(c => !low.includes(c)), cards)
  }

  if (pairs.length >= 2) {
    // split the two pairs: higher pair to the back
    const sortedPairs = [...pairs].sort((a, b) => b[0] - a[0])
    const lowRanks = sortedPairs[1][0]
    const low = cards.filter(c => rankVal(c) === lowRanks)
    return makeSplit(low, cards.filter(c => !low.includes(c)), cards)
  }

  if (pairs.length === 1) {
    // pair to the back, two highest single cards to the front
    const rest = singles.map(g => g[0]).sort((a, b) => b - a)
    const lowRanks = rest.slice(0, 2)
    const low = cards.filter(c => lowRanks.includes(rankVal(c)))
    return makeSplit(low, cards.filter(c => !low.includes(c)), cards)
  }

  // nothing but singles: play any straight / flush in the back,
  // otherwise keep the two highest cards in front
  let best = null
  for (let i = 0; i < cards.length - 1; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const low = [cards[i], cards[j]]
      const high = cards.filter((_, k) => k !== i && k !== j)
      const ev = eval5(high)
      const score = ev.cat * 1000 + lowValue(low)[0] * 10 + lowValue(low)[1]
      if (!best || score > best.score) best = { low, high, score }
    }
  }
  return best
}

/** low hand strength: [isPair, pairRank (-1 / rank), high card, second card] */
function lowValue(twoCards) {
  const v = twoCards.map(rankVal).sort((a, b) => b - a)
  return v[0] === v[1] ? [1, v[0], v[0], v[1]] : [0, -1, v[0], v[1]]
}

function compareLow(a2, b2) {
  const A = lowValue(a2)
  const B = lowValue(b2)
  if (A[1] !== B[1]) return A[1] > B[1] ? 1 : -1 // any pair beats no pair
  for (let i = 2; i < 4; i++) {
    if (A[i] !== B[i]) return A[i] > B[i] ? 1 : -1
  }
  return 0
}

function makeSplit(low, high, all) {
  return { low: low.slice(0, 2), high, all }
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    playerCards: b.playerCards,
    dealerCards: b.dealerCards,
    playerHigh: b.playerHigh,
    playerLow: b.playerLow,
    dealerHigh: b.dealerHigh,
    dealerLow: b.dealerLow,
    commission: COMMISSION,
    status: b.status,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    result: b.result, // playerWins | dealerWins | push
    seed: b.seed,
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    PaiGowBet.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      commission: COMMISSION,
      tieRule: 'Ties (copies) go to the dealer',
    },
    history: recent.map(serialize),
  }
}

export const paiGowRouter = Router()
paiGowRouter.use(requireAuth)

paiGowRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

paiGowRouter.post('/deal', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Pai Gow Poker is paused. Please try again later.')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const deck = newDeck()
  const pcards = deck.slice(0, 7)
  const dcards = deck.slice(7, 14)
  const ps = splitHouse(pcards)
  const ds = splitHouse(dcards)

  const highCmp = compare5(eval5(ps.high), eval5(ds.high))
  const lowCmp = compareLow(ps.low, ds.low)
  // player must win both hands to be paid; ties (copies) go to the dealer
  const both = highCmp > 0 && lowCmp > 0
  const neither = highCmp <= 0 && lowCmp <= 0

  let status = 'lost'
  let result = 'dealerWins'
  let win = 0
  let multiplier = 0
  if (both) {
    status = 'won'
    result = 'playerWins'
    const profit = Math.floor(paise * (1 - COMMISSION / 100))
    win = Math.min(paise + profit, Math.round(cfg.maxWin * 100))
    multiplier = win / paise
  } else if (!neither) {
    status = 'lost'
    result = 'push'
    win = paise // one hand each → push
    multiplier = 1
  }

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await PaiGowBet.create([{
      user: req.userId,
      amount: paise,
      seed,
      playerCards: pcards,
      dealerCards: dcards,
      playerHigh: ps.high,
      playerLow: ps.low,
      dealerHigh: ds.high,
      dealerLow: ds.low,
      status,
      multiplier,
      win,
      result,
    }], { session })
    if (win > 0) {
      await credit(session, req.userId, win, { type: win > paise ? 'win' : 'refund', game: GAME })
    }
  })

  res.json(await snapshotFor(req.userId))
})

export async function startPaiGow() {
  console.log('Pai Gow Poker ready')
}
