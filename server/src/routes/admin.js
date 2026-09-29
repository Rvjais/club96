import { Router } from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { ADMIN_PASSWORD, ADMIN_SESSION_HOURS, ADMIN_USERNAME, IS_PROD, JWT_SECRET } from '../config.js'
import { tx } from '../db.js'
import { checkRateLimit, clearFailures, recordFailure, validatePassword } from '../auth.js'
import { Admin, AviatorBet, AviatorRound, ColorBet, Transaction, User } from '../models/index.js'
import { HttpError, credit, debit, serializeTx, toPaise, toRupees } from '../wallet.js'
import { periodLabel } from '../games/color.js'

const COOKIE = 'asid'
const COOKIE_PATH = '/api/admin'

// ── Seeding & auth ───────────────────────────────────────────
export async function seedAdmin() {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    if (!(await Admin.exists({}))) console.warn('No admin account: set ADMIN_USERNAME and ADMIN_PASSWORD to create one.')
    return
  }
  const existing = await Admin.findOne({ username: ADMIN_USERNAME })
  if (!existing) {
    await Admin.create({ username: ADMIN_USERNAME, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12) })
    console.log(`Created admin account "${ADMIN_USERNAME}"${process.env.ADMIN_PASSWORD ? '' : ' (dev default password: admin123)'}`)
  } else if (process.env.ADMIN_PASSWORD && !(await bcrypt.compare(ADMIN_PASSWORD, existing.passwordHash))) {
    // Keep the admin password in sync with the env var
    existing.passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
    await existing.save()
    console.log(`Updated password for admin "${ADMIN_USERNAME}" from ADMIN_PASSWORD`)
  }
}

async function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE]
  try {
    const payload = jwt.verify(token ?? '', JWT_SECRET)
    if (payload.role !== 'admin') throw new Error('not admin')
    const admin = await Admin.findById(payload.sub, { username: 1 }).lean()
    if (!admin) throw new Error('gone')
    req.admin = admin
    next()
  } catch {
    res.clearCookie(COOKIE, { path: COOKIE_PATH })
    next(new HttpError(401, 'Please log in'))
  }
}

export const adminRouter = Router()

adminRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {}
  const key = `a|${username}|${req.ip}`
  checkRateLimit(key)
  const admin = typeof username === 'string' ? await Admin.findOne({ username: username.trim() }) : null
  if (!admin || typeof password !== 'string' || !(await bcrypt.compare(password, admin.passwordHash))) {
    recordFailure(key)
    throw new HttpError(401, 'Invalid username or password')
  }
  clearFailures(key)
  admin.lastLoginAt = new Date()
  await admin.save()
  const token = jwt.sign({ sub: String(admin._id), role: 'admin' }, JWT_SECRET, { expiresIn: `${ADMIN_SESSION_HOURS}h` })
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: IS_PROD, path: COOKIE_PATH, maxAge: ADMIN_SESSION_HOURS * 3600 * 1000 })
  res.json({ admin: { username: admin.username } })
})

adminRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: COOKIE_PATH })
  res.json({ ok: true })
})

adminRouter.use(requireAdmin)

adminRouter.get('/me', (req, res) => res.json({ admin: { username: req.admin.username } }))

// ── Dashboard stats ──────────────────────────────────────────
const sumBy = async (match) => {
  const [r] = await Transaction.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }])
  return r?.total ?? 0
}

adminRouter.get('/stats', async (req, res) => {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000)
  const [users, newToday, active24h, blocked, balanceAgg, wagered, paid] = await Promise.all([
    User.estimatedDocumentCount(),
    User.countDocuments({ createdAt: { $gte: midnight } }),
    User.countDocuments({ lastLoginAt: { $gte: dayAgo } }),
    User.countDocuments({ status: 'blocked' }),
    User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
    sumBy({ type: 'bet', createdAt: { $gte: dayAgo } }),
    sumBy({ type: 'win', createdAt: { $gte: dayAgo } }),
  ])
  res.json({
    users,
    newToday,
    active24h,
    blocked,
    totalBalance: toRupees(balanceAgg[0]?.total ?? 0),
    wagered24h: toRupees(-wagered),
    paidOut24h: toRupees(paid),
    profit24h: toRupees(-wagered - paid),
  })
})

// ── Users ────────────────────────────────────────────────────
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  balance: { balance: -1 },
  lastLogin: { lastLoginAt: -1 },
}

function listUser(u) {
  return {
    id: String(u._id),
    username: u.username,
    phone: u.phone,
    balance: toRupees(u.balance),
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt ?? null,
  }
}

adminRouter.get('/users', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 20))
  const filter = {}
  const q = String(req.query.q ?? '').trim()
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i')
    filter.$or = [{ username: rx }, { phone: rx }]
  }
  if (req.query.status === 'active' || req.query.status === 'blocked') filter.status = req.query.status

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort(SORTS[req.query.sort] ?? SORTS.newest).skip((page - 1) * limit).limit(limit).lean(),
  ])
  res.json({ total, page, limit, users: users.map(listUser) })
})

async function loadUser(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'User not found')
  const user = await User.findById(id)
  if (!user) throw new HttpError(404, 'User not found')
  return user
}

adminRouter.get('/users/:id', async (req, res) => {
  const user = await loadUser(req.params.id)
  const uid = user._id

  const [byType, txs, aviator, color, aviatorCount, colorCount, biggest] = await Promise.all([
    Transaction.aggregate([{ $match: { user: uid } }, { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Transaction.find({ user: uid }).sort({ createdAt: -1 }).limit(100).lean(),
    AviatorBet.find({ user: uid }).sort({ createdAt: -1 }).limit(50).lean(),
    ColorBet.find({ user: uid }).sort({ createdAt: -1 }).limit(50).lean(),
    AviatorBet.countDocuments({ user: uid, status: { $in: ['cashed', 'lost'] } }),
    ColorBet.countDocuments({ user: uid, status: { $in: ['won', 'lost'] } }),
    Transaction.findOne({ user: uid, type: 'win' }).sort({ amount: -1 }).lean(),
  ])
  const t = Object.fromEntries(byType.map((x) => [x._id, x.total]))
  const rounds = await AviatorRound.find({ _id: { $in: [...new Set(aviator.map((b) => b.round).filter(Boolean))] } }, { crashAt: 1 }).lean()
  const crashById = new Map(rounds.map((r) => [r._id, r.crashAt]))

  const wagered = -(t.bet ?? 0) - (t.refund ?? 0) // refunds cancel their bets
  res.json({
    user: {
      id: String(uid),
      username: user.username,
      phone: user.phone,
      inviteCode: user.inviteCode ?? null,
      balance: toRupees(user.balance),
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt ?? null,
      lastLoginIp: user.lastLoginIp ?? null,
      signupIp: user.signupIp ?? null,
      loginCount: user.loginCount,
      passwordChangedAt: user.passwordChangedAt,
    },
    stats: {
      deposits: toRupees(t.deposit ?? 0),
      bonuses: toRupees(t.bonus ?? 0),
      adjustments: toRupees(t.adjustment ?? 0),
      wagered: toRupees(wagered),
      won: toRupees(t.win ?? 0),
      net: toRupees((t.win ?? 0) - wagered),
      aviatorBets: aviatorCount,
      colorBets: colorCount,
      biggestWin: toRupees(biggest?.amount ?? 0),
    },
    transactions: txs.map(serializeTx),
    aviatorBets: aviator.map((b) => ({
      id: String(b._id),
      round: b.round,
      panel: b.panel,
      amount: toRupees(b.amount),
      autoCashout: b.autoCashout,
      status: b.status,
      cashMult: b.cashMult ?? null,
      crashAt: crashById.get(b.round) ?? null,
      win: toRupees(b.win),
      time: b.createdAt,
    })),
    colorBets: color.map((b) => ({
      id: String(b._id),
      period: periodLabel(b.period),
      color: b.color,
      amount: toRupees(b.amount),
      status: b.status,
      result: b.result ?? null,
      win: toRupees(b.win),
      time: b.createdAt,
    })),
  })
})

// Credit (positive) or debit (negative) a user's wallet with a note
adminRouter.post('/users/:id/balance', async (req, res) => {
  const user = await loadUser(req.params.id)
  const paise = toPaise(req.body?.amount)
  const note = String(req.body?.note ?? '').trim().slice(0, 200)
  if (!Number.isInteger(paise) || paise === 0) throw new HttpError(400, 'Enter a non-zero amount')
  if (Math.abs(paise) > 10_000_000 * 100) throw new HttpError(400, 'Amount is too large')
  if (!note) throw new HttpError(400, 'Add a note explaining the adjustment')

  const meta = { type: 'adjustment', ref: `admin:${req.admin.username}`, note }
  const balance = await tx((s) => (paise > 0 ? credit(s, user._id, paise, meta) : debit(s, user._id, -paise, meta)))
  res.json({ balance: toRupees(balance) })
})

adminRouter.post('/users/:id/status', async (req, res) => {
  const user = await loadUser(req.params.id)
  const { status } = req.body ?? {}
  if (status !== 'active' && status !== 'blocked') throw new HttpError(400, 'Invalid status')
  user.status = status
  if (status === 'blocked') user.sessionVersion += 1 // kick them out immediately
  await user.save()
  res.json({ status: user.status })
})

adminRouter.post('/users/:id/password', async (req, res) => {
  const user = await loadUser(req.params.id)
  validatePassword(req.body?.password)
  user.passwordHash = await bcrypt.hash(req.body.password, 10)
  user.passwordChangedAt = new Date()
  user.sessionVersion += 1 // existing sessions must log in with the new password
  await user.save()
  res.json({ passwordChangedAt: user.passwordChangedAt })
})

adminRouter.post('/users/:id/logout', async (req, res) => {
  const user = await loadUser(req.params.id)
  user.sessionVersion += 1
  await user.save()
  res.json({ ok: true })
})
