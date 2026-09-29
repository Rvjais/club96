// ─────────────────────────────────────────────────────────────
// Aviator — server-authoritative crash game.
// The server owns the round timeline and the crash point; clients
// only animate it. Cash-outs are priced from server time.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { createChannel } from '../sse.js'
import { AviatorBet, AviatorRound } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'

const GAME = 'aviator'
export const WAIT_MS = 6000
export const CRASH_HOLD_MS = 3500
const MAX_CRASH = 1000
const MIN_BET = 1
const MAX_BET = 10000
const TICK_MS = 50

export const multiplierAt = (sec) => 1 + 0.08 * sec + 0.02 * Math.pow(sec, 2.1)

/** Seconds of flight until the multiplier reaches `crash` (inverse of multiplierAt). */
function flightSecondsFor(crash) {
  let lo = 0
  let hi = 600
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (multiplierAt(mid) >= crash) hi = mid
    else lo = mid
  }
  return hi
}

// Same formula the client documents in its "Provably fair" dialog
function crashPointFromSeed(seed) {
  const r = (parseInt(seed.slice(0, 13), 16) / 2 ** 52) * 100
  if (r < 3) return 1
  return Math.min(MAX_CRASH, Math.max(1, Math.floor((97 / (100 - r)) * 100) / 100))
}

const floor2 = (m) => Math.floor(m * 100) / 100

// Serialise every round mutation (tick, bets, cash-outs) so they never interleave
let chain = Promise.resolve()
function lock(fn) {
  const p = chain.then(fn)
  chain = p.catch(() => {})
  return p
}

// ── Round state (in memory; persisted to AviatorRound) ───────
let round = null
let nextRoundId = 48213
let history = []
let prevRound = null
const autoBets = new Map() // betId → { id, user, amount, auto } for the current round

async function newRound(now) {
  const seed = crypto.randomBytes(32).toString('hex')
  const crashAt = crashPointFromSeed(seed)
  const flightStart = now + WAIT_MS
  const crashTime = flightStart + flightSecondsFor(crashAt) * 1000
  const id = nextRoundId++
  const hash = crypto.createHash('sha256').update(seed).digest('hex')

  await AviatorRound.create({ _id: id, seed, hash, crashAt, startedAt: new Date(now) })
  await AviatorBet.updateMany({ status: 'queued' }, { status: 'active', round: id })

  autoBets.clear()
  const autos = await AviatorBet.find({ round: id, status: 'active', autoCashout: { $ne: null } }).lean()
  for (const b of autos) autoBets.set(String(b._id), { id: b._id, user: b.user, amount: b.amount, auto: b.autoCashout })

  round = { id, seed, hash, crashAt, waitStart: now, flightStart, crashTime, endTime: crashTime + CRASH_HOLD_MS, crashed: false }
}

/** Atomically mark an active bet cashed and pay it. Returns the win (paise) or null. */
async function cashOut(betId, mult, now) {
  autoBets.delete(String(betId))
  return tx(async (session) => {
    const bet = await AviatorBet.findOne({ _id: betId, status: 'active' }, null, { session })
    if (!bet) return null
    const win = Math.floor(bet.amount * mult)
    bet.status = 'cashed'
    bet.cashMult = mult
    bet.win = win
    bet.settledAt = new Date(now)
    await bet.save({ session })
    await credit(session, bet.user, win, { type: 'win', game: GAME, ref: bet._id })
    return { win, user: String(bet.user) }
  })
}

async function crash(now) {
  // Auto cash-outs below the crash point that a tick may not have reached yet
  for (const a of autoBets.values()) {
    if (a.auto < round.crashAt) await cashOut(a.id, a.auto, now)
  }
  autoBets.clear()
  await AviatorBet.updateMany({ round: round.id, status: 'active' }, { status: 'lost', settledAt: new Date(now) })
  await AviatorRound.updateOne({ _id: round.id }, { crashedAt: new Date(now) })

  round.crashed = true
  history.push(round.crashAt)
  if (history.length > 40) history.shift()
  prevRound = { id: round.id, seed: round.seed, hash: round.hash, crashAt: round.crashAt }
}

let ticking = false
function tick() {
  if (ticking || !round) return
  ticking = true
  lock(async () => {
    const now = Date.now()
    if (!round.crashed && now >= round.flightStart) {
      if (now >= round.crashTime) {
        await crash(now)
        channel.broadcast()
        return
      }
      const mult = multiplierAt((now - round.flightStart) / 1000)
      const touched = new Set()
      for (const a of [...autoBets.values()]) {
        if (a.auto <= mult) {
          const res = await cashOut(a.id, a.auto, now)
          if (res) touched.add(res.user)
        }
      }
      for (const u of touched) channel.sendTo(u)
    } else if (round.crashed && now >= round.endTime) {
      await newRound(now)
      channel.broadcast()
    }
  })
    .catch((err) => console.error('Aviator tick failed:', err))
    .finally(() => { ticking = false })
}

// ── Snapshots ────────────────────────────────────────────────
async function snapshotFor(userId) {
  const r = round
  const [balance, open, settled] = await Promise.all([
    balanceOf(userId),
    AviatorBet.find({ user: userId, status: { $nin: ['cancelled', 'refunded'] }, $or: [{ status: 'queued' }, { round: r.id }] }).sort({ createdAt: 1 }).lean(),
    AviatorBet.find({ user: userId, status: { $in: ['cashed', 'lost'] } }).sort({ settledAt: -1 }).limit(30).lean(),
  ])
  const rounds = await AviatorRound.find({ _id: { $in: [...new Set(settled.map((b) => b.round))] } }, { crashAt: 1 }).lean()
  const crashById = new Map(rounds.map((x) => [x._id, x.crashAt]))

  return {
    serverNow: Date.now(),
    balance: toRupees(balance),
    round: {
      id: r.id,
      hash: r.hash,
      waitStart: r.waitStart,
      flightStart: r.flightStart,
      crashed: r.crashed,
      // Only revealed after the crash
      ...(r.crashed ? { crashAt: r.crashAt, crashTime: r.crashTime, endTime: r.endTime } : {}),
    },
    history,
    prevRound,
    bets: open.map((b) => ({
      id: String(b._id),
      panel: b.panel,
      amount: toRupees(b.amount),
      autoCashout: b.autoCashout,
      status: b.status,
      cashMult: b.cashMult ?? null,
      win: toRupees(b.win),
    })),
    records: settled.map((b) => ({
      id: String(b._id),
      round: b.round,
      panel: b.panel,
      amount: toRupees(b.amount),
      cashMult: b.status === 'cashed' ? b.cashMult : null,
      crashAt: crashById.get(b.round) ?? null,
      win: toRupees(b.win),
      time: b.settledAt,
    })),
  }
}

const channel = createChannel(snapshotFor)

const findPanelBet = (userId, panel) =>
  AviatorBet.findOne({ user: userId, panel, $or: [{ status: 'queued' }, { status: 'active', round: round.id }] })

// ── Routes ───────────────────────────────────────────────────
export const aviatorRouter = Router()
aviatorRouter.use(requireAuth)

aviatorRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))
aviatorRouter.get('/stream', (req, res) => channel.connect(req, res))

aviatorRouter.post('/bet', async (req, res) => {
  const panel = Number(req.body?.panel)
  if (panel !== 1 && panel !== 2) throw new HttpError(400, 'Invalid panel')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < MIN_BET * 100) throw new HttpError(400, `Minimum bet is ₹${MIN_BET}.00`)
  if (paise > MAX_BET * 100) throw new HttpError(400, `Maximum bet is ₹${MAX_BET.toLocaleString('en-IN')}`)

  let auto = req.body?.autoCashout
  if (auto == null || auto === false) auto = null
  else {
    auto = floor2(Number(auto))
    if (!Number.isFinite(auto) || auto < 1.01 || auto > MAX_CRASH) throw new HttpError(400, 'Auto cash out must be at least 1.01x')
  }

  const placed = await lock(async () => {
    const now = Date.now()
    if (await findPanelBet(req.userId, panel)) throw new HttpError(409, 'This panel already has a bet')
    const upcoming = !round.crashed && now < round.flightStart
    const bet = await tx(async (session) => {
      await debit(session, req.userId, paise, { type: 'bet', game: GAME })
      const [b] = await AviatorBet.create(
        [{ user: req.userId, round: upcoming ? round.id : null, panel, amount: paise, autoCashout: auto, status: upcoming ? 'active' : 'queued' }],
        { session },
      )
      return b
    })
    if (upcoming && auto != null) autoBets.set(String(bet._id), { id: bet._id, user: bet.user, amount: paise, auto })
    return upcoming ? 'current' : 'next'
  })

  channel.sendTo(req.userId)
  res.json({ ...(await snapshotFor(req.userId)), placed })
})

aviatorRouter.post('/cancel', async (req, res) => {
  const panel = Number(req.body?.panel)
  await lock(async () => {
    const bet = await findPanelBet(req.userId, panel)
    if (!bet) throw new HttpError(404, 'No bet to cancel')
    if (bet.status === 'active' && Date.now() >= round.flightStart) throw new HttpError(409, 'The plane has already taken off')
    autoBets.delete(String(bet._id))
    await tx(async (session) => {
      const b = await AviatorBet.findOneAndUpdate({ _id: bet._id, status: bet.status }, { status: 'cancelled', settledAt: new Date() }, { session })
      if (!b) throw new HttpError(409, 'Bet already settled')
      await credit(session, req.userId, b.amount, { type: 'refund', game: GAME, ref: b._id })
    })
  })
  channel.sendTo(req.userId)
  res.json(await snapshotFor(req.userId))
})

aviatorRouter.post('/cashout', async (req, res) => {
  const panel = Number(req.body?.panel)
  const now = Date.now() // price at the moment the request arrived
  const cashed = await lock(async () => {
    const bet = await findPanelBet(req.userId, panel)
    if (!bet || bet.status !== 'active' || round.crashed || now < round.flightStart) throw new HttpError(409, 'Nothing to cash out')
    if (now >= round.crashTime) throw new HttpError(409, 'Too late — the plane flew away')
    const mult = floor2(multiplierAt((now - round.flightStart) / 1000))
    const out = await cashOut(bet._id, mult, now)
    if (!out) throw new HttpError(409, 'Bet already settled')
    return { panel, mult, win: toRupees(out.win) }
  })
  channel.sendTo(req.userId)
  res.json({ ...(await snapshotFor(req.userId)), cashed })
})

// ── Lifecycle ────────────────────────────────────────────────
export async function startAviator() {
  // Refund bets left open by a previous server run
  const orphans = await AviatorBet.find({ status: { $in: ['active', 'queued'] } }).lean()
  for (const b of orphans) {
    await tx(async (session) => {
      const upd = await AviatorBet.updateOne({ _id: b._id, status: b.status }, { status: 'refunded', settledAt: new Date() }, { session })
      if (upd.modifiedCount) await credit(session, b.user, b.amount, { type: 'refund', game: GAME, ref: b._id })
    })
  }
  if (orphans.length) console.log(`Aviator: refunded ${orphans.length} unfinished bet(s) from the last run`)

  const last = await AviatorRound.findOne().sort({ _id: -1 }).lean()
  if (last) nextRoundId = last._id + 1
  const crashed = await AviatorRound.find({ crashedAt: { $ne: null } }).sort({ _id: -1 }).limit(40).lean()
  history = crashed.map((r) => r.crashAt).reverse()
  if (history.length === 0) history = [1.24, 2.5, 1.05, 14.2, 1.88, 3.12, 1.15, 8.45, 1.02, 2.05]
  if (crashed[0]) prevRound = { id: crashed[0]._id, seed: crashed[0].seed, hash: crashed[0].hash, crashAt: crashed[0].crashAt }

  await newRound(Date.now())
  setInterval(tick, TICK_MS)
}
