// ─────────────────────────────────────────────────────────────
// Roulette (single zero) — 37 pockets, 0–36. Multiple spots per
// spin: straight number (36x), red/black/odd/even/low/high (2x),
// dozen/column (3x). Win = sum of every winning spot's stake ×
// return. Instant resolve. House edge ≈2.7% on every bet.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { RouletteBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'roulette'

const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

// outside bet names and their covered conditions; all outside bets
// lose on zero. `return` multipliers include the stake.
const OUTSIDE = {
  red: { return: 2, hit: (n) => RED.includes(n) },
  black: { return: 2, hit: (n) => n !== 0 && !RED.includes(n) },
  odd: { return: 2, hit: (n) => n !== 0 && n % 2 === 1 },
  even: { return: 2, hit: (n) => n !== 0 && n % 2 === 0 },
  low: { return: 2, hit: (n) => n >= 1 && n <= 18 },
  high: { return: 2, hit: (n) => n >= 19 && n <= 36 },
  dozen1: { return: 3, hit: (n) => n >= 1 && n <= 12 },
  dozen2: { return: 3, hit: (n) => n >= 13 && n <= 24 },
  dozen3: { return: 3, hit: (n) => n >= 25 && n <= 36 },
  col1: { return: 3, hit: (n) => n !== 0 && n % 3 === 1 },
  col2: { return: 3, hit: (n) => n !== 0 && n % 3 === 2 },
  col3: { return: 3, hit: (n) => n !== 0 && n % 3 === 0 },
}

function spotWins(spot, n) {
  if (spot.type === 'number') return n === spot.pick && spot.pick >= 0 && spot.pick <= 36
  const o = OUTSIDE[spot.type]
  return o ? o.hit(n) : false
}

function spotReturn(spot) {
  return spot.type === 'number' ? 36 : OUTSIDE[spot.type]?.return ?? 0
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    bets: b.bets,
    pocket: b.pocket,
    color: pocketColor(b.pocket),
    seed: b.seed,
    status: b.status,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

function pocketColor(n) {
  if (n === 0) return 'green'
  return RED.includes(n) ? 'red' : 'black'
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    RouletteBet.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      pockets: 37,
      straightPayout: 36,
      outsidePayout: 2,
      dozenPayout: 3,
      red: RED,
    },
    history: recent.map(serialize),
  }
}

export const rouletteRouter = Router()
rouletteRouter.use(requireAuth)

rouletteRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

rouletteRouter.post('/spin', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Roulette is paused. Please try again later.')

  const betsInput = Array.isArray(req.body?.bets) ? req.body.bets : []
  const bets = []
  let total = 0

  for (const b of betsInput.slice(0, 40)) {
    const type = String(b?.type ?? '')
    const stake = toPaise(b?.stake)
    const pick = type === 'number' ? Math.round(Number(b?.pick)) : null
    if (type !== 'number' && !OUTSIDE[type]) throw new HttpError(400, `Unknown bet type: ${type}`)
    if (type === 'number' && (pick === null || pick < 0 || pick > 36)) throw new HttpError(400, 'Pick a number from 0 to 36')
    if (!Number.isInteger(stake) || stake <= 0) throw new HttpError(400, 'Each spot needs a positive stake')
    bets.push({ type, pick, stake })
    total += stake
  }

  if (!bets.length) throw new HttpError(400, 'Place at least one bet on the table')
  if (total < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (total > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const pocket = crypto.randomInt(0, 37)

  let win = 0
  for (const spot of bets) {
    if (spotWins(spot, pocket)) {
      win += Math.floor(spot.stake * spotReturn(spot))
    }
  }
  win = Math.min(win, Math.round(cfg.maxWin * 100))

  await tx(async (session) => {
    await debit(session, req.userId, total, { type: 'bet', game: GAME })
    await RouletteBet.create([{
      user: req.userId,
      amount: total,
      bets,
      pocket,
      seed,
      status: win > total ? 'won' : (win > 0 ? 'partial' : 'lost'),
      multiplier: win > 0 ? win / total : 0,
      win,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startRoulette() {
  console.log('Roulette ready')
}
