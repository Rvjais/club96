// ─────────────────────────────────────────────────────────────
// Win Go — number & colour lottery in four rooms (30s, 1m, 3m, 5m).
// Each room's periods come from the clock: period = floor(now / length).
// Betting closes `lockSeconds` before the draw; when a period ends the
// server draws a digit 0–9 (weighted by the admin's chances) and
// settles every bet on it at once.
//
//   Big 5–9 / Small 0–4 ........................ payouts.size
//   Green 1·3·7·9, Red 2·4·6·8 ................. payouts.color
//   Green on 5, Red on 0 (also Violet) ........ payouts.colorSplit
//   Violet 0·5 ................................. payouts.violet
//   Exact number ............................... payouts.number
// A service fee (%) is taken from each stake; payouts apply to the rest.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { createChannel } from '../sse.js'
import { WingoBet, WingoResult } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { WINGO_ROOMS, getSettings, onSettingsChange } from '../settings.js'

const GAME = 'wingo'
export const ROOMS = {
  '30s': { ms: 30_000, code: 1, label: 'Win Go 30s' },
  '1m': { ms: 60_000, code: 2, label: 'Win Go 1Min' },
  '3m': { ms: 180_000, code: 3, label: 'Win Go 3Min' },
  '5m': { ms: 300_000, code: 4, label: 'Win Go 5Min' },
}
const PICKS = ['green', 'red', 'violet', 'big', 'small', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

// ── Rules ────────────────────────────────────────────────────
export function colorsOf(n) {
  if (n === 0) return ['red', 'violet']
  if (n === 5) return ['green', 'violet']
  return n % 2 ? ['green'] : ['red']
}
export const sizeOf = (n) => (n >= 5 ? 'big' : 'small')

/** Multiplier a pick earns when `n` is drawn (0 = lost). */
export function payoutFor(pick, n, payouts) {
  if (pick === 'big' || pick === 'small') return sizeOf(n) === pick ? payouts.size : 0
  if (pick === 'violet') return n === 0 || n === 5 ? payouts.violet : 0
  if (pick === 'green' || pick === 'red') {
    if (!colorsOf(n).includes(pick)) return 0
    return n === 0 || n === 5 ? payouts.colorSplit : payouts.color
  }
  return Number(pick) === n ? payouts.number : 0
}

/** Weighted draw; weights are percentages for 0–9 that add up to 100. */
function drawNumber(weights) {
  const r = (crypto.randomInt(0, 1_000_000) / 1_000_000) * 100
  let acc = 0
  for (let n = 0; n < 10; n++) {
    acc += weights[n]
    if (r < acc) return n
  }
  return weights.findLastIndex((w) => w > 0)
}

const periodIndex = (room, now) => Math.floor(now / ROOMS[room].ms)

/** 20260930 + room code + sequence within the day, e.g. 2026093010421 */
export function periodLabel(room, idx) {
  const { ms, code } = ROOMS[room]
  const start = new Date(idx * ms)
  const y = start.getFullYear()
  const m = String(start.getMonth() + 1).padStart(2, '0')
  const d = String(start.getDate()).padStart(2, '0')
  const midnight = new Date(y, start.getMonth(), start.getDate()).getTime()
  const seq = Math.floor((idx * ms - midnight) / ms) + 1
  return `${y}${m}${d}${code}${String(seq).padStart(4, '0')}`
}

export function describeWingo(b) {
  const pick = /^\d$/.test(b.pick) ? `number ${b.pick}` : b.pick
  if (b.status === 'pending') return `${ROOMS[b.room].label} · ${pick} · waiting for draw`
  return `${ROOMS[b.room].label} · ${pick} · drew ${b.result} (${colorsOf(b.result).join('+')}, ${sizeOf(b.result)})`
}

// Chances are locked in when a period starts, so a settings change never alters a running period
const periodOdds = new Map() // "room:idx" → weights
const oddsFor = (room, idx) => periodOdds.get(`${room}:${idx}`) ?? getSettings(GAME).weights

// ── Draw & settle ────────────────────────────────────────────
async function resolvePeriod(room, idx) {
  const key = `${room}:${idx}`
  let result = await WingoResult.findById(key).lean()
  if (!result) {
    try {
      result = (await WingoResult.create({ _id: key, room, period: idx, number: drawNumber(oddsFor(room, idx)) })).toObject()
    } catch (err) {
      if (err?.code !== 11000) throw err
      result = await WingoResult.findById(key).lean()
    }
  }
  const n = result.number
  const pending = await WingoBet.find({ room, period: idx, status: 'pending' }).lean()
  for (const bet of pending) {
    const multiplier = payoutFor(bet.pick, n, bet.payouts)
    const contract = bet.amount * (1 - (bet.fee ?? 0) / 100)
    const win = multiplier ? Math.min(Math.floor(contract * multiplier + 1e-6), Math.round((bet.maxWin ?? Infinity) * 100)) : 0
    await tx(async (session) => {
      const upd = await WingoBet.updateOne(
        { _id: bet._id, status: 'pending' },
        { status: win > 0 ? 'won' : 'lost', result: n, multiplier, win },
        { session },
      )
      if (upd.modifiedCount && win) await credit(session, bet.user, win, { type: 'win', game: GAME, ref: bet._id })
    })
  }
  periodOdds.delete(key)
}

const lastIdx = {}
let ticking = false
async function tick() {
  if (ticking) return
  const now = Date.now()
  const due = WINGO_ROOMS.filter((r) => periodIndex(r, now) !== lastIdx[r])
  if (!due.length) return
  ticking = true
  try {
    for (const room of due) {
      const cur = periodIndex(room, now)
      periodOdds.set(`${room}:${cur}`, [...getSettings(GAME).weights])
      for (let idx = lastIdx[room]; idx < cur; idx++) await resolvePeriod(room, idx)
      lastIdx[room] = cur
    }
    channel.broadcast()
  } catch (err) {
    console.error('Win Go tick failed:', err)
  } finally {
    ticking = false
  }
}

// ── Snapshots ────────────────────────────────────────────────
function serializeBet(b) {
  return {
    id: String(b._id),
    room: b.room,
    period: periodLabel(b.room, b.period),
    pick: b.pick,
    amount: toRupees(b.amount),
    fee: b.fee ?? 0,
    status: b.status,
    result: b.result ?? null,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const now = Date.now()
  const cfg = getSettings(GAME)
  const [balance, records, ...perRoom] = await Promise.all([
    balanceOf(userId),
    WingoBet.find({ user: userId, status: { $ne: 'pending' } }).sort({ createdAt: -1 }).limit(40).lean(),
    ...WINGO_ROOMS.map(async (room) => {
      const cur = periodIndex(room, now)
      const [history, bets, prevBets] = await Promise.all([
        WingoResult.find({ room }).sort({ period: -1 }).limit(30).lean(),
        WingoBet.find({ user: userId, room, period: cur }).sort({ createdAt: 1 }).lean(),
        WingoBet.find({ user: userId, room, period: cur - 1 }).lean(),
      ])
      const prev = history[0]?.period === cur - 1 ? history[0] : null
      return [room, {
        label: ROOMS[room].label,
        ms: ROOMS[room].ms,
        open: cfg.rooms[room],
        chances: oddsFor(room, cur),
        period: { id: cur, label: periodLabel(room, cur), endsAt: (cur + 1) * ROOMS[room].ms },
        history: history.map((r) => ({ period: periodLabel(room, r.period), number: r.number })),
        bets: bets.map(serializeBet),
        lastResult: prev
          ? {
              id: prev.period,
              period: periodLabel(room, prev.period),
              number: prev.number,
              played: prevBets.length > 0,
              staked: toRupees(prevBets.reduce((t, b) => t + b.amount, 0)),
              winnings: toRupees(prevBets.reduce((t, b) => t + b.win, 0)),
            }
          : null,
      }]
    }),
  ])
  return {
    serverNow: now,
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      lockMs: cfg.lockSeconds * 1000,
      fee: cfg.fee,
      payouts: cfg.payouts,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
    },
    rooms: Object.fromEntries(perRoom),
    records: records.map(serializeBet),
  }
}

const channel = createChannel(snapshotFor)

// ── Routes ───────────────────────────────────────────────────
export const wingoRouter = Router()
wingoRouter.use(requireAuth)

wingoRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))
wingoRouter.get('/stream', (req, res) => channel.connect(req, res))

wingoRouter.post('/bet', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Win Go is paused. Please try again later.')
  const { room, pick } = req.body ?? {}
  if (!ROOMS[room]) throw new HttpError(400, 'Pick a room')
  if (!cfg.rooms[room]) throw new HttpError(403, `${ROOMS[room].label} is closed right now`)
  if (!PICKS.includes(String(pick))) throw new HttpError(400, 'Pick a colour, Big / Small or a number')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  if (paise > Math.round(cfg.maxBet * 100)) throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)

  const now = Date.now()
  const cur = periodIndex(room, now)
  if ((cur + 1) * ROOMS[room].ms - now <= cfg.lockSeconds * 1000) throw new HttpError(409, 'Betting is closed for this period')

  const _id = new mongoose.Types.ObjectId()
  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME, ref: _id })
    await WingoBet.create([{
      _id, user: req.userId, room, period: cur, pick: String(pick), amount: paise,
      fee: cfg.fee, payouts: cfg.payouts, maxWin: cfg.maxWin,
    }], { session })
  })
  channel.sendTo(req.userId)
  res.json(await snapshotFor(req.userId))
})

// ── Lifecycle ────────────────────────────────────────────────
export async function startWingo() {
  const now = Date.now()
  // Settle anything left pending from a previous server run
  const stale = await WingoBet.aggregate([{ $match: { status: 'pending' } }, { $group: { _id: { room: '$room', period: '$period' } } }])
  for (const { _id: { room, period } } of stale) {
    if (ROOMS[room] && period < periodIndex(room, now)) await resolvePeriod(room, period)
  }
  for (const room of WINGO_ROOMS) {
    const cur = periodIndex(room, now)
    // Seed a little history on first boot so the board isn't empty
    if (!(await WingoResult.exists({ room }))) {
      for (let i = 10; i >= 1; i--) await resolvePeriod(room, cur - i)
    }
    lastIdx[room] = cur
    periodOdds.set(`${room}:${cur}`, [...getSettings(GAME).weights])
  }
  // Limits / payouts / pause apply immediately; chances apply from the next period
  onSettingsChange(GAME, () => channel.broadcast())
  setInterval(tick, 200)
}
