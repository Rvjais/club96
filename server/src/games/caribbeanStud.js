// ─────────────────────────────────────────────────────────────
// Caribbean Stud — 5-card stud vs the dealer. Player antes, then
// folds (loses ante) or plays (raises 2× ante). Dealer qualifies
// with K-high or better: no qualify → ante pays 1:1, raise pushes;
// qualify and player wins → ante 1:1, raise paid by hand payout.
// Raise return multipliers: pair/high 2 · two pair 3 · trips 4 ·
// straight 5 · flush 6 · full house 8 · quads 21 · SF 51 · RF 251
// House edge ~5%.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { CaribbeanStudBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'
import { newDeck, rankVal } from './deck.js'
import { eval5, compare5 } from './handEval.js'

const GAME = 'caribbeanStud'

// raise bet return multipliers by 5-card category
const RAISE_PAYOUT = { 0: 2, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 8, 7: 21, 8: 51, 9: 251 }

const HAND_NAMES = {
  0: 'High Card', 1: 'Pair', 2: 'Two Pair', 3: 'Three of a Kind', 4: 'Straight',
  5: 'Flush', 6: 'Full House', 7: 'Four of a Kind', 8: 'Straight Flush', 9: 'Royal Flush',
}
const handName = (cat) => HAND_NAMES[cat]

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    ante: toRupees(b.ante),
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
    CaribbeanStudBet.findOne({ user: userId, status: 'active' }).lean(),
    CaribbeanStudBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      raisePayout: RAISE_PAYOUT,
      qualifyRule: 'Dealer needs King-high or better to qualify',
    },
    active: active ? serialize(active) : null,
    history: recent.map(serialize),
  }
}

async function activeRound(userId) {
  const bet = await CaribbeanStudBet.findOne({ user: userId, status: 'active' }).lean()
  if (!bet) throw new HttpError(404, 'No round in progress')
  return bet
}

const sameRound = (bet) => ({ _id: bet._id, status: 'active' })
const raced = () => new HttpError(409, 'That move was already made')

export const caribbeanStudRouter = Router()
caribbeanStudRouter.use(requireAuth)

caribbeanStudRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

caribbeanStudRouter.post('/deal', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Caribbean Stud is paused. Please try again later.')

  const ante = toPaise(req.body?.ante)
  if (!Number.isInteger(ante) || ante < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (ante > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const deck = newDeck()
  const playerCards = [deck[0], deck[1], deck[2], deck[3], deck[4]]
  const dealerCards = [deck[5], deck[6], deck[7], deck[8], deck[9]]
  const pv = eval5(playerCards)
  const dv = eval5(dealerCards)

  await tx(async (session) => {
    if (await CaribbeanStudBet.exists({ user: req.userId, status: 'active' }).session(session)) {
      throw new HttpError(409, 'Finish your current round first')
    }
    await debit(session, req.userId, ante, { type: 'bet', game: GAME })
    await CaribbeanStudBet.create([{
      user: req.userId,
      amount: ante,
      ante,
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

caribbeanStudRouter.post('/play', async (req, res) => {
  const bet = await activeRound(req.userId)

  const playBet = bet.ante * 2 // standard raise
  const pv = eval5(bet.playerCards)
  const dv = eval5(bet.dealerCards)
  // dealer qualifies with King-high or better (any pair, or high card K+)
  const qualified = dv.cat >= 1 || Math.max(...bet.dealerCards.map(rankVal)) >= 13
  const cmp = compare5(pv, dv)

  let win = 0
  let result
  if (!qualified) {
    // ante 1:1, raise pushes
    win = bet.ante * 2 + playBet
    result = 'dealerNoQualify'
  } else if (cmp > 0) {
    const raiseWin = playBet * RAISE_PAYOUT[pv.cat]
    win = bet.ante * 2 + raiseWin
    result = 'playerWins'
  } else if (cmp < 0) {
    result = 'dealerWins'
  } else {
    win = bet.ante + playBet // push everything
    result = 'push'
  }
  win = Math.min(win, Math.round(getSettings(GAME).maxWin * 100))

  await tx(async (session) => {
    await debit(session, bet.user, playBet, { type: 'bet', game: GAME })
    const upd = await CaribbeanStudBet.findOneAndUpdate(
      sameRound(bet),
      {
        amount: bet.amount + playBet,
        dealerQualified: qualified,
        status: win > bet.amount + playBet ? 'won' : ('lost'),
        win,
        multiplier: win / (bet.amount + playBet),
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

caribbeanStudRouter.post('/fold', async (req, res) => {
  const bet = await activeRound(req.userId)

  await tx(async (session) => {
    const upd = await CaribbeanStudBet.findOneAndUpdate(
      sameRound(bet),
      { status: 'lost', win: 0, multiplier: 0, result: 'folded', finished: true },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
  })

  res.json(await snapshotFor(req.userId))
})

export async function startCaribbeanStud() {
  const orphans = await CaribbeanStudBet.find({ status: 'active' }).lean()
  for (const b of orphans) {
    await tx(async (session) => {
      const upd = await CaribbeanStudBet.updateOne({ _id: b._id, status: 'active' }, { status: 'refunded', finished: true, settledAt: new Date() }, { session })
      if (upd.modifiedCount) await credit(session, b.user, b.amount, { type: 'refund', game: GAME, ref: b._id })
    })
  }
  if (orphans.length) console.log(`Caribbean Stud: refunded ${orphans.length} unfinished round(s)`)
  console.log('Caribbean Stud ready')
}
