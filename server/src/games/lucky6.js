// ─────────────────────────────────────────────────────────────
// Lucky 6/49 — pick 6 numbers from 1–49; 6 main balls + 1 bonus
// ball are drawn. Payouts (multipliers):
//   2 + bonus 4x · 3 = 8x · 4 = 100x · 5 = 1500x
//   5 + bonus 3000x · 6 = 50000x
// Instant resolve. Lottery style — steep edge on small matches.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { Lucky6Bet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'lucky6'
const POOL = 49
const PICKS = 6

const PAYOUT = {
  '2+bonus': 4,
  3: 8,
  4: 100,
  5: 1500,
  '5+bonus': 3000,
  6: 50000,
}

function drawBalls() {
  const balls = []
  while (balls.length < 7) {
    const n = crypto.randomInt(1, POOL + 1)
    if (!balls.includes(n)) balls.push(n)
  }
  return balls // [6 main, bonus]
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    picks: b.picks,
    drawn: b.drawn, // last ball is the bonus
    main: b.drawn.slice(0, 6),
    bonus: b.drawn[6],
    matches: b.matches,
    bonusHit: b.bonusHit,
    prizeKey: b.prizeKey,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    seed: b.seed,
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    Lucky6Bet.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      pool: POOL,
      picks: PICKS,
      payouts: PAYOUT,
    },
    history: recent.map(serialize),
  }
}

export const lucky6Router = Router()
lucky6Router.use(requireAuth)

lucky6Router.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

lucky6Router.post('/bet', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Lucky 6/49 is paused. Please try again later.')

  const picks = Array.isArray(req.body?.picks) ? req.body.picks.map(Number) : []
  if (picks.length !== PICKS || new Set(picks).size !== PICKS ||
      picks.some(n => !Number.isInteger(n) || n < 1 || n > POOL)) {
    throw new HttpError(400, `Pick ${PICKS} different numbers between 1 and ${POOL}`)
  }

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const drawn = drawBalls()
  const main = drawn.slice(0, 6)
  const bonus = drawn[6]
  const matches = picks.filter(n => main.includes(n)).length
  const bonusHit = picks.includes(bonus)

  let prizeKey = null
  let multiplier = 0
  if (matches === 6) {
    prizeKey = '6'
    multiplier = PAYOUT[6]
  } else if (matches === 5) {
    prizeKey = bonusHit ? '5+bonus' : '5'
    multiplier = bonusHit ? PAYOUT['5+bonus'] : PAYOUT[5]
  } else if (matches === 4) {
    prizeKey = '4'
    multiplier = PAYOUT[4]
  } else if (matches === 3) {
    prizeKey = '3'
    multiplier = PAYOUT[3]
  } else if (matches === 2 && bonusHit) {
    prizeKey = '2+bonus'
    multiplier = PAYOUT['2+bonus']
  }

  const win = multiplier > 0 ? Math.min(Math.floor(paise * multiplier), Math.round(cfg.maxWin * 100)) : 0

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await Lucky6Bet.create([{
      user: req.userId,
      amount: paise,
      picks,
      drawn,
      matches,
      bonusHit,
      prizeKey,
      multiplier,
      win,
      seed,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startLucky6() {
  console.log('Lucky 6/49 ready')
}
