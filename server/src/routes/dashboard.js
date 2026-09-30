// ─────────────────────────────────────────────────────────────
// Admin dashboard: profit & loss, cash flow, players and games for a date range.
// Everything is worked out from the wallet ledger (Transaction), so it matches
// what players actually saw. Days are India time.
// ─────────────────────────────────────────────────────────────
import mongoose from 'mongoose'
import { DB_STORAGE_LIMIT_MB } from '../config.js'
import { Deposit, Transaction, User, Withdrawal } from '../models/index.js'
import { GAMES } from '../settings.js'
import { HttpError, toRupees } from '../wallet.js'

const TZ = 'Asia/Kolkata'
const DAY_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const GAME_TYPES = ['bet', 'win', 'refund']
const r = toRupees

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, India time); either may be missing. */
function parseRange(q) {
  const from = DATE_RE.test(q.from ?? '') ? new Date(`${q.from}T00:00:00+05:30`) : null
  const to = DATE_RE.test(q.to ?? '') ? new Date(Date.parse(`${q.to}T00:00:00+05:30`) + DAY_MS) : null
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new HttpError(400, 'Invalid date')
  if (from && to && to <= from) throw new HttpError(400, 'The end date must be on or after the start date')
  return { from, to }
}

const within = (field, { from, to }) => (from || to ? { [field]: { ...(from && { $gte: from }), ...(to && { $lt: to }) } } : {})

// Signed ledger sums → positive amounts
const wageredExpr = { $cond: [{ $eq: ['$type', 'bet'] }, { $multiply: ['$amount', -1] }, { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, 0] }] }
const wonExpr = { $cond: [{ $eq: ['$type', 'win'] }, '$amount', 0] }
const betCountExpr = { $cond: [{ $eq: ['$type', 'bet'] }, 1, { $cond: [{ $eq: ['$type', 'refund'] }, -1, 0] }] }

const playerRow = (u) => u && {
  id: String(u._id),
  uid: u.uid ?? null,
  name: u.displayName || u.username,
  phone: u.deletedPhone ?? u.phone,
  status: u.status,
}

export async function dashboard(req, res) {
  const range = parseRange(req.query)
  const game = GAMES.includes(req.query.game) || req.query.game === 'color' ? req.query.game : null
  const gameMatch = { type: { $in: GAME_TYPES }, ...(game ? { game } : {}), ...within('createdAt', range) }

  // Bucket the chart by day, or by month for long / open-ended ranges
  const spanDays = range.from ? ((range.to ?? new Date()) - range.from) / DAY_MS : Infinity
  const bucket = spanDays > 92 ? 'month' : 'day'

  const [byType, byGame, series, players, userCounts, pending, withdrawalsPaid, depositOrders, deletedRows, recreatedRows] = await Promise.all([
    // Site-wide money movements by type (not affected by the game filter)
    Transaction.aggregate([
      { $match: within('createdAt', range) },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    // Per game
    Transaction.aggregate([
      { $match: gameMatch },
      { $group: { _id: '$game', wagered: { $sum: wageredExpr }, won: { $sum: wonExpr }, bets: { $sum: betCountExpr }, players: { $addToSet: '$user' } } },
      { $project: { wagered: 1, won: 1, bets: 1, players: { $size: '$players' } } },
    ]),
    // Chart: house game profit + deposits per day / month
    Transaction.aggregate([
      {
        $match: {
          ...within('createdAt', range),
          $or: [{ type: { $in: GAME_TYPES }, ...(game ? { game } : {}) }, { type: 'deposit' }],
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: bucket === 'day' ? '%Y-%m-%d' : '%Y-%m', date: '$createdAt', timezone: TZ } },
          wagered: { $sum: wageredExpr },
          won: { $sum: wonExpr },
          deposits: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Per player: who lost, who won
    Transaction.aggregate([
      { $match: gameMatch },
      { $group: { _id: '$user', wagered: { $sum: wageredExpr }, won: { $sum: wonExpr } } },
      { $addFields: { net: { $subtract: ['$won', '$wagered'] } } },
      {
        $facet: {
          summary: [{
            $group: {
              _id: null,
              active: { $sum: 1 },
              losers: { $sum: { $cond: [{ $lt: ['$net', 0] }, 1, 0] } },
              lost: { $sum: { $cond: [{ $lt: ['$net', 0] }, '$net', 0] } },
              winners: { $sum: { $cond: [{ $gt: ['$net', 0] }, 1, 0] } },
              gained: { $sum: { $cond: [{ $gt: ['$net', 0] }, '$net', 0] } },
            },
          }],
          topLosers: [{ $match: { net: { $lt: 0 } } }, { $sort: { net: 1 } }, { $limit: 10 }],
          topWinners: [{ $match: { net: { $gt: 0 } } }, { $sort: { net: -1 } }, { $limit: 10 }],
        },
      },
    ]),
    // Accounts
    Promise.all([
      User.countDocuments({ ...within('createdAt', range) }),
      User.countDocuments({ status: 'deleted', ...within('deletedAt', range) }),
      User.countDocuments({ 'previousAccounts.0': { $exists: true }, ...within('createdAt', range) }),
      User.countDocuments({ status: { $ne: 'deleted' } }),
      User.countDocuments({ status: 'blocked' }),
      User.aggregate([{ $match: { status: { $ne: 'deleted' } } }, { $group: { _id: null, balance: { $sum: '$balance' }, commission: { $sum: { $ifNull: ['$commission', 0] } } } }]),
    ]),
    // Waiting for an admin right now
    Promise.all([
      Deposit.aggregate([{ $match: { status: 'pending' } }, { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$amount' } } }]),
      Withdrawal.aggregate([{ $match: { status: 'pending' } }, { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$amount' } } }]),
    ]),
    Withdrawal.aggregate([
      { $match: { status: 'approved', ...within('processedAt', range) } },
      { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    Deposit.aggregate([
      { $match: within('createdAt', range) },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    User.find({ status: 'deleted', ...within('deletedAt', range) }, { uid: 1, username: 1, displayName: 1, deletedPhone: 1, createdAt: 1, deletedAt: 1, deletedBalance: 1, deleteReason: 1, status: 1 })
      .sort({ deletedAt: -1 }).limit(50).lean(),
    User.find({ 'previousAccounts.0': { $exists: true }, ...within('createdAt', range) }, { uid: 1, username: 1, displayName: 1, phone: 1, deletedPhone: 1, createdAt: 1, previousAccounts: 1, status: 1, balance: 1 })
      .sort({ createdAt: -1 }).limit(50).lean(),
  ])

  // ── Totals ──
  const t = Object.fromEntries(byType.map((x) => [x._id, x]))
  const sum = (k) => t[k]?.total ?? 0
  const cnt = (k) => t[k]?.count ?? 0
  const siteWagered = -sum('bet') - sum('refund')
  const siteWon = sum('win')
  const siteGameProfit = siteWagered - siteWon
  const bonuses = sum('bonus')
  const commission = sum('commission')
  const adjustments = sum('adjustment') // + = credited to players by admins
  const forfeited = -sum('forfeit') // balances kept when players deleted their account
  const netProfit = siteGameProfit - bonuses - commission - adjustments + forfeited

  const games = byGame
    .filter((g) => g._id)
    .map((g) => ({ game: g._id, bets: g.bets, players: g.players, wagered: r(g.wagered), paid: r(g.won), profit: r(g.wagered - g.won), rtp: g.wagered > 0 ? Math.round((g.won / g.wagered) * 10000) / 100 : null }))
    .sort((a, b) => b.wagered - a.wagered)
  const gWagered = byGame.reduce((s, g) => s + g.wagered, 0)
  const gWon = byGame.reduce((s, g) => s + g.won, 0)

  const p = players[0]
  const ps = p.summary[0] ?? { active: 0, losers: 0, lost: 0, winners: 0, gained: 0 }
  const topIds = [...p.topLosers, ...p.topWinners].map((x) => x._id)
  const infos = new Map((await User.find({ _id: { $in: topIds } }, { uid: 1, username: 1, displayName: 1, phone: 1, deletedPhone: 1, status: 1 }).lean()).map((u) => [String(u._id), u]))
  const topRow = (x) => ({ ...playerRow(infos.get(String(x._id)) ?? { _id: x._id }), wagered: r(x.wagered), won: r(x.won), net: r(x.net) })

  // ── Deleted & recreated accounts ──
  const deletedIds = deletedRows.map((u) => u._id)
  const prevIds = recreatedRows.flatMap((u) => u.previousAccounts)
  const [life, successors, previous] = await Promise.all([
    Transaction.aggregate([
      { $match: { user: { $in: [...deletedIds, ...prevIds] } } },
      { $group: { _id: { user: '$user', type: '$type' }, total: { $sum: '$amount' } } },
    ]),
    User.find({ previousAccounts: { $in: deletedIds } }, { uid: 1, previousAccounts: 1, createdAt: 1, status: 1 }).lean(),
    User.find({ _id: { $in: prevIds } }, { uid: 1, createdAt: 1, deletedAt: 1, deletedBalance: 1 }).lean(),
  ])
  const lifeOf = (id) => {
    const rows = life.filter((l) => String(l._id.user) === String(id))
    const s = (k) => rows.find((l) => l._id.type === k)?.total ?? 0
    const wagered = -s('bet') - s('refund')
    return { deposits: r(s('deposit')), withdrawn: r(-s('withdraw') - s('withdraw_refund')), wagered: r(wagered), net: r(s('win') - wagered) }
  }
  const prevById = new Map(previous.map((u) => [String(u._id), u]))

  const [signups, deletedCount, recreatedCount, liveUsers, blocked, liab] = userCounts
  const [pd, pw] = pending
  const orders = Object.fromEntries(depositOrders.map((d) => [d._id, d.n]))

  res.json({
    range: { from: req.query.from ?? null, to: req.query.to ?? null, bucket },
    game,
    profit: {
      wagered: r(siteWagered),
      paid: r(siteWon),
      gameProfit: r(siteGameProfit),
      bonuses: r(bonuses),
      commission: r(commission),
      adjustments: r(adjustments),
      forfeited: r(forfeited),
      netProfit: r(netProfit),
      bets: cnt('bet') - cnt('refund'),
    },
    cash: {
      deposits: r(sum('deposit')),
      depositCount: cnt('deposit'),
      withdrawalsPaid: r(withdrawalsPaid[0]?.total ?? 0),
      withdrawalCount: withdrawalsPaid[0]?.n ?? 0,
      net: r(sum('deposit') - (withdrawalsPaid[0]?.total ?? 0)),
      orders: { created: Object.values(orders).reduce((a, b) => a + b, 0), approved: orders.approved ?? 0, rejected: orders.rejected ?? 0, abandoned: (orders.cancelled ?? 0) + (orders.expired ?? 0) },
    },
    players: {
      active: ps.active,
      losers: ps.losers,
      lost: r(-ps.lost),
      winners: ps.winners,
      won: r(ps.gained),
      combinedNet: r(gWon - gWagered), // players as a whole (negative = they lost)
      wagered: r(gWagered),
      topLosers: p.topLosers.map(topRow),
      topWinners: p.topWinners.map(topRow),
    },
    users: {
      signups,
      deleted: deletedCount,
      recreated: recreatedCount,
      total: liveUsers,
      blocked,
      balances: r(liab[0]?.balance ?? 0),
      unclaimedCommission: r(liab[0]?.commission ?? 0),
    },
    pending: {
      deposits: pd[0]?.n ?? 0,
      depositTotal: r(pd[0]?.total ?? 0),
      withdrawals: pw[0]?.n ?? 0,
      withdrawalTotal: r(pw[0]?.total ?? 0),
    },
    games,
    series: series.map((d) => ({ key: d._id, wagered: r(d.wagered), paid: r(d.won), profit: r(d.wagered - d.won), deposits: r(d.deposits) })),
    deletedAccounts: deletedRows.map((u) => {
      const next = successors.find((s) => s.previousAccounts.some((id) => String(id) === String(u._id)))
      return {
        ...playerRow(u),
        createdAt: u.createdAt,
        deletedAt: u.deletedAt,
        forfeited: r(u.deletedBalance ?? 0),
        reason: u.deleteReason ?? null,
        lifetime: lifeOf(u._id),
        recreatedAs: next ? { id: String(next._id), uid: next.uid ?? null, createdAt: next.createdAt, status: next.status } : null,
      }
    }),
    recreatedAccounts: recreatedRows.map((u) => ({
      ...playerRow(u),
      balance: r(u.balance),
      createdAt: u.createdAt,
      previous: u.previousAccounts.map((id) => {
        const old = prevById.get(String(id))
        return { id: String(id), uid: old?.uid ?? null, createdAt: old?.createdAt ?? null, deletedAt: old?.deletedAt ?? null, forfeited: r(old?.deletedBalance ?? 0), lifetime: lifeOf(id) }
      }),
    })),
  })
}

// ── Database storage ─────────────────────────────────────────
// Atlas counts data + indexes against the plan's limit. Cached for a minute: dbStats is cheap but not free.
const MB = 1024 * 1024
const mb = (bytes) => Math.round((bytes / MB) * 100) / 100
let storageCache = null

export async function storage(req, res) {
  if (!storageCache || Date.now() - storageCache.at > 60_000 || req.query.fresh) {
    const db = mongoose.connection.db
    const s = await db.stats()
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'))
    const collections = await Promise.all(names.map(async (name) => {
      try {
        const col = db.collection(name)
        const [[c], documents] = await Promise.all([col.aggregate([{ $collStats: { storageStats: {} } }]).toArray(), col.estimatedDocumentCount()])
        const st = c?.storageStats ?? {}
        return { name, documents, data: mb(st.size ?? 0), indexes: mb(st.totalIndexSize ?? 0), total: mb((st.size ?? 0) + (st.totalIndexSize ?? 0)) }
      } catch {
        return { name, documents: null, data: null, indexes: null, total: null } // not allowed on some shared plans
      }
    }))
    const used = (s.dataSize ?? 0) + (s.indexSize ?? 0)
    storageCache = {
      at: Date.now(),
      data: {
        usedMb: mb(used),
        dataMb: mb(s.dataSize ?? 0),
        indexMb: mb(s.indexSize ?? 0),
        onDiskMb: mb((s.storageSize ?? 0) + (s.indexSize ?? 0)),
        limitMb: DB_STORAGE_LIMIT_MB,
        percent: Math.round((used / (DB_STORAGE_LIMIT_MB * MB)) * 1000) / 10,
        documents: s.objects ?? 0,
        collections: collections.sort((a, b) => (b.total ?? -1) - (a.total ?? -1)),
        checkedAt: new Date(),
      },
    }
  }
  res.json(storageCache.data)
}
