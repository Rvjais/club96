// ─────────────────────────────────────────────────────────────
// Wheel — spin a wheel of equally likely segments, each paying a
// multiplier. Every risk level has its own wheel, defined in the admin
// panel as groups of { multiplier, number of segments }. The server
// spreads each group evenly around the wheel and picks the segment.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { WheelBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { RISKS, getSettings } from '../settings.js'

const GAME = 'wheel'

/** Spread each group's segments evenly around the wheel (deterministic). */
export function wheelLayout(groups) {
  const total = groups.reduce((t, g) => t + g.count, 0)
  const placed = groups.map(() => 0)
  const out = []
  for (let i = 0; i < total; i++) {
    let best = -1
    let bestScore = -Infinity
    groups.forEach((g, gi) => {
      if (placed[gi] >= g.count) return
      const score = (g.count * (i + 1)) / total - placed[gi]
      if (score > bestScore + 1e-9) {
        best = gi
        bestScore = score
      }
    })
    placed[best]++
    out.push(groups[best].mult)
  }
  return out
}

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    risk: b.risk,
    segments: b.segments,
    index: b.index,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

export const describeWheel = (b) => `${b.risk} risk · landed ${b.multiplier}x`

function publicRules() {
  const cfg = getSettings(GAME)
  return {
    enabled: cfg.enabled, risks: RISKS, minBet: cfg.minBet, maxBet: cfg.maxBet, maxWin: cfg.maxWin,
    layouts: Object.fromEntries(RISKS.map((r) => [r, wheelLayout(cfg.risks[r])])),
  }
}

// ── Routes ───────────────────────────────────────────────────
export const wheelRouter = Router()
wheelRouter.use(requireAuth)

wheelRouter.get('/state', async (req, res) => {
  const [balance, recent] = await Promise.all([
    balanceOf(req.userId),
    WheelBet.find({ user: req.userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  res.json({ balance: toRupees(balance), rules: publicRules(), recent: recent.map(serialize) })
})

wheelRouter.post('/spin', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Wheel is paused. Please try again later.')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  if (paise > Math.round(cfg.maxBet * 100)) throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  const risk = req.body?.risk
  if (!RISKS.includes(risk)) throw new HttpError(400, 'Pick a risk level')

  const layout = wheelLayout(cfg.risks[risk])
  const index = crypto.randomInt(0, layout.length)
  const multiplier = layout[index]
  const win = Math.min(Math.floor(paise * multiplier + 1e-6), Math.round(cfg.maxWin * 100))

  const _id = new mongoose.Types.ObjectId()
  const out = await tx(async (session) => {
    let balance = await debit(session, req.userId, paise, { type: 'bet', game: GAME, ref: _id })
    const [bet] = await WheelBet.create([{ _id, user: req.userId, amount: paise, risk, segments: layout.length, index, multiplier, win }], { session })
    if (win > 0) balance = await credit(session, req.userId, win, { type: 'win', game: GAME, ref: _id })
    return { bet: serialize(bet.toObject()), balance: toRupees(balance) }
  })
  // The wheel the spin used, in case it changed since the page loaded
  res.json({ ...out, layout })
})
