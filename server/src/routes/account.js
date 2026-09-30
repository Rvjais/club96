// Player account: profile, name/password changes, history, statistics.
import { Router } from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { ensureUid, publicUser, requireAuth, setSession, validatePassword } from '../auth.js'
import { AviatorBet, AviatorRound, ColorBet, DiceBet, MinesBet, PlinkoBet, PokerTable, TowerBet, Transaction, User, SpinBet, WheelBet, WingoBet, Withdrawal } from '../models/index.js'
import { HttpError, serializeTx, toRupees } from '../wallet.js'
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
  bonus: { type: { $in: ['bonus', 'adjustment'] } },
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
