// ─────────────────────────────────────────────────────────────
// Mines — 5×5 grid with hidden mines. The player stakes, picks tiles
// one by one and may cash out after any gem; a mine loses the stake.
// Mine positions are rolled on the server when the round starts and
// only revealed once it ends. House edge and win cap are locked in
// at the start, so settings changes never touch a running round.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { MinesBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'mines'
export const GRID = 25

const floor2 = (n) => Math.floor(n * 100 + 1e-9) / 100

/** Fair odds of finding `gems` gems in a row, minus the house edge. */
export function minesMultiplier(mines, gems, edge) {
  let m = 1
  for (let i = 0; i < gems; i++) m *= (GRID - i) / (GRID - mines - i)
  return floor2(m * (1 - edge / 100))
}

function placeMines(count) {
  const tiles = Array.from({ length: GRID }, (_, i) => i)
  for (let i = 0; i < count; i++) {
    const j = i + crypto.randomInt(0, GRID - i)
    ;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]
  }
  return tiles.slice(0, count).sort((a, b) => a - b)
}

function serialize(b) {
  const active = b.status === 'active'
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    mines: b.mines,
    picks: b.picks,
    status: b.status,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    // Multiplier for the next gem while the round is running
    next: active && GRID - b.mines > b.picks.length ? minesMultiplier(b.mines, b.picks.length + 1, b.houseEdge) : null,
    // The board is only revealed once the round is over
    board: active ? null : b.minePositions,
    hit: b.hit ?? null,
    time: b.settledAt ?? b.createdAt,
  }
}

export function describeMines(b) {
  return b.status === 'won'
    ? `${b.mines} mines · cashed out after ${b.picks.length} gems`
    : `${b.mines} mines · hit a mine after ${Math.max(0, b.picks.length - 1)} gems`
}

function publicRules() {
  const cfg = getSettings(GAME)
  const table = {}
  for (let m = cfg.minMines; m <= cfg.maxMines; m++) {
    table[m] = Array.from({ length: GRID - m }, (_, k) => minesMultiplier(m, k + 1, cfg.houseEdge))
  }
  return {
    enabled: cfg.enabled, houseEdge: cfg.houseEdge, minMines: cfg.minMines, maxMines: cfg.maxMines,
    minBet: cfg.minBet, maxBet: cfg.maxBet, maxWin: cfg.maxWin, table,
  }
}

async function snapshotFor(userId) {
  const [balance, active, recent] = await Promise.all([
    balanceOf(userId),
    MinesBet.findOne({ user: userId, status: 'active' }).lean(),
    MinesBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  return { balance: toRupees(balance), rules: publicRules(), active: active ? serialize(active) : null, recent: recent.map(serialize) }
}

async function activeRound(userId) {
  const bet = await MinesBet.findOne({ user: userId, status: 'active' }).lean()
  if (!bet) throw new HttpError(404, 'No round in progress')
  return bet
}

// Every update is conditional on the picks we read, so a double tap can't act twice
const sameRound = (bet) => ({ _id: bet._id, status: 'active', picks: bet.picks })
const raced = () => new HttpError(409, 'That move was already made')

async function cashOut(bet, picks, multiplier) {
  const win = Math.min(Math.floor(bet.amount * multiplier + 1e-6), Math.round(bet.maxWin * 100))
  return tx(async (session) => {
    const upd = await MinesBet.findOneAndUpdate(
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
export const minesRouter = Router()
minesRouter.use(requireAuth)

minesRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

minesRouter.post('/start', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Mines is paused. Please try again later.')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  if (paise > Math.round(cfg.maxBet * 100)) throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  const mines = Number(req.body?.mines)
  if (!Number.isInteger(mines) || mines < cfg.minMines || mines > cfg.maxMines) {
    throw new HttpError(400, `Choose between ${cfg.minMines} and ${cfg.maxMines} mines`)
  }

  const _id = new mongoose.Types.ObjectId()
  try {
    const out = await tx(async (session) => {
      if (await MinesBet.exists({ user: req.userId, status: 'active' }).session(session)) throw new HttpError(409, 'Finish your current round first')
      const balance = await debit(session, req.userId, paise, { type: 'bet', game: GAME, ref: _id })
      const [bet] = await MinesBet.create([{
        _id, user: req.userId, amount: paise, mines, houseEdge: cfg.houseEdge, maxWin: cfg.maxWin,
        minePositions: placeMines(mines), status: 'active',
      }], { session })
      return { bet: serialize(bet.toObject()), balance: toRupees(balance) }
    })
    res.json(out)
  } catch (err) {
    if (err?.code === 11000) throw new HttpError(409, 'Finish your current round first')
    throw err
  }
})

minesRouter.post('/reveal', async (req, res) => {
  const tile = Number(req.body?.tile)
  if (!Number.isInteger(tile) || tile < 0 || tile >= GRID) throw new HttpError(400, 'Invalid tile')
  const bet = await activeRound(req.userId)
  if (bet.picks.includes(tile)) throw new HttpError(409, 'Tile already revealed')
  const picks = [...bet.picks, tile]

  if (bet.minePositions.includes(tile)) {
    const upd = await MinesBet.findOneAndUpdate(
      sameRound(bet),
      { status: 'lost', picks, hit: tile, multiplier: 0, settledAt: new Date() },
      { new: true },
    ).lean()
    if (!upd) throw raced()
    return res.json({ bet: serialize(upd), balance: toRupees(await balanceOf(req.userId)) })
  }

  const multiplier = minesMultiplier(bet.mines, picks.length, bet.houseEdge)
  // Every gem found → pay out automatically
  if (picks.length === GRID - bet.mines) return res.json(await cashOut(bet, picks, multiplier))

  const upd = await MinesBet.findOneAndUpdate(sameRound(bet), { picks, multiplier }, { new: true }).lean()
  if (!upd) throw raced()
  res.json({ bet: serialize(upd), balance: toRupees(await balanceOf(req.userId)) })
})

minesRouter.post('/cashout', async (req, res) => {
  const bet = await activeRound(req.userId)
  if (bet.picks.length === 0) throw new HttpError(400, 'Reveal at least one tile first')
  res.json(await cashOut(bet, bet.picks, bet.multiplier))
})
