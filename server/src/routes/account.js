// Player account: profile, name/password changes, history, statistics.
import { Router } from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { tx } from '../db.js'
import { clearSession, ensureUid, publicUser, requireAuth, setSession, validatePassword } from '../auth.js'
import { AviatorBet, AviatorRound, ColorBet, Deposit, DiceBet, MinesBet, PlinkoBet, PokerTable, TowerBet, Transaction, User, SpinBet, WheelBet, WingoBet, Withdrawal } from '../models/index.js'
import { HttpError, debit, serializeTx, toRupees } from '../wallet.js'
import { periodLabel } from '../games/color.js'
import { describeMines } from '../games/mines.js'
import { describeTower } from '../games/tower.js'
import { describePlinko } from '../games/plinko.js'
import { describeDice } from '../games/dice.js'
import { describeWheel } from '../games/wheel.js'
import { describeSpin } from '../games/spin.js'
import { describePoker } from '../games/poker.js'
import { describeWingo, periodLabel as wingoPeriod } from '../games/wingo.js'

// Newer games share one history shape: { game, model, settled filter, describe }
const OTHER_GAMES = [
  { game: 'wingo', model: WingoBet, settled: { status: { $in: ['won', 'lost'] } }, describe: describeWingo, ref: (b) => `Period ${wingoPeriod(b.room, b.period)}` },
  { game: 'mines', model: MinesBet, settled: { status: { $in: ['won', 'lost'] } }, describe: describeMines },
  { game: 'tower', model: TowerBet, settled: { status: { $in: ['won', 'lost'] } }, describe: describeTower },
  { game: 'plinko', model: PlinkoBet, settled: {}, describe: describePlinko },
  { game: 'dice', model: DiceBet, settled: {}, describe: describeDice },
  { game: 'wheel', model: WheelBet, settled: {}, describe: describeWheel },
  { game: 'spin', model: SpinBet, settled: {}, describe: describeSpin },
  // A poker sitting: amount = buy-ins, win = cash-out; it's a win only when the player left with more
  { game: 'poker', model: PokerTable, settled: { status: { $in: ['won', 'lost'] } }, describe: describePoker, ref: (b) => `Table ${String(b._id).slice(-8).toUpperCase()}`, won: (b) => b.win > b.amount },
]

export const accountRouter = Router()
accountRouter.use(requireAuth)

const PAGE_SIZE = 20
const pageOf = (q) => Math.max(1, parseInt(q.page) || 1)

accountRouter.get('/', async (req, res) => {
  const user = await ensureUid(await User.findById(req.userId).lean())
  const pendingWithdrawals = await Withdrawal.countDocuments({ user: req.userId, status: 'pending' })
  res.json({ user: publicUser(user), balance: toRupees(user.balance), pendingWithdrawals })
})

// Display name: 2–20 letters, numbers, spaces, dots, dashes or underscores
accountRouter.post('/name', async (req, res) => {
  const name = String(req.body?.displayName ?? '').trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 20) throw new HttpError(400, 'Name must be 2–20 characters')
  if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) throw new HttpError(400, 'Use letters, numbers, spaces, dots, dashes or underscores')
  const user = await User.findByIdAndUpdate(req.userId, { displayName: name }, { new: true }).lean()
  res.json({ user: publicUser(user) })
})

accountRouter.post('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {}
  const user = await User.findById(req.userId)
  if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Current password is incorrect')
  }
  validatePassword(newPassword)
  user.passwordHash = await bcrypt.hash(newPassword, 10)
  user.passwordChangedAt = new Date()
  user.sessionVersion += 1 // log out other devices…
  await user.save()
  setSession(res, user) // …but keep this one signed in
  res.json({ ok: true })
})

// Wallet history, filterable: all | deposit | withdraw | game | bonus
const TX_FILTERS = {
  all: {},
  deposit: { type: 'deposit' },
  withdraw: { type: { $in: ['withdraw', 'withdraw_refund'] } },
  game: { type: { $in: ['bet', 'win', 'refund'] } },
  bonus: { type: { $in: ['bonus', 'adjustment', 'commission'] } },
}

accountRouter.get('/transactions', async (req, res) => {
  const filter = { user: req.userId, ...(TX_FILTERS[req.query.type] ?? {}) }
  const page = pageOf(req.query)
  const [total, rows] = await Promise.all([
    Transaction.countDocuments(filter),
    Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
  ])
  res.json({ total, page, pageSize: PAGE_SIZE, items: rows.map(serializeTx) })
})

// Settled bets from every game, newest first
accountRouter.get('/game-history', async (req, res) => {
  const limit = PAGE_SIZE * pageOf(req.query)
  const [aviator, color, ...others] = await Promise.all([
    AviatorBet.find({ user: req.userId, status: { $in: ['cashed', 'lost'] } }).sort({ settledAt: -1 }).limit(limit).lean(),
    ColorBet.find({ user: req.userId, status: { $in: ['won', 'lost'] } }).sort({ createdAt: -1 }).limit(limit).lean(),
    ...OTHER_GAMES.map((g) => g.model.find({ user: req.userId, ...g.settled }).sort({ createdAt: -1 }).limit(limit).lean()),
  ])
  const rounds = await AviatorRound.find({ _id: { $in: [...new Set(aviator.map((b) => b.round))] } }, { crashAt: 1 }).lean()
  const crashById = new Map(rounds.map((r) => [r._id, r.crashAt]))

  const items = [
    ...aviator.map((b) => ({
      id: String(b._id),
      game: 'aviator',
      time: b.settledAt ?? b.createdAt,
      amount: toRupees(b.amount),
      win: toRupees(b.win),
      won: b.status === 'cashed',
      detail: b.status === 'cashed' ? `Cashed out at ${b.cashMult.toFixed(2)}x` : `Crashed at ${(crashById.get(b.round) ?? 1).toFixed(2)}x`,
      ref: `Round ${b.round}`,
    })),
    ...color.map((b) => ({
      id: String(b._id),
      game: 'color',
      time: b.createdAt,
      amount: toRupees(b.amount),
      win: toRupees(b.win),
      won: b.status === 'won',
      detail: `Picked ${b.color}, result ${b.result}`,
      ref: `Period ${periodLabel(b.period)}`,
    })),
    ...OTHER_GAMES.flatMap((g, i) => others[i].map((b) => ({
      id: String(b._id),
      game: g.game,
      time: b.settledAt ?? b.createdAt,
      amount: toRupees(b.amount),
      win: toRupees(b.win),
      won: g.won ? g.won(b) : b.win > 0,
      lost: g.won ? toRupees(Math.max(0, b.amount - b.win)) : undefined,
      detail: g.describe(b),
      ref: g.ref ? g.ref(b) : `Bet ${String(b._id).slice(-8).toUpperCase()}`,
    }))),
  ]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, limit)

  res.json({ items, hasMore: [aviator, color, ...others].some((l) => l.length === limit) })
})

accountRouter.get('/stats', async (req, res) => {
  const byType = await Transaction.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(req.userId) } },
    { $group: { _id: { type: '$type', game: '$game' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ])
  const sum = (type, game) => byType.filter((r) => r._id.type === type && (!game || r._id.game === game)).reduce((t, r) => t + r.total, 0)
  const count = (type, game) => byType.filter((r) => r._id.type === type && (!game || r._id.game === game)).reduce((t, r) => t + r.count, 0)

  const game = (key) => {
    const wagered = -sum('bet', key) - sum('refund', key)
    const won = sum('win', key)
    return { bets: count('bet', key) - count('refund', key), wagered: toRupees(wagered), won: toRupees(won), net: toRupees(won - wagered) }
  }
  res.json({
    deposits: toRupees(sum('deposit')),
    withdrawals: toRupees(-sum('withdraw') - sum('withdraw_refund')),
    aviator: game('aviator'),
    color: game('color'),
    ...Object.fromEntries(OTHER_GAMES.map((g) => [g.game, game(g.game)])),
  })
})

// ── Delete account ───────────────────────────────────────────
// The player starts over: the account is closed (kept for the admins with all its history),
// any balance left is forfeited and the phone number is freed for a new sign-up with a new ID.
async function deleteBlockers(userId) {
  const [withdrawal, deposit, mines, tower, poker, aviator, wingo] = await Promise.all([
    Withdrawal.exists({ user: userId, status: 'pending' }),
    Deposit.exists({ user: userId, status: 'pending' }),
    MinesBet.exists({ user: userId, status: 'active' }),
    TowerBet.exists({ user: userId, status: 'active' }),
    PokerTable.exists({ user: userId, status: 'active' }),
    AviatorBet.exists({ user: userId, status: { $in: ['queued', 'active'] } }),
    WingoBet.exists({ user: userId, status: 'pending' }),
  ])
  const list = []
  if (withdrawal) list.push('You have a withdrawal waiting to be paid.')
  if (deposit) list.push('You have a deposit waiting for confirmation.')
  if (mines || tower || poker) list.push('Finish your game in progress (Mines, Tower or Poker) first.')
  if (aviator || wingo) list.push('Wait for your open Aviator / Win Go bets to finish.')
  return list
}

accountRouter.get('/delete', async (req, res) => {
  const user = await User.findById(req.userId, { balance: 1, commission: 1 }).lean()
  res.json({
    balance: toRupees(user.balance),
    commission: toRupees(user.commission ?? 0),
    blockers: await deleteBlockers(req.userId),
  })
})

accountRouter.post('/delete', async (req, res) => {
  const { password, confirm } = req.body ?? {}
  if (confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm')
  const user = await User.findById(req.userId)
  if (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(400, 'Password is incorrect')
  }
  const blockers = await deleteBlockers(req.userId)
  if (blockers.length) throw new HttpError(409, blockers[0])
  const reason = String(req.body?.reason ?? '').trim().slice(0, 200)

  await tx(async (session) => {
    const u = await User.findOne({ _id: req.userId, status: { $ne: 'deleted' } }, { balance: 1, phone: 1, commission: 1 }).session(session).lean()
    if (!u) throw new HttpError(409, 'This account is already deleted')
    if (u.balance > 0) await debit(session, u._id, u.balance, { type: 'forfeit', note: 'Account deleted by the player — balance forfeited' })
    await User.updateOne({ _id: u._id }, {
      $set: {
        status: 'deleted',
        deletedAt: new Date(),
        deletedPhone: u.phone,
        phone: `deleted:${u._id}`,
        deletedBalance: u.balance,
        deletedCommission: u.commission ?? 0,
        commission: 0,
        deleteReason: reason || undefined,
      },
      $inc: { sessionVersion: 1 },
    }, { session })
    await Deposit.updateMany({ user: u._id, status: 'unpaid' }, { status: 'cancelled' }, { session })
  })
  clearSession(res)
  res.json({ ok: true })
})
