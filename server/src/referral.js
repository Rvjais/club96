// ─────────────────────────────────────────────────────────────
// Referral / agency programme.
//
// Every player has a referral code. Signing up with someone's code puts
// the new player under them; `ancestors` keeps the whole upline (closest
// first), so level 1 = direct inviter, level 2 = their inviter, and so on.
//
// A background job reads new wallet transactions in order and pays the
// upline its admin-set commission on every bet (refunds are taken back)
// and on deposits. Commission collects in `user.commission` until the
// player claims it into their wallet.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import mongoose from 'mongoose'
import { tx } from './db.js'
import { requireAuth } from './auth.js'
import { Commission, Meta, Transaction, User } from './models/index.js'
import { HttpError, credit, toPaise, toRupees } from './wallet.js'
import { REFERRAL_MAX_LEVELS, getSettings } from './settings.js'

const { ObjectId } = mongoose.Types

// ── Codes & sign-up ──────────────────────────────────────────
export const newCode = () => String(crypto.randomInt(100_000_000_000, 1_000_000_000_000)) // 12 digits

/** Give a user a unique referral code if they don't have one yet (older accounts). */
export async function ensureReferralCode(user) {
  if (user.referralCode) return user
  for (let i = 0; i < 10; i++) {
    try {
      const updated = await User.findOneAndUpdate({ _id: user._id, referralCode: { $exists: false } }, { referralCode: newCode() }, { new: true }).lean()
      return updated ?? (await User.findById(user._id).lean())
    } catch (err) {
      if (err?.code !== 11000) throw err
    }
  }
  return user
}

/**
 * Upline fields for a new account signing up with `code`.
 * An empty code → no inviter; an unknown one → 400.
 */
export async function referralFields(code) {
  const fields = {}
  const clean = String(code ?? '').trim()
  if (!clean) return fields
  const inviter = /^\d{6,14}$/.test(clean)
    ? await User.findOne({ referralCode: clean, status: { $ne: 'deleted' } }, { ancestors: 1 }).lean()
    : null
  if (!inviter) throw new HttpError(400, 'Invite code not found. Check the code or leave it empty.')
  fields.referredBy = inviter._id
  fields.ancestors = [inviter._id, ...(inviter.ancestors ?? [])].slice(0, REFERRAL_MAX_LEVELS)
  return fields
}

// ── Commission job ───────────────────────────────────────────
const CURSOR = 'referralCursor'
const BATCH = 2000
const LAG_MS = 15_000 // leave recent transactions until their DB transaction has surely committed
const IST_MS = 5.5 * 60 * 60 * 1000

/** YYYY-MM-DD in India time. */
export const istDay = (d = new Date()) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10)
const addDays = (day, n) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10)

async function processBatch() {
  let cursor = (await Meta.findById(CURSOR).lean())?.value
  if (!cursor) {
    // First run: start from now; nothing before the referral system existed earns commission
    const last = await Transaction.findOne({}, { _id: 1 }).sort({ _id: -1 }).lean()
    cursor = String(last?._id ?? ObjectId.createFromTime(0))
    await Meta.updateOne({ _id: CURSOR }, { value: cursor }, { upsert: true })
    return 0
  }

  const txs = await Transaction.find(
    { _id: { $gt: new ObjectId(cursor) }, createdAt: { $lt: new Date(Date.now() - LAG_MS) }, type: { $in: ['bet', 'refund', 'deposit'] } },
    { user: 1, amount: 1, type: 1, createdAt: 1 },
  ).sort({ _id: 1 }).limit(BATCH).lean()
  if (!txs.length) return 0

  // Only players with an upline matter
  const players = await User.find(
    { _id: { $in: [...new Set(txs.map((t) => String(t.user)))] }, 'ancestors.0': { $exists: true } },
    { ancestors: 1, depositCount: 1 },
  ).lean()
  const byId = new Map(players.map((u) => [String(u._id), u]))
  const cfg = getSettings('referral')
  // Upline members who deleted their account earn nothing
  const uplineIds = [...new Set(players.flatMap((u) => u.ancestors.map(String)))]
  const gone = new Set((await User.find({ _id: { $in: uplineIds }, status: 'deleted' }, { _id: 1 }).lean()).map((u) => String(u._id)))
  const next = String(txs.at(-1)._id)

  await tx(async (session) => {
    const buckets = new Map() // earner|from|level|day → sums (paise, fractional until the end)
    const earned = new Map() // earner → paise
    const deposits = new Map() // player → { total, count, first }

    for (const t of txs) {
      const u = byId.get(String(t.user))
      if (!u) continue
      const day = istDay(t.createdAt)
      let bet = 0
      let deposit = 0
      if (t.type === 'deposit') {
        const d = deposits.get(String(u._id)) ?? { total: 0, count: 0, first: null }
        const isFirst = (u.depositCount ?? 0) + d.count === 0
        d.total += t.amount
        d.count += 1
        if (isFirst) d.first = t.createdAt
        deposits.set(String(u._id), d)
        if (cfg.depositMode === 'all' || isFirst) deposit = t.amount
      } else {
        bet = -t.amount // bet rows are negative, refunds positive → a refund takes its bet back
      }

      u.ancestors.slice(0, cfg.levels.length).forEach((earner, i) => {
        const rate = cfg.levels[i]
        const key = `${earner}|${u._id}|${i + 1}|${day}`
        const b = buckets.get(key) ?? { user: earner, from: u._id, level: i + 1, day, bet: 0, betComm: 0, deposit: 0, depositComm: 0 }
        b.bet += bet
        b.deposit += deposit
        if (cfg.enabled && !gone.has(String(earner))) {
          b.betComm += (bet * rate.bet) / 100
          b.depositComm += (deposit * rate.deposit) / 100
        }
        buckets.set(key, b)
      })
    }

    const ops = []
    for (const b of buckets.values()) {
      const inc = { bet: b.bet, deposit: b.deposit, betComm: Math.round(b.betComm), depositComm: Math.round(b.depositComm) }
      if (!inc.bet && !inc.deposit) continue
      ops.push({ updateOne: { filter: { user: b.user, from: b.from, level: b.level, day: b.day }, update: { $inc: inc }, upsert: true } })
      const key = String(b.user)
      earned.set(key, (earned.get(key) ?? 0) + inc.betComm + inc.depositComm)
    }
    if (ops.length) await Commission.bulkWrite(ops, { session, ordered: false })

    const userOps = []
    for (const [id, paise] of earned) {
      if (paise) userOps.push({ updateOne: { filter: { _id: id }, update: { $inc: { commission: paise, commissionTotal: paise } } } })
    }
    for (const [id, d] of deposits) {
      userOps.push({
        updateOne: {
          filter: { _id: id },
          update: { $inc: { depositTotal: d.total, depositCount: d.count }, ...(d.first ? { $set: { firstDepositAt: d.first } } : {}) },
        },
      })
    }
    if (userOps.length) await User.bulkWrite(userOps, { session, ordered: false })
    await Meta.updateOne({ _id: CURSOR }, { value: next }, { session, upsert: true })
  })
  return txs.length
}

let running = false
async function tick() {
  if (running) return
  running = true
  try {
    while ((await processBatch()) === BATCH) { /* keep going while there's a backlog */ }
  } catch (err) {
    console.error('Referral commission job failed:', err)
  }
  running = false
}

export function startReferrals() {
  tick()
  setInterval(tick, 15_000).unref()
}

// ── Player API (/api/promotion) ──────────────────────────────
export const promotionRouter = Router()
promotionRouter.use(requireAuth)

const PAGE_SIZE = 20
const maskPhone = (p) => (p ? `${p.slice(0, -7)}****${p.slice(-3)}` : '')

/** Registered / depositing members under `me`: direct (level 1) and the rest of the team. */
async function teamStats(me) {
  const rows = await User.aggregate([
    { $match: { ancestors: me } },
    {
      $group: {
        _id: { $eq: [{ $arrayElemAt: ['$ancestors', 0] }, me] },
        register: { $sum: 1 },
        depositNumber: { $sum: { $ifNull: ['$depositCount', 0] } },
        depositAmount: { $sum: { $ifNull: ['$depositTotal', 0] } },
        firstDeposit: { $sum: { $cond: [{ $gt: ['$depositCount', 0] }, 1, 0] } },
      },
    },
  ])
  const pick = (direct) => {
    const r = rows.find((x) => x._id === direct)
    return { register: r?.register ?? 0, depositNumber: r?.depositNumber ?? 0, depositAmount: toRupees(r?.depositAmount ?? 0), firstDeposit: r?.firstDeposit ?? 0 }
  }
  return { direct: pick(true), team: pick(false) }
}

async function commissionOn(me, days) {
  const rows = await Commission.aggregate([
    { $match: { user: me, day: { $in: days } } },
    { $group: { _id: '$day', total: { $sum: { $add: ['$betComm', '$depositComm'] } } } },
  ])
  return Object.fromEntries(days.map((d) => [d, toRupees(rows.find((r) => r._id === d)?.total ?? 0)]))
}

function publicConfig(cfg) {
  return {
    enabled: cfg.enabled,
    levels: cfg.levels,
    depositMode: cfg.depositMode,
    minClaim: cfg.minClaim,
    tiers: cfg.tiers,
  }
}

promotionRouter.get('/', async (req, res) => {
  const me = new ObjectId(req.userId)
  const user = await ensureReferralCode(await User.findById(me).lean())
  const today = istDay()
  const yesterday = addDays(today, -1)
  const [stats, byDay] = await Promise.all([teamStats(me), commissionOn(me, [today, yesterday])])
  res.json({
    code: user.referralCode,
    commission: {
      available: toRupees(user.commission ?? 0),
      total: toRupees(user.commissionTotal ?? 0),
      today: byDay[today],
      yesterday: byDay[yesterday],
    },
    ...stats,
    config: publicConfig(getSettings('referral')),
  })
})

// Subordinates, newest first; ?level=1…N (default all)
promotionRouter.get('/subordinates', async (req, res) => {
  const me = new ObjectId(req.userId)
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const level = parseInt(req.query.level)
  const filter = level >= 1 && level <= REFERRAL_MAX_LEVELS ? { [`ancestors.${level - 1}`]: me } : { ancestors: me }
  const [total, rows] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter, { uid: 1, phone: 1, deletedPhone: 1, ancestors: 1, depositTotal: 1, createdAt: 1 })
      .sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
  ])
  const sums = await Commission.aggregate([
    { $match: { user: me, from: { $in: rows.map((r) => r._id) } } },
    { $group: { _id: '$from', bet: { $sum: '$bet' }, commission: { $sum: { $add: ['$betComm', '$depositComm'] } } } },
  ])
  const sumOf = new Map(sums.map((s) => [String(s._id), s]))
  res.json({
    page,
    pageSize: PAGE_SIZE,
    total,
    items: rows.map((r) => ({
      uid: r.uid ?? null,
      phone: maskPhone(r.deletedPhone ?? r.phone),
      level: r.ancestors.findIndex((a) => a.equals(me)) + 1,
      joinedAt: r.createdAt,
      deposit: toRupees(r.depositTotal ?? 0),
      bet: toRupees(sumOf.get(String(r._id))?.bet ?? 0),
      commission: toRupees(sumOf.get(String(r._id))?.commission ?? 0),
    })),
  })
})

// Commission earned per day, newest first
promotionRouter.get('/commissions', async (req, res) => {
  const me = new ObjectId(req.userId)
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const [rows, countRows] = await Promise.all([
    Commission.aggregate([
      { $match: { user: me } },
      {
        $group: {
          _id: '$day',
          bet: { $sum: '$bet' },
          betComm: { $sum: '$betComm' },
          deposit: { $sum: '$deposit' },
          depositComm: { $sum: '$depositComm' },
          people: { $addToSet: '$from' },
        },
      },
      { $sort: { _id: -1 } },
      { $skip: (page - 1) * PAGE_SIZE },
      { $limit: PAGE_SIZE },
    ]),
    Commission.aggregate([{ $match: { user: me } }, { $group: { _id: '$day' } }, { $count: 'n' }]),
  ])
  res.json({
    page,
    pageSize: PAGE_SIZE,
    total: countRows[0]?.n ?? 0,
    items: rows.map((r) => ({
      day: r._id,
      people: r.people.length,
      bet: toRupees(r.bet),
      betCommission: toRupees(r.betComm),
      deposit: toRupees(r.deposit),
      depositCommission: toRupees(r.depositComm),
      total: toRupees(r.betComm + r.depositComm),
    })),
  })
})

// Move collected commission into the wallet
promotionRouter.post('/claim', async (req, res) => {
  const cfg = getSettings('referral')
  const result = await tx(async (session) => {
    const u = await User.findById(req.userId, { commission: 1 }).session(session).lean()
    const paise = u?.commission ?? 0
    if (paise <= 0) throw new HttpError(400, 'No commission to claim yet')
    if (paise < toPaise(cfg.minClaim)) throw new HttpError(400, `You can claim once you have at least ₹${cfg.minClaim.toLocaleString('en-IN')}`)
    await User.updateOne({ _id: req.userId }, { $inc: { commission: -paise } }, { session })
    const balance = await credit(session, req.userId, paise, { type: 'commission', ref: 'referral', note: 'Agency commission' })
    return { paise, balance }
  })
  res.json({ claimed: toRupees(result.paise), balance: toRupees(result.balance) })
})

// Partner rewards: tiers with progress
const tierKey = (t) => `${t.invites}:${t.deposit}`

async function partnerTiers(me, claimed) {
  const cfg = getSettings('referral')
  const counts = await Promise.all(cfg.tiers.map((t) =>
    User.countDocuments({ 'ancestors.0': me, depositTotal: { $gte: Math.max(1, toPaise(t.deposit)) } })))
  return cfg.tiers.map((t, i) => ({
    ...t,
    key: tierKey(t),
    qualified: counts[i],
    claimed: (claimed ?? []).includes(tierKey(t)),
  }))
}

promotionRouter.get('/partner', async (req, res) => {
  const me = new ObjectId(req.userId)
  const user = await User.findById(me, { partnerClaimed: 1 }).lean()
  res.json({ enabled: getSettings('referral').enabled, tiers: await partnerTiers(me, user.partnerClaimed) })
})

promotionRouter.post('/partner/claim', async (req, res) => {
  const me = new ObjectId(req.userId)
  if (!getSettings('referral').enabled) throw new HttpError(403, 'The agency programme is paused')
  const user = await User.findById(me, { partnerClaimed: 1 }).lean()
  const tier = (await partnerTiers(me, user.partnerClaimed)).find((t) => t.key === req.body?.key)
  if (!tier) throw new HttpError(404, 'This reward is no longer available')
  if (tier.claimed) throw new HttpError(409, 'You already claimed this reward')
  if (tier.qualified < tier.invites) throw new HttpError(400, `Invite ${tier.invites - tier.qualified} more player(s) who deposit ₹${tier.deposit.toLocaleString('en-IN')}+`)
  const paise = toPaise(tier.reward)
  const balance = await tx(async (session) => {
    const upd = await User.updateOne({ _id: me, partnerClaimed: { $ne: tier.key } }, { $push: { partnerClaimed: tier.key } }, { session })
    if (!upd.modifiedCount) throw new HttpError(409, 'You already claimed this reward')
    return credit(session, me, paise, { type: 'bonus', ref: 'partner', note: `Partner reward: ${tier.invites} invitee(s)` })
  })
  res.json({ claimed: tier.reward, balance: toRupees(balance) })
})

// ── Admin helper ─────────────────────────────────────────────
/** Referral summary for the admin user page. */
export async function adminReferralInfo(user) {
  const me = user._id
  const [inviter, stats] = await Promise.all([
    user.referredBy ? User.findById(user.referredBy, { uid: 1, username: 1, displayName: 1, phone: 1 }).lean() : null,
    teamStats(me),
  ])
  return {
    code: user.referralCode ?? null,
    inviter: inviter && { id: String(inviter._id), uid: inviter.uid ?? null, name: inviter.displayName || inviter.username, phone: inviter.phone },
    ...stats,
    commission: toRupees(user.commission ?? 0),
    commissionTotal: toRupees(user.commissionTotal ?? 0),
    depositTotal: toRupees(user.depositTotal ?? 0),
    partnerClaimed: user.partnerClaimed?.length ?? 0,
  }
}
