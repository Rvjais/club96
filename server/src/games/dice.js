// ─────────────────────────────────────────────────────────────
// Dice — pick a target and roll over or under it. The roll is a
// server-side random number from 0.00 to 99.99. "Over" wins on a roll
// ≥ target, "under" wins on a roll < target, so the win chance is
// exactly 100 − target or target. Payout = (100 − house edge) / chance.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { DiceBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'dice'

const floor2 = (n) => Math.floor(n * 100 + 1e-9) / 100
export const dicePayout = (chance, edge) => floor2((100 - edge) / chance)

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    direction: b.direction,
    target: b.target,
    chance: b.chance,
    payout: b.payout,
    roll: b.roll,
    won: b.won,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

export const describeDice = (b) => `Rolled ${b.roll.toFixed(2)} · ${b.direction} ${b.target.toFixed(2)} (${b.payout}x)`

function publicRules() {
  const cfg = getSettings(GAME)
  return { enabled: cfg.enabled, houseEdge: cfg.houseEdge, minChance: cfg.minChance, maxChance: cfg.maxChance, minBet: cfg.minBet, maxBet: cfg.maxBet, maxWin: cfg.maxWin }
}

// ── Routes ───────────────────────────────────────────────────
export const diceRouter = Router()
diceRouter.use(requireAuth)

diceRouter.get('/state', async (req, res) => {
  const [balance, recent] = await Promise.all([
    balanceOf(req.userId),
    DiceBet.find({ user: req.userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  res.json({ balance: toRupees(balance), rules: publicRules(), recent: recent.map(serialize) })
})

diceRouter.post('/roll', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Dice is paused. Please try again later.')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  if (paise > Math.round(cfg.maxBet * 100)) throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  const direction = req.body?.direction
  if (direction !== 'over' && direction !== 'under') throw new HttpError(400, 'Pick over or under')
  const target = Math.round(Number(req.body?.target) * 100) / 100
  if (!Number.isFinite(target) || target <= 0 || target >= 100) throw new HttpError(400, 'Target must be between 0 and 100')
  const chance = Math.round((direction === 'over' ? 100 - target : target) * 100) / 100
  if (chance < cfg.minChance || chance > cfg.maxChance) {
    throw new HttpError(400, `Win chance must be between ${cfg.minChance}% and ${cfg.maxChance}%`)
  }

  const payout = dicePayout(chance, cfg.houseEdge)
  const roll = crypto.randomInt(0, 10000) / 100
  const won = direction === 'over' ? roll >= target : roll < target
  const win = won ? Math.min(Math.floor(paise * payout + 1e-6), Math.round(cfg.maxWin * 100)) : 0

  const _id = new mongoose.Types.ObjectId()
  const out = await tx(async (session) => {
    let balance = await debit(session, req.userId, paise, { type: 'bet', game: GAME, ref: _id })
    const [bet] = await DiceBet.create([{
      _id, user: req.userId, amount: paise, direction, target, chance, payout, roll, won, multiplier: won ? payout : 0, win,
    }], { session })
    if (win > 0) balance = await credit(session, req.userId, win, { type: 'win', game: GAME, ref: _id })
    return { bet: serialize(bet.toObject()), balance: toRupees(balance) }
  })
  res.json(out)
})
