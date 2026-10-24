// ─────────────────────────────────────────────────────────────
// Scratch Cards — instant win. Player buys a card with 3 hidden
// panels; reveals them and wins if 3 matching symbols appear.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { ScratchBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'scratch'

// Symbol pool: symbol -> { weight, payout (multiplier) }
const SYMBOLS = {
  '🍒': { weight: 35, payout: 2 },
  '🍋': { weight: 25, payout: 3 },
  '🔔': { weight: 15, payout: 5 },
  '⭐': { weight: 10, payout: 10 },
  '💎': { weight: 8, payout: 25 },
  '💰': { weight: 5, payout: 50 },
  '🎰': { weight: 2, payout: 200 },
}

const SYMBOL_KEYS = Object.keys(SYMBOLS)
const PANELS = 3

const TOTAL_WEIGHT = Object.values(SYMBOLS).reduce((t, s) => t + s.weight, 0)

function rollSymbol() {
  const r = crypto.randomInt(0, TOTAL_WEIGHT)
  let acc = 0
  for (const sym of SYMBOL_KEYS) {
    acc += SYMBOLS[sym].weight
    if (r < acc) return sym
  }
  return SYMBOL_KEYS[0]
}

function generateCard() {
  const panels = []
  for (let i = 0; i < PANELS; i++) panels.push(rollSymbol())
  return panels
}

function payoutFor(panels, stake) {
  const first = panels[0]
  const allMatch = panels.every(p => p === first)
  if (!allMatch) return 0
  return Math.floor(stake * SYMBOLS[first].payout)
}

function serialize(bet) {
  return {
    id: String(bet._id),
    amount: toRupees(bet.amount),
    panels: bet.panels,
    revealed: bet.revealed,
    multiplier: bet.multiplier,
    win: toRupees(bet.win),
    status: bet.status,
    result: bet.result,
    time: bet.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, active, recent] = await Promise.all([
    balanceOf(userId),
    ScratchBet.findOne({ user: userId, status: 'active' }).lean(),
    ScratchBet.find({ user: userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const cfg = getSettings(GAME)
  const symbols = {}
  for (const [k, v] of Object.entries(SYMBOLS)) {
    symbols[k] = { weight: v.weight, payout: v.payout }
  }
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      symbols,
    },
    active: active ? serialize(active) : null,
    recent: recent.map(serialize),
  }
}

export const scratchRouter = Router()
scratchRouter.use(requireAuth)

scratchRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

scratchRouter.post('/buy', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Scratch Cards is paused. Please try again later.')

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const panels = generateCard()
  const win = payoutFor(panels, paise)
  const multiplier = win > 0 ? SYMBOLS[panels[0]].payout : 0

  await tx(async (session) => {
    if (await ScratchBet.exists({ user: req.userId, status: 'active' }).session(session)) {
      throw new HttpError(409, 'Finish your current card first')
    }
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await ScratchBet.create([{
      user: req.userId,
      amount: paise,
      panels,
      revealed: false,
      multiplier,
      win,
      status: win > 0 ? 'won' : 'lost',
      result: win > 0 ? 'win' : 'loss',
      finished: true,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

scratchRouter.post('/reveal', async (req, res) => {
  const bet = await ScratchBet.findOne({ user: req.userId, status: { $in: ['active', 'won', 'lost'] } }).lean()
  if (!bet) throw new HttpError(404, 'No card to reveal')
  if (bet.revealed) throw new HttpError(409, 'Card already revealed')

  await ScratchBet.findOneAndUpdate(
    { _id: bet._id, revealed: false },
    { revealed: true },
    { new: true },
  )

  res.json({ ...(await snapshotFor(req.userId)), revealed: true })
})

export async function startScratch() {
  const orphans = await ScratchBet.find({ status: 'active' }).lean()
  for (const b of orphans) {
    await tx(async (session) => {
      const upd = await ScratchBet.updateOne({ _id: b._id, status: 'active' }, { status: 'refunded', settledAt: new Date() }, { session })
      if (upd.modifiedCount) await credit(session, b.user, b.amount, { type: 'refund', game: GAME, ref: b._id })
    })
  }
  if (orphans.length) console.log(`Scratch: refunded ${orphans.length} unfinished card(s)`)
  console.log('Scratch Cards ready')
}