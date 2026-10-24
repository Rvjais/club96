// ─────────────────────────────────────────────────────────────
// Keno / Lucky Numbers — Pick 1–10 numbers from 1–80, 20 drawn.
// Configurable draw speed (like Wingo rooms). Payout by matches.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { KenoBet, KenoResult } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings, onSettingsChange } from '../settings.js'

const GAME = 'keno'
const NUMBERS = 80
const DRAWN = 20
const PICK_MIN = 1
const PICK_MAX = 10

// Standard Keno paytable (can be overridden in settings)
// Rows: picks (1-10), Columns: matches (0 to picks)
const DEFAULT_PAYTABLE = {
  1: [0, 3],                    // Pick 1: match 1 pays 3x
  2: [0, 0, 12],                // Pick 2: match 2 pays 12x
  3: [0, 0, 2, 45],             // Pick 3: match 2 pays 2x, match 3 pays 45x
  4: [0, 0, 1, 5, 90],          // Pick 4: match 2=1x, 3=5x, 4=90x
  5: [0, 0, 0, 3, 12, 720],     // Pick 5: match 3=3x, 4=12x, 5=720x
  6: [0, 0, 0, 2, 6, 60, 1500], // Pick 6: match 3=2x, 4=6x, 5=60x, 6=1500x
  7: [0, 0, 0, 1, 3, 18, 150, 4000],
  8: [0, 0, 0, 0, 2, 10, 50, 720, 10000],
  9: [0, 0, 0, 0, 1, 5, 20, 150, 3000, 25000],
  10: [0, 0, 0, 0, 0, 3, 10, 50, 300, 2000, 50000],
}

// Room configs: key -> { label, intervalMs }
const ROOMS = {
  '30s': { label: '30 Seconds', intervalMs: 30000 },
  '1m': { label: '1 Minute', intervalMs: 60000 },
  '3m': { label: '3 Minutes', intervalMs: 180000 },
  '5m': { label: '5 Minutes', intervalMs: 300000 },
}

function periodKey(room, now) {
  const { intervalMs } = ROOMS[room]
  const period = Math.floor(now / intervalMs)
  return `${room}:${period}`
}

function periodStart(room, period) {
  return period * ROOMS[room].intervalMs
}

function periodEnd(room, period) {
  return (period + 1) * ROOMS[room].intervalMs
}

function drawNumbers(seed) {
  // Deterministic shuffle from seed, pick first 20
  const rng = seedRNG(seed)
  const pool = Array.from({ length: NUMBERS }, (_, i) => i + 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, DRAWN).sort((a, b) => a - b)
}

function seedRNG(seed) {
  let h = 0x12345678
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x5bd1e995)
    h ^= h >>> 13
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
    h ^= h >>> 13
    h = Math.imul(h, 0x5bd1e995)
    return (h >>> 0) / 0x100000000
  }
}

function countMatches(picks, drawn) {
  const drawnSet = new Set(drawn)
  return picks.filter(n => drawnSet.has(n)).length
}

function getPaytable(cfg) {
  const custom = cfg.customPaytable ?? {}
  const merged = {}
  for (let p = PICK_MIN; p <= PICK_MAX; p++) {
    merged[p] = custom[p] ?? DEFAULT_PAYTABLE[p]
  }
  return merged
}

function serializeBet(b, cfg) {
  const settled = b.status !== 'pending'
  return {
    id: String(b._id),
    room: b.room,
    period: b.period,
    picks: b.picks,
    amount: toRupees(b.amount),
    fee: b.fee,
    status: b.status,
    result: settled ? b.drawn : null,
    matches: settled ? b.matches : null,
    multiplier: settled ? b.multiplier : null,
    win: settled ? toRupees(b.win) : null,
    time: b.settledAt ?? b.createdAt,
  }
}

async function snapshotFor(userId) {
  const cfg = getSettings(GAME)
  const [balance, pending, settled] = await Promise.all([
    balanceOf(userId),
    KenoBet.find({ user: userId, status: 'pending' }).sort({ createdAt: 1 }).lean(),
    KenoBet.find({ user: userId, status: { $ne: 'pending' } }).sort({ settledAt: -1 }).limit(30).lean(),
  ])

  // Load results for settled bets
  const periodKeys = [...new Set(settled.map(b => `${b.room}:${b.period}`))]
  const results = await KenoResult.find({ _id: { $in: periodKeys } }).lean()
  const drawnByKey = new Map(results.map(r => [r._id, r.numbers]))

  const rooms = Object.entries(ROOMS).map(([key, { label, intervalMs }]) => ({
    key,
    label,
    intervalMs,
    enabled: cfg.rooms?.[key] !== false,
    lockSeconds: cfg.lockSeconds,
  }))

  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      rooms,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      pickMin: PICK_MIN,
      pickMax: PICK_MAX,
      numbers: NUMBERS,
      drawn: DRAWN,
      paytable: getPaytable(cfg),
    },
    pending: pending.map(b => serializeBet(b, cfg)),
    settled: settled.map(b => ({
      ...serializeBet(b, cfg),
      drawn: drawnByKey.get(`${b.room}:${b.period}`) ?? null,
    })),
    serverNow: Date.now(),
  }
}

async function settlePeriod(room, period, now) {
  const key = `${room}:${period}`
  const existing = await KenoResult.findById(key).lean()
  if (existing) return // already settled

  const seed = crypto.randomBytes(32).toString('hex')
  const numbers = drawNumbers(seed)
  await KenoResult.create([{ _id: key, room, period, numbers, seed }])

  const bets = await KenoBet.find({ room, period, status: 'pending' }).lean()
  const paytable = getPaytable(getSettings(GAME))

  for (const bet of bets) {
    const matches = countMatches(bet.picks, numbers)
    const multiplier = paytable[bet.picks.length]?.[matches] ?? 0
    const win = multiplier > 0 ? Math.min(Math.floor(bet.amount * multiplier), Math.round(bet.maxWin * 100)) : 0

    await tx(async (session) => {
      const upd = await KenoBet.findOneAndUpdate(
        { _id: bet._id, status: 'pending' },
        { status: win > 0 ? 'won' : 'lost', drawn: numbers, matches, multiplier, win, settledAt: new Date(now) },
        { session },
      )
      if (upd && win > 0) {
        await credit(session, bet.user, win, { type: 'win', game: GAME, ref: bet._id })
      }
    })
  }
}

// Background ticker
let ticking = false
async function tick() {
  if (ticking) return
  ticking = true
  try {
    const now = Date.now()
    const cfg = getSettings(GAME)
    if (!cfg.enabled) return

    for (const room of Object.keys(ROOMS)) {
      if (!cfg.rooms?.[room]) continue
      const { intervalMs } = ROOMS[room]
      const currentPeriod = Math.floor(now / intervalMs)
      // Settle the previous period (which just ended)
      const settlePeriodNum = currentPeriod - 1
      const periodEndMs = periodEnd(room, settlePeriodNum)
      if (now >= periodEndMs) {
        await settlePeriod(room, settlePeriodNum, now)
      }
    }
  } finally {
    ticking = false
  }
}

export const kenoRouter = Router()
kenoRouter.use(requireAuth)

kenoRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

kenoRouter.post('/bet', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Keno is paused. Please try again later.')

  const room = String(req.body?.room)
  if (!ROOMS[room] || cfg.rooms?.[room] === false) throw new HttpError(400, 'Invalid or closed room')

  const picks = Array.from(new Set((req.body?.picks ?? []).map((n) => Number(n))))
  if (picks.length < PICK_MIN || picks.length > PICK_MAX) {
    throw new HttpError(400, `Pick ${PICK_MIN}–${PICK_MAX} numbers`)
  }
  if (picks.some(n => !Number.isInteger(n) || n < 1 || n > NUMBERS)) {
    throw new HttpError(400, `Numbers must be 1–${NUMBERS}`)
  }

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const now = Date.now()
  const { intervalMs } = ROOMS[room]
  const currentPeriod = Math.floor(now / intervalMs)
  const lockMs = (cfg.lockSeconds ?? 5) * 1000
  const periodEndMs = (currentPeriod + 1) * intervalMs

  if (now >= periodEndMs - lockMs) {
    throw new HttpError(409, 'Betting closed for this draw. Wait for the next round.')
  }

  const feePct = cfg.fee ?? 2
  const stakeAfterFee = Math.floor(paise * (100 - feePct) / 100)

  const paytable = getPaytable(cfg)
  const maxMultiplier = Math.max(...paytable[picks.length])
  const maxWin = cfg.maxWin

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await KenoBet.create([{
      user: req.userId,
      room,
      period: currentPeriod,
      picks,
      amount: stakeAfterFee,
      fee: feePct,
      maxWin,
      status: 'pending',
    }], { session })
  })

  res.json(await snapshotFor(req.userId))
})

// Called on server start
export async function startKeno() {
  // Refund any pending bets from previous run (should be rare)
  const orphans = await KenoBet.find({ status: 'pending' }).lean()
  for (const b of orphans) {
    await tx(async (session) => {
      const upd = await KenoBet.updateOne({ _id: b._id, status: 'pending' }, { status: 'refunded', settledAt: new Date() }, { session })
      if (upd.modifiedCount) await credit(session, b.user, b.amount, { type: 'refund', game: GAME, ref: b._id })
    })
  }
  if (orphans.length) console.log(`Keno: refunded ${orphans.length} unfinished bet(s)`)

  // React to settings changes
  onSettingsChange(GAME, () => tick())

  // Tick every 2 seconds
  setInterval(tick, 2000)
  console.log('Keno ready')
}