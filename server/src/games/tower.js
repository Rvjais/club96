// ─────────────────────────────────────────────────────────────
// Tower — climb a tower one level at a time. Every level has a row
// of tiles; some are safe, the rest are traps. Pick a safe tile to go
// up (the multiplier grows), cash out any time, or lose on a trap.
// Safe tiles for every level are rolled on the server at the start
// and revealed only when the round ends.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { TowerBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'tower'

// tiles per level / how many of them are safe
export const TOWER_MODES = {
  easy: { tiles: 4, safe: 3 },
  medium: { tiles: 3, safe: 2 },
  hard: { tiles: 2, safe: 1 },
  expert: { tiles: 3, safe: 1 },
}

const floor2 = (n) => Math.floor(n * 100 + 1e-9) / 100

export function towerMultiplier(mode, level, edge) {
  const { tiles, safe } = TOWER_MODES[mode]
  return floor2((tiles / safe) ** level * (1 - edge / 100))
}

function pickSafe(tiles, safe) {
  const cols = Array.from({ length: tiles }, (_, i) => i)
  for (let i = 0; i < safe; i++) {
    const j = i + crypto.randomInt(0, tiles - i)
    ;[cols[i], cols[j]] = [cols[j], cols[i]]
  }
  return cols.slice(0, safe).sort((a, b) => a - b)
}

function serialize(b) {
  const active = b.status === 'active'
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    mode: b.mode,
    levels: b.levels,
    picks: b.picks,
    status: b.status,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    next: active && b.picks.length < b.levels ? towerMultiplier(b.mode, b.picks.length + 1, b.houseEdge) : null,
    board: active ? null : b.safe, // safe tiles per level, revealed after the round
    time: b.settledAt ?? b.createdAt,
  }
}

export function describeTower(b) {
  return b.status === 'won'
    ? `${b.mode} · climbed ${b.picks.length}/${b.levels} levels`
    : `${b.mode} · trap on level ${b.picks.length}`
}

function publicRules() {
  const cfg = getSettings(GAME)
  const modes = Object.fromEntries(Object.entries(TOWER_MODES).map(([key, m]) => [
    key,
    { ...m, ladder: Array.from({ length: cfg.levels }, (_, i) => towerMultiplier(key, i + 1, cfg.houseEdge)) },
  ]))
  return { enabled: cfg.enabled, houseEdge: cfg.houseEdge, levels: cfg.levels, minBet: cfg.minBet, maxBet: cfg.maxBet, maxWin: cfg.maxWin, modes }
}

async function snapshotFor(userId) {
  const [balance, active, recent] = await Promise.all([
    balanceOf(userId),
    TowerBet.findOne({ user: userId, status: 'active' }).lean(),
    TowerBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  return { balance: toRupees(balance), rules: publicRules(), active: active ? serialize(active) : null, recent: recent.map(serialize) }
}

async function activeRound(userId) {
  const bet = await TowerBet.findOne({ user: userId, status: 'active' }).lean()
  if (!bet) throw new HttpError(404, 'No round in progress')
  return bet
}

const sameRound = (bet) => ({ _id: bet._id, status: 'active', picks: bet.picks })
const raced = () => new HttpError(409, 'That move was already made')

async function cashOut(bet, picks, multiplier) {
  const win = Math.min(Math.floor(bet.amount * multiplier + 1e-6), Math.round(bet.maxWin * 100))
  return tx(async (session) => {
    const upd = await TowerBet.findOneAndUpdate(
      sameRound(bet),
      { status: 'won', picks, multiplier, win, settledAt: new Date() },
      { new: true, session },
    ).lean()
    if (!upd) throw raced()
    const balance = await credit(session, bet.user, win, { type: 'win', game: GAME, ref: bet._id })
    return { bet: serialize(upd), balance: toRupees(balance) }
  })
}

// ── Routes ───────────────────────────────────────────────────
export const towerRouter = Router()
towerRouter.use(requireAuth)

towerRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

towerRouter.post('/start', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Tower is paused. Please try again later.')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  if (paise > Math.round(cfg.maxBet * 100)) throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  const mode = req.body?.mode
  if (!TOWER_MODES[mode]) throw new HttpError(400, 'Pick a difficulty')
  const { tiles, safe } = TOWER_MODES[mode]

  const _id = new mongoose.Types.ObjectId()
  try {
    const out = await tx(async (session) => {
      if (await TowerBet.exists({ user: req.userId, status: 'active' }).session(session)) throw new HttpError(409, 'Finish your current climb first')
      const balance = await debit(session, req.userId, paise, { type: 'bet', game: GAME, ref: _id })
      const [bet] = await TowerBet.create([{
        _id, user: req.userId, amount: paise, mode, levels: cfg.levels, houseEdge: cfg.houseEdge, maxWin: cfg.maxWin,
        safe: Array.from({ length: cfg.levels }, () => pickSafe(tiles, safe)), status: 'active',
      }], { session })
      return { bet: serialize(bet.toObject()), balance: toRupees(balance) }
    })
    res.json(out)
  } catch (err) {
    if (err?.code === 11000) throw new HttpError(409, 'Finish your current climb first')
    throw err
  }
})

towerRouter.post('/step', async (req, res) => {
  const bet = await activeRound(req.userId)
  const col = Number(req.body?.col)
  if (!Number.isInteger(col) || col < 0 || col >= TOWER_MODES[bet.mode].tiles) throw new HttpError(400, 'Invalid tile')
  const level = bet.picks.length
  const picks = [...bet.picks, col]

  if (!bet.safe[level].includes(col)) {
    const upd = await TowerBet.findOneAndUpdate(
      sameRound(bet),
      { status: 'lost', picks, multiplier: 0, settledAt: new Date() },
      { new: true },
    ).lean()
    if (!upd) throw raced()
    return res.json({ bet: serialize(upd), balance: toRupees(await balanceOf(req.userId)) })
  }

  const multiplier = towerMultiplier(bet.mode, picks.length, bet.houseEdge)
  // Reached the top → pay out automatically
  if (picks.length === bet.levels) return res.json(await cashOut(bet, picks, multiplier))

  const upd = await TowerBet.findOneAndUpdate(sameRound(bet), { picks, multiplier }, { new: true }).lean()
  if (!upd) throw raced()
  res.json({ bet: serialize(upd), balance: toRupees(await balanceOf(req.userId)) })
})

towerRouter.post('/cashout', async (req, res) => {
  const bet = await activeRound(req.userId)
  if (bet.picks.length === 0) throw new HttpError(400, 'Climb at least one level first')
  res.json(await cashOut(bet, bet.picks, bet.multiplier))
})
