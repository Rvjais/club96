// ─────────────────────────────────────────────────────────────
// Poker — Texas Hold'em against house bots. The player buys in from
// the wallet, plays hands with those chips, and the stack goes back
// to the wallet on leaving. Cards are dealt and bots play on the
// server (games/pokerEngine.js); the player only ever sees their own
// hand, the board, and bot hands that reach a showdown.
// Blinds, buy-ins and rake are locked in when the player sits down;
// bot behaviour and the turn clock follow the live settings.
// ─────────────────────────────────────────────────────────────
import mongoose from 'mongoose'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { PokerTable, User } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'
import { HERO, act, createTable, inHand, newHand, publicView, runBots } from './pokerEngine.js'

const GAME = 'poker'
const inr = (rupees) => `₹${Number(rupees).toLocaleString('en-IN')}`

/** Money settings in paise, fixed for the whole sitting. */
function lockCfg(c) {
  return {
    sb: toPaise(c.smallBlind),
    bb: toPaise(c.bigBlind),
    minBuyIn: toPaise(c.minBuyIn),
    maxBuyIn: toPaise(c.maxBuyIn),
    rake: c.rake,
    rakeCap: toPaise(c.rakeCap),
    bots: c.bots,
  }
}

function engineCfg(locked) {
  const live = getSettings(GAME)
  return { ...locked, botSkill: live.botSkill, botAggression: live.botAggression, botBluff: live.botBluff, turnSeconds: live.turnSeconds }
}

function publicRules() {
  const c = getSettings(GAME)
  return {
    enabled: c.enabled, smallBlind: c.smallBlind, bigBlind: c.bigBlind, minBuyIn: c.minBuyIn, maxBuyIn: c.maxBuyIn,
    rake: c.rake, rakeCap: c.rakeCap, bots: c.bots, turnSeconds: c.turnSeconds,
  }
}

function tableView(doc, state = doc.state) {
  const cfg = engineCfg(doc.cfg)
  return {
    id: String(doc._id),
    buyIn: toRupees(doc.amount),
    rake: toRupees(state.totalRake),
    blinds: { small: toRupees(doc.cfg.sb), big: toRupees(doc.cfg.bb) },
    maxBuyIn: toRupees(doc.cfg.maxBuyIn),
    turnSeconds: cfg.turnSeconds,
    timeLeft: state.deadline ? Math.max(0, state.deadline - Date.now()) : null,
    ...publicView(state, cfg, toRupees),
  }
}

function serialize(b) {
  return { id: String(b._id), amount: toRupees(b.amount), win: toRupees(b.win), hands: b.hands, status: b.status, time: b.settledAt ?? b.createdAt }
}

export function describePoker(b) {
  return `${b.hands} hand${b.hands === 1 ? '' : 's'} · bought in ${inr(toRupees(b.amount))} · left with ${inr(toRupees(b.win))}`
}

/**
 * Run `fn` on a copy of the table, then let the bots play until it's the
 * player's turn again. Returns the new state and one frame per visible step.
 */
function play(stateIn, locked, fn) {
  const state = structuredClone(stateIn)
  const cfg = engineCfg(locked)
  const frames = []
  const ctx = { emit: (msg, kind) => frames.push({ msg, kind, view: publicView(state, cfg, toRupees) }) }
  try {
    fn(state, cfg, ctx)
    runBots(state, cfg, ctx)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(400, err.message)
  }
  if (inHand(state) && state.turn === HERO) state.deadline ??= Date.now() + cfg.turnSeconds * 1000
  else state.deadline = null
  return { state, frames }
}

async function save(doc, state, extra = {}) {
  const upd = await PokerTable.findOneAndUpdate(
    { _id: doc._id, v: doc.v, status: 'active' },
    { $set: { state, hands: state.handNo, rake: state.totalRake, ...extra }, $inc: { v: 1 } },
    { new: true },
  ).lean()
  if (!upd) throw new HttpError(409, 'The table changed, refreshing')
  return upd
}

async function activeTable(userId) {
  const doc = await PokerTable.findOne({ user: userId, status: 'active' }).lean()
  if (!doc) throw new HttpError(404, 'You are not seated at a table')
  return doc
}

/** The player ran out of time: check if free, otherwise fold. */
function timeoutMove(state, cfg, ctx) {
  const hero = state.seats[HERO]
  state.deadline = null
  act(state, cfg, ctx, state.currentBet > hero.bet ? 'fold' : 'check')
}

async function catchUp(doc) {
  const s = doc.state
  if (!inHand(s) || s.turn !== HERO || !s.deadline || Date.now() < s.deadline) return { doc, frames: [] }
  const { state, frames } = play(s, doc.cfg, timeoutMove)
  try {
    return { doc: await save(doc, state), frames }
  } catch (err) {
    if (err.status !== 409) throw err
    return { doc: await PokerTable.findById(doc._id).lean(), frames: [] }
  }
}

async function respond(res, userId, doc, frames) {
  res.json({ table: tableView(doc), frames, balance: toRupees(await balanceOf(userId)) })
}

// ── Routes ───────────────────────────────────────────────────
export const pokerRouter = Router()
pokerRouter.use(requireAuth)

pokerRouter.get('/state', async (req, res) => {
  let doc = await PokerTable.findOne({ user: req.userId, status: 'active' }).lean()
  let frames = []
  if (doc) ({ doc, frames } = await catchUp(doc))
  const [balance, recent] = await Promise.all([
    balanceOf(req.userId),
    PokerTable.find({ user: req.userId, status: { $ne: 'active' } }).sort({ createdAt: -1 }).limit(10).lean(),
  ])
  res.json({ balance: toRupees(balance), rules: publicRules(), table: doc ? tableView(doc) : null, frames, recent: recent.map(serialize) })
})

pokerRouter.post('/sit', async (req, res) => {
  const c = getSettings(GAME)
  if (!c.enabled) throw new HttpError(403, 'Poker is paused. Please try again later.')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < toPaise(c.minBuyIn)) throw new HttpError(400, `Minimum buy-in is ${inr(c.minBuyIn)}`)
  if (paise > toPaise(c.maxBuyIn)) throw new HttpError(400, `Maximum buy-in is ${inr(c.maxBuyIn)}`)

  const user = await User.findById(req.userId, { displayName: 1, username: 1 }).lean()
  const locked = lockCfg(c)
  const { state, frames } = play(createTable(user.displayName || user.username, paise, locked), locked, newHand)

  const _id = new mongoose.Types.ObjectId()
  try {
    const out = await tx(async (session) => {
      if (await PokerTable.exists({ user: req.userId, status: 'active' }).session(session)) throw new HttpError(409, 'You are already seated at a table')
      const balance = await debit(session, req.userId, paise, { type: 'bet', game: GAME, ref: _id, note: 'Poker buy-in' })
      const [doc] = await PokerTable.create([{ _id, user: req.userId, amount: paise, cfg: locked, state, hands: state.handNo, status: 'active' }], { session })
      return { table: tableView(doc.toObject()), frames, balance: toRupees(balance) }
    })
    res.json(out)
  } catch (err) {
    if (err?.code === 11000) throw new HttpError(409, 'You are already seated at a table')
    throw err
  }
})

pokerRouter.post('/deal', async (req, res) => {
  if (!getSettings(GAME).enabled) throw new HttpError(403, 'Poker is paused. Leave the table to cash out your chips.')
  const doc = await activeTable(req.userId)
  if (inHand(doc.state)) throw new HttpError(409, 'A hand is already in progress')
  if (doc.state.seats[HERO].stack <= 0) throw new HttpError(400, 'You are out of chips. Top up or leave the table.')
  const { state, frames } = play(doc.state, doc.cfg, newHand)
  await respond(res, req.userId, await save(doc, state), frames)
})

pokerRouter.post('/act', async (req, res) => {
  const action = String(req.body?.action ?? '')
  if (!['fold', 'check', 'call', 'raise', 'allin'].includes(action)) throw new HttpError(400, 'Unknown action')
  const doc = await activeTable(req.userId)
  if (!inHand(doc.state) || doc.state.turn !== HERO) throw new HttpError(409, 'It is not your turn')
  const amount = action === 'raise' ? toPaise(req.body?.amount) : undefined
  const { state, frames } = play(doc.state, doc.cfg, (s, cfg, ctx) => {
    s.deadline = null
    act(s, cfg, ctx, action, amount)
  })
  await respond(res, req.userId, await save(doc, state), frames)
})

pokerRouter.post('/topup', async (req, res) => {
  if (!getSettings(GAME).enabled) throw new HttpError(403, 'Poker is paused. Leave the table to cash out your chips.')
  const doc = await activeTable(req.userId)
  if (inHand(doc.state)) throw new HttpError(409, 'You can top up between hands')
  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise <= 0) throw new HttpError(400, 'Enter an amount to add')
  const room = doc.cfg.maxBuyIn - doc.state.seats[HERO].stack
  if (paise > room) throw new HttpError(400, room > 0 ? `You can add up to ${inr(toRupees(room))} (table max ${inr(toRupees(doc.cfg.maxBuyIn))})` : 'Your stack is already at the table maximum')

  const state = structuredClone(doc.state)
  state.seats[HERO].stack += paise
  const out = await tx(async (session) => {
    const upd = await PokerTable.findOneAndUpdate(
      { _id: doc._id, v: doc.v, status: 'active' },
      { $set: { state }, $inc: { v: 1, amount: paise } },
      { new: true, session },
    ).lean()
    if (!upd) throw new HttpError(409, 'The table changed, refreshing')
    const balance = await debit(session, req.userId, paise, { type: 'bet', game: GAME, ref: doc._id, note: 'Poker top-up' })
    return { table: tableView(upd), frames: [], balance: toRupees(balance) }
  })
  res.json(out)
})

pokerRouter.post('/leave', async (req, res) => {
  const doc = await activeTable(req.userId)
  // Leaving mid-hand folds the player's cards; the bots finish the hand
  const { state, frames } = inHand(doc.state)
    ? play(doc.state, doc.cfg, (s, cfg, ctx) => {
      s.deadline = null
      if (s.turn === HERO) act(s, cfg, ctx, 'fold')
      else s.seats[HERO].folded = true
    })
    : { state: doc.state, frames: [] }
  const cashOut = state.seats[HERO].stack
  const out = await tx(async (session) => {
    const upd = await PokerTable.findOneAndUpdate(
      { _id: doc._id, v: doc.v, status: 'active' },
      {
        $set: {
          state, hands: state.handNo, rake: state.totalRake, win: cashOut,
          status: cashOut > doc.amount ? 'won' : 'lost',
          multiplier: Math.round((cashOut / doc.amount) * 100) / 100,
          settledAt: new Date(),
        },
        $inc: { v: 1 },
      },
      { new: true, session },
    ).lean()
    if (!upd) throw new HttpError(409, 'The table changed, refreshing')
    const balance = await credit(session, req.userId, cashOut, { type: 'win', game: GAME, ref: doc._id, note: 'Poker cash-out' })
    return { session: serialize(upd), frames, balance: toRupees(balance) }
  })
  res.json(out)
})
