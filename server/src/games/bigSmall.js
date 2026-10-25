// ─────────────────────────────────────────────────────────────
// Big / Small — Sic Bo lite: three dice are rolled, one spot bet:
// small (4–10) · big (11–17) · odd · even · any triple · specific
// triple · doubles · exact total. Triples lose small/big. One
// throw per bet, instant resolve.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { BigSmallBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'bigSmall'

// return multipliers (incl. stake)
const RETURNS = {
  small: 1.95, big: 1.95, // triples lose both
  odd: 1.9, even: 1.9,
  anyTriple: 31,          // 30:1
  double: 11,             // 10:1 (specific double, exactly two of a kind)
  triple: 181,            // 180:1 (specific triple)
}
// exact totals 4…17 → return multiplier by number of ways on 216
const TOTAL_WAYS = { 4: 3, 5: 6, 6: 10, 7: 15, 8: 21, 9: 25, 10: 27, 11: 27, 12: 25, 13: 21, 14: 15, 15: 10, 16: 6, 17: 3 }
const TOTAL_RETURNS = { 3: 61, 6: 31, 10: 18, 15: 13, 21: 9, 25: 7, 27: 7 }
const totalReturn = (n) => TOTAL_RETURNS[TOTAL_WAYS[n]]

const BET_TYPES = ['small', 'big', 'odd', 'even', 'anyTriple', 'double', 'triple', 'total']

function settleRoll(betType, pick, dice) {
  const isTriple = dice[0] === dice[1] && dice[1] === dice[2]
  const sum = dice[0] + dice[1] + dice[2]

  switch (betType) {
    case 'small': return !isTriple && sum <= 10
    case 'big': return !isTriple && sum >= 11
    case 'odd': return sum % 2 === 1
    case 'even': return sum % 2 === 0
    case 'anyTriple': return isTriple
    case 'triple': return isTriple && dice[0] === pick
    case 'double': {
      if (isTriple) return false // exactly two, not three
      const counts = {}
      for (const d of dice) counts[d] = (counts[d] ?? 0) + 1
      return (counts[pick] ?? 0) === 2
    }
    case 'total': return sum === pick
    default: return false
  }
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    betType: b.betType,
    pick: b.pick,
    dice: b.dice,
    total: b.total,
    seed: b.seed,
    status: b.status,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    BigSmallBet.find({ user: userId }).sort({ createdAt: -1 }).limit(30).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      returns: { ...RETURNS, total: TOTAL_RETURNS, double: 11 },
      totalWays: TOTAL_WAYS,
    },
    history: recent.map(serialize),
  }
}

export const bigSmallRouter = Router()
bigSmallRouter.use(requireAuth)

bigSmallRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

bigSmallRouter.post('/roll', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Big / Small is paused. Please try again later.')

  const betType = String(req.body?.betType ?? '')
  if (!BET_TYPES.includes(betType)) throw new HttpError(400, 'Unknown bet type')

  let pick = null
  if (betType === 'total') {
    pick = Math.round(Number(req.body?.pick))
    if (!TOTAL_WAYS[pick]) throw new HttpError(400, 'Pick a total between 4 and 17')
  } else if (betType === 'double' || betType === 'triple') {
    pick = Math.round(Number(req.body?.pick))
    if (!Number.isInteger(pick) || pick < 1 || pick > 6) throw new HttpError(400, 'Pick a number from 1 to 6')
  }

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const dice = [crypto.randomInt(1, 7), crypto.randomInt(1, 7), crypto.randomInt(1, 7)]

  const won = settleRoll(betType, pick, dice)
  let multiplier = 0
  if (won) {
    multiplier = betType === 'total' ? totalReturn(pick) : RETURNS[betType]
  }
  const win = won ? Math.min(Math.floor(paise * multiplier), Math.round(cfg.maxWin * 100)) : 0

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await BigSmallBet.create([{
      user: req.userId,
      amount: paise,
      betType,
      pick,
      dice,
      total: dice[0] + dice[1] + dice[2],
      seed,
      status: won ? 'won' : 'lost',
      multiplier,
      win,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startBigSmall() {
  console.log('Big / Small ready')
}
