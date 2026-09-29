import crypto from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { IS_PROD, JWT_SECRET, SEED_DEMO_USER, SESSION_DAYS, SIGNUP_BONUS_PAISE } from './config.js'
import { tx } from './db.js'
import { User } from './models/index.js'
import { HttpError, credit, toRupees } from './wallet.js'

const COOKIE = 'sid'
const COUNTRY_CODES = new Set(['+91', '+1', '+44', '+971'])

/** "+91" + "99999 99999" → "+919999999999" */
export function normalizePhone(countryCode, phone) {
  const cc = COUNTRY_CODES.has(countryCode) ? countryCode : '+91'
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 15) throw new HttpError(400, 'Enter a valid phone number')
  return cc + digits
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters')
  if (password.length > 72) throw new HttpError(400, 'Password is too long')
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomUsername() {
  let s = 'MEMBER'
  for (let i = 0; i < 6; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)]
  return s
}

function publicUser(u) {
  return { id: String(u._id), username: u.username, phone: u.phone, createdAt: u.createdAt }
}

function setSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), v: user.sessionVersion }, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

/** Attaches req.userId when the session is valid and the account is active; otherwise 401/403. */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE]
  if (!token) return next(new HttpError(401, 'Please log in'))
  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    res.clearCookie(COOKIE, { path: '/' })
    return next(new HttpError(401, 'Session expired, please log in again'))
  }
  const user = await User.findById(payload.sub, { status: 1, sessionVersion: 1 }).lean().catch(() => null)
  if (!user || user.sessionVersion !== payload.v) {
    res.clearCookie(COOKIE, { path: '/' })
    return next(new HttpError(401, 'Session expired, please log in again'))
  }
  if (user.status === 'blocked') {
    res.clearCookie(COOKIE, { path: '/' })
    return next(new HttpError(403, 'This account has been blocked. Contact support.'))
  }
  req.userId = String(user._id)
  next()
}

// Basic brute-force protection: 10 failed logins per phone+IP per 15 minutes
const failures = new Map()
const WINDOW_MS = 15 * 60 * 1000
export function checkRateLimit(key) {
  const e = failures.get(key)
  if (e && Date.now() - e.first < WINDOW_MS && e.count >= 10) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.')
}
export function recordFailure(key) {
  const e = failures.get(key)
  if (!e || Date.now() - e.first > WINDOW_MS) failures.set(key, { count: 1, first: Date.now() })
  else e.count++
}
export const clearFailures = (key) => failures.delete(key)

async function createUser({ phone, password, inviteCode, ip }, bonusPaise) {
  const passwordHash = await bcrypt.hash(password, 10)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await tx(async (session) => {
        const [user] = await User.create(
          [{ username: randomUsername(), phone, passwordHash, inviteCode: inviteCode || undefined, signupIp: ip }],
          { session },
        )
        if (bonusPaise > 0) await credit(session, user._id, bonusPaise, { type: 'bonus', ref: 'signup' })
        return user
      })
    } catch (err) {
      // Username collision → retry with a new one; phone collision → report
      if (err?.code === 11000 && err.keyPattern?.username) continue
      if (err?.code === 11000 && err.keyPattern?.phone) throw new HttpError(409, 'An account with this phone number already exists')
      throw err
    }
  }
  throw new HttpError(500, 'Could not create account, please try again')
}

export async function seedDemoUser() {
  if (!SEED_DEMO_USER) return
  const phone = '+919999999999'
  if (await User.exists({ phone })) return
  await createUser({ phone, password: 'admin123' }, 10000 * 100)
  console.log('Seeded demo player: 9999999999 / admin123 (₹10,000)')
}

export const authRouter = Router()

authRouter.post('/signup', async (req, res) => {
  const { countryCode, phone, password, inviteCode } = req.body ?? {}
  const fullPhone = normalizePhone(countryCode, phone)
  validatePassword(password)
  if (await User.exists({ phone: fullPhone })) throw new HttpError(409, 'An account with this phone number already exists')

  const user = await createUser(
    { phone: fullPhone, password, inviteCode: typeof inviteCode === 'string' ? inviteCode.slice(0, 32) : null, ip: req.ip },
    SIGNUP_BONUS_PAISE,
  )
  const fresh = await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date(), lastLoginIp: req.ip, $inc: { loginCount: 1 } }, { new: true })
  setSession(res, fresh)
  res.status(201).json({ user: publicUser(fresh), balance: toRupees(fresh.balance) })
})

authRouter.post('/login', async (req, res) => {
  const { countryCode, phone, password } = req.body ?? {}
  const fullPhone = normalizePhone(countryCode, phone)
  const key = `u|${fullPhone}|${req.ip}`
  checkRateLimit(key)

  const user = await User.findOne({ phone: fullPhone })
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
    recordFailure(key)
    throw new HttpError(401, 'Invalid phone number or password')
  }
  if (user.status === 'blocked') throw new HttpError(403, 'This account has been blocked. Contact support.')
  clearFailures(key)

  user.lastLoginAt = new Date()
  user.lastLoginIp = req.ip
  user.loginCount += 1
  await user.save()
  setSession(res, user)
  res.json({ user: publicUser(user), balance: toRupees(user.balance) })
})

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' })
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).lean()
  res.json({ user: publicUser(user), balance: toRupees(user.balance) })
})
