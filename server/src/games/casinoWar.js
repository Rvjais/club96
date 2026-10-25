// ─────────────────────────────────────────────────────────────
// Casino War — player card vs dealer card, higher wins (1:1).
// On a tie the player goes to WAR (stake doubled, win pays on the
// ante, war stake pushes) or surrenders half the stake.
// House edge ~2.9%.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { CasinoWarBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'
import { newDeck, rankVal } from './deck.js'

const GAME = 'casinoWar'

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    staked: toRupees(b.staked),
    playerCard: b.playerCard,
    dealerCard: b.dealerCard,
    warPlayerCard: b.warPlayerCard,
    warDealerCard: b.warDealerCard,
    status: b.status,
    result: b.result, // playerWins | dealerWins | warWin | warLoss | surrender
    multiplier: b.multiplier,
    win: toRupees(b.win),
    finished: b.finished,
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, active, recent] = await Promise.all([
    balanceOf(userId),
    CasinoWarBet.findOne({ user: userId, status: 'active' }).lean(),
    CasinoWarBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      warPayout: 1,
    },
    active: active ? serialize(active) : null,
    history: recent.map(serialize),
  }
}

async function activeRound(userId) {
  const bet = await CasinoWarBet.findOne({ user: userId, status: 'active' }).lean()
  if (!bet) throw new HttpError(404, 'No war in progress')
  return bet
}

const sameRound = (bet) => ({ _id: bet._id, status: 'active' })
const raced = () => new HttpError(409, 'That move was already made')

export const casinoWarRouter = Router()
casinoWarRouter.use(requireAuth)

casinoWarRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

casinoWarRouter.post('/bet', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Casino War is paused. Please try again later.')

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

  let status = 'active'
  let win = 0
  let result = null
  let multiplier = 0

  if (rankVal(playerCard) > rankVal(dealerCard)) {
    status = 'won'
    result = 'playerWins'
    win = Math.min(paise * 2, Math.round(cfg.maxWin * 100))
    multiplier = 2
  } else if (rankVal(playerCard) < rankVal(dealerCard)) {
    status = 'lost'
    result = 'dealerWins'
  }

  await tx(async (session) => {
    if (await CasinoWarBet.exists({ user: req.userId, status: 'active' }).session(session)) {
      throw new HttpError(409, 'Finish your current war first')
    }
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await CasinoWarBet.create([{
      user: req.userId,
      amount: paise,
      staked: paise,
      playerCard,
      dealerCard,
      seed,
      status,
      win,
      result,
      multiplier,
      finished: status !== 'active',
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

casinoWarRouter.post('/war', async (req, res) => {
  const cfg = getSettings(GAME)
  const bet = await activeRound(req.userId)

  const nr = newDeck()
  const warPlayerCard = nr[0]
  const warDealerCard = nr[1]
  const won = rankVal(warPlayerCard) >= rankVal(warDealerCard)

  // win: ante pays 1:1, war stake pushes; lose: everything is lost
  const win = won ? Math.min(bet.amount * 3, Math.round(cfg.maxWin * 100)) : 0

  await tx(async (session) => {
    await debit(session, req.userId, bet.amount, { type: 'bet', game: GAME })
    const upd = await CasinoWarBet.findOneAndUpdate(
      sameRound(bet),
      {
        staked: bet.amount * 2,
        warPlayerCard,
        warDealerCard,
        status: won ? 'won' : 'lost',
        result: won ? 'warWin' : 'warLoss',
        win,
        multiplier: won ? 1.5 : 0, // net win ÷ original stake
        finished: true,
      },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
    if (win > 0) await credit(session, bet.user, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

casinoWarRouter.post('/surrender', async (req, res) => {
  const bet = await activeRound(req.userId)

  // half of the ante comes back
  const half = Math.floor(bet.amount / 2)

  await tx(async (session) => {
    const upd = await CasinoWarBet.findOneAndUpdate(
      sameRound(bet),
      {
        status: 'lost',
        result: 'surrender',
        win: half,
        multiplier: half > 0 ? half / bet.amount : 0,
        finished: true,
      },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
    if (half > 0) await credit(session, bet.user, half, { type: 'refund', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startCasinoWar() {
  const orphans = await CasinoWarBet.find({ status: 'active' }).lean()
  for (const b of orphans) {
    await tx(async (session) => {
      const upd = await CasinoWarBet.updateOne({ _id: b._id, status: 'active' }, { status: 'refunded', finished: true, settledAt: new Date() }, { session })
      if (upd.modifiedCount) await credit(session, b.user, b.amount, { type: 'refund', game: GAME, ref: b._id })
    })
  }
  if (orphans.length) console.log(`Casino War: refunded ${orphans.length} unfinished round(s)`)
  console.log('Casino War ready')
}
