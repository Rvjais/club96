// ─────────────────────────────────────────────────────────────
// 3 Card Poker — player gets 3 cards, can Play (match the ante)
// or Fold. Dealer needs Q-high or better to qualify. Optional
// Pair Plus side bet paid on the player's hand alone.
// Hand order: Straight Flush > Trips > Straight > Flush > Pair > High
// House edge ~3.4% ante / ~4.5% Pair Plus.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { ThreeCardBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'
import { newDeck, rankVal, suitOf } from './deck.js'

const GAME = 'threeCard'

// pair plus payout — return multiplier (incl. stake)
const PAIR_PLUS = {
  5: 41, // straight flush (40:1)
  4: 31, // three of a kind (30:1)
  3: 7,  // straight (6:1)
  2: 5,  // flush (4:1)
  1: 2,  // pair (1:1)
  0: 0,
}

const HAND_NAMES = {
  0: 'High Card', 1: 'Pair', 2: 'Flush', 3: 'Straight', 4: 'Three of a Kind', 5: 'Straight Flush',
}

const handName = (r) => HAND_NAMES[r]

/** 3-card poker rank: 5 SF · 4 trips · 3 straight · 2 flush · 1 pair · 0 high */
function eval3(cards) {
  const vals = cards.map(rankVal).sort((a, b) => b - a)
  const suits = cards.map(suitOf)

  const isFlush = suits.every(s => s === suits[0])
  const isWheelLessStraight = (vals.join(',') === '14,3,2') // A-2-3 → 3-high straight
  const isStraight = isWheelLessStraight || (vals[0] - vals[2] === 2 && new Set(vals).size === 3)
  const isTrips = vals[0] === vals[1] && vals[1] === vals[2]
  const isPair = vals[0] === vals[1] || vals[1] === vals[2]
  // high cards for comparison: wheel treats the ace as the lowest
  const hi = isWheelLessStraight ? vals[1] : vals[0] // A-2-3 → straight to the 3
  const hiCards = isWheelLessStraight ? [3, 2, 1] : vals

  if (isStraight && isFlush) return { cat: 5, cards: hiCards }
  if (isTrips) return { cat: 4, cards: [vals[0]] }
  if (isStraight) return { cat: 3, cards: hiCards }
  if (isFlush) return { cat: 2, cards: vals }
  if (isPair) return pairFor(vals)
  return { cat: 0, cards: vals }
}

function pairFor(vals) {
  if (vals[0] === vals[1]) return { cat: 1, cards: [vals[0], vals[2]] }
  return { cat: 1, cards: [vals[1], vals[0]] } // pair is the middle+third
}

function compare3(a, b) {
  if (a.cat !== b.cat) return a.cat > b.cat ? 1 : -1
  const n = Math.max(a.cards.length, b.cards.length)
  for (let i = 0; i < n; i++) {
    const x = a.cards[i] ?? 0
    const y = b.cards[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    ante: toRupees(b.ante),
    pairPlus: toRupees(b.pairPlus),
    playerCards: b.playerCards,
    dealerCards: b.dealerCards,
    playerRank: b.playerRank,
    dealerRank: b.dealerRank,
    playerHand: handName(b.playerRank),
    dealerHand: handName(b.dealerRank),
    dealerQualified: b.dealerQualified,
    status: b.status,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    result: b.result, // playerWins | dealerWins | push | folded | dealerNoQualify
    finished: b.finished,
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, active, recent] = await Promise.all([
    balanceOf(userId),
    ThreeCardBet.findOne({ user: userId, status: 'active' }).lean(),
    ThreeCardBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      pairPlus: PAIR_PLUS,
      qualifyRule: 'Dealer needs Q-high or better to qualify',
    },
    active: active ? serialize(active) : null,
    history: recent.map(serialize),
  }
}

async function activeRound(userId) {
  const bet = await ThreeCardBet.findOne({ user: userId, status: 'active' }).lean()
  if (!bet) throw new HttpError(404, 'No round in progress')
  return bet
}

const sameRound = (bet) => ({ _id: bet._id, status: 'active' })
const raced = () => new HttpError(409, 'That move was already made')

export const threeCardRouter = Router()
threeCardRouter.use(requireAuth)

threeCardRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

threeCardRouter.post('/deal', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, '3 Card Poker is paused. Please try again later.')

  const ante = toPaise(req.body?.ante)
  if (!Number.isInteger(ante) || ante < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (ante > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const pairPlus = toPaise(req.body?.pairPlus ?? 0)
  if (pairPlus < 0 || pairPlus > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, 'Pair Plus exceeds the maximum bet')
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const deck = newDeck()
  const playerCards = [deck[0], deck[1], deck[2]]
  const dealerCards = [deck[3], deck[4], deck[5]]
  const pv = eval3(playerCards)
  const dv = eval3(dealerCards)

  await tx(async (session) => {
    if (await ThreeCardBet.exists({ user: req.userId, status: 'active' }).session(session)) {
      throw new HttpError(409, 'Finish your current round first')
    }
    await debit(session, req.userId, ante + pairPlus, { type: 'bet', game: GAME })
    await ThreeCardBet.create([{
      user: req.userId,
      amount: ante + pairPlus,
      ante,
      pairPlus,
      seed,
      playerCards,
      dealerCards,
      playerRank: pv.cat,
      dealerRank: dv.cat,
      status: 'active',
      finished: false,
    }], { session })
  })

  res.json(await snapshotFor(req.userId))
})

threeCardRouter.post('/play', async (req, res) => {
  const cfg = getSettings(GAME)
  const bet = await activeRound(req.userId)

  const playBet = bet.ante
  if (bet.amount + playBet > Math.round(cfg.maxBet * 100) * 2) {
    throw new HttpError(400, 'Play bet exceeds the maximum')
  }

  const pv = eval3(bet.playerCards)
  const dv = eval3(bet.dealerCards)
  const qualified = dv.cat >= 1 || Math.max(...bet.dealerCards.map(rankVal)) >= 12 // Q or better
  const cmp = compare3(pv, dv)

  let anteWin = 0
  let playWin = 0
  let result
  if (!qualified) {
    // ante pays 1:1, play bet pushes
    anteWin = bet.ante * 2
    playWin = playBet
    result = 'dealerNoQualify'
  } else if (cmp > 0) {
    anteWin = bet.ante * 2
    playWin = playBet * 2
    result = 'playerWins'
  } else if (cmp < 0) {
    result = 'dealerWins'
  } else {
    anteWin = bet.ante
    playWin = playBet
    result = 'push'
  }

  const ppMult = PAIR_PLUS[pv.cat] ?? 0
  const ppWin = ppMult > 0 ? Math.floor(bet.pairPlus * ppMult) : 0
  const win = anteWin + playWin + ppWin

  await tx(async (session) => {
    await debit(session, bet.user, playBet, { type: 'bet', game: GAME })
    const upd = await ThreeCardBet.findOneAndUpdate(
      sameRound(bet),
      {
        amount: bet.amount + playBet,
        dealerQualified: qualified,
        status: win > 0 ? 'won' : 'lost',
        win,
        multiplier: win > 0 ? win / (bet.amount + playBet) : 0,
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

threeCardRouter.post('/fold', async (req, res) => {
  const bet = await activeRound(req.userId)

  // folding forfeits the ante; the Pair Plus bet still resolves
  const pv = eval3(bet.playerCards)
  const ppMult = PAIR_PLUS[pv.cat] ?? 0
  const ppWin = ppMult > 0 ? Math.floor(bet.pairPlus * ppMult) : 0

  await tx(async (session) => {
    const upd = await ThreeCardBet.findOneAndUpdate(
      sameRound(bet),
      {
        status: ppWin > 0 ? 'won' : 'lost',
        win: ppWin,
        multiplier: ppWin > 0 ? ppWin / bet.amount : 0,
        result: 'folded',
        finished: true,
      },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
    if (ppWin > 0) await credit(session, bet.user, ppWin, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startThreeCard() {
  const orphans = await ThreeCardBet.find({ status: 'active' }).lean()
  for (const b of orphans) {
    await tx(async (session) => {
      const upd = await ThreeCardBet.updateOne({ _id: b._id, status: 'active' }, { status: 'refunded', finished: true, settledAt: new Date() }, { session })
      if (upd.modifiedCount) await credit(session, b.user, b.amount, { type: 'refund', game: GAME, ref: b._id })
    })
  }
  if (orphans.length) console.log(`3 Card Poker: refunded ${orphans.length} unfinished round(s)`)
  console.log('3 Card Poker ready')
}
