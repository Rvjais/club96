// ─────────────────────────────────────────────────────────────
// Balloon Pop — pick a balloon, one weighted outcome per pick:
// pop (lose) or a prize multiplier. Instant resolve.
// House edge ~13.5% (weighted outcome wheel).
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { BalloonPopBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'balloonPop'
const BALLOON_COUNT = 9 // cosmetic pick positions

// outcome table: kind pop | prize; `mult` = total return on a win
const OUTCOMES = [
  { kind: 'pop', symbol: '💥', mult: 0, weight: 50 },
  { kind: 'prize', symbol: '🎈', mult: 1.2, weight: 20 },
  { kind: 'prize', symbol: '🎉', mult: 1.5, weight: 15 },
  { kind: 'prize', symbol: '💰', mult: 2, weight: 10 },
  { kind: 'prize', symbol: '🎁', mult: 3, weight: 3 },
  { kind: 'prize', symbol: '💎', mult: 5, weight: 1.8 },
  { kind: 'prize', symbol: '👑', mult: 10, weight: 0.2 },
]

const OUTCOME_KEYS = Object.keys(OUTCOMES)
const TOTAL_WEIGHT = OUTCOMES.reduce((t, o) => t + o.weight, 0)

function rollOutcome() {
  const r = crypto.randomInt(0, Math.round(TOTAL_WEIGHT * 100))
  let acc = 0
  for (const o of OUTCOMES) {
    acc += o.weight * 100
    if (r < acc) return o
  }
  return OUTCOMES[0]
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    pick: b.pick,
    symbol: b.symbol,
    outcome: b.outcome,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    seed: b.seed,
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    BalloonPopBet.find({ user: userId }).sort({ createdAt: -1 }).limit(30).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      count: BALLOON_COUNT,
      outcomes: OUTCOMES.map(o => ({ kind: o.kind, symbol: o.symbol, mult: o.mult, weight: o.weight })),
    },
    history: recent.map(serialize),
  }
}

export const balloonPopRouter = Router()
balloonPopRouter.use(requireAuth)

balloonPopRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

balloonPopRouter.post('/pick', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Balloon Pop is paused. Please try again later.')

  const pick = Math.round(Number(req.body?.pick ?? 0))
  if (!Number.isInteger(pick) || pick < 0 || pick >= BALLOON_COUNT) {
    throw new HttpError(400, 'Pick a balloon first')
  }

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const outcome = rollOutcome()
  const won = outcome.kind === 'prize'
  const multiplier = won ? outcome.mult : 0
  const win = won ? Math.min(Math.floor(paise * outcome.mult), Math.round(cfg.maxWin * 100)) : 0

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await BalloonPopBet.create([{
      user: req.userId,
      amount: paise,
      pick,
      symbol: outcome.symbol,
      outcome: outcome.kind,
      multiplier,
      win,
      seed,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startBalloonPop() {
  console.log('Balloon Pop ready')
}
