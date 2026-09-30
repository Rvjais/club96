import { Transaction, User } from './models/index.js'
import { getSettings } from './settings.js'

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const toPaise = (rupees) => Math.round(Number(rupees) * 100)
export const toRupees = (paise) => paise / 100

export async function balanceOf(userId) {
  const u = await User.findById(userId, { balance: 1 }).lean()
  return u?.balance ?? 0
}

async function record(session, userId, amount, balanceAfter, meta) {
  await Transaction.create(
    [{ user: userId, amount, balanceAfter, type: meta.type, game: meta.game, ref: meta.ref == null ? undefined : String(meta.ref), note: meta.note }],
    { session },
  )
}

/**
 * Remove money atomically. Call inside tx(). Throws 400 when funds are short.
 * Bets also need the wallet to hold at least the admin-set minimum balance to play.
 */
export async function debit(session, userId, paise, meta) {
  if (!Number.isInteger(paise) || paise <= 0) throw new HttpError(400, 'Invalid amount')
  const minPlay = meta.type === 'bet' ? Math.round(getSettings('platform').minPlayBalance * 100) : 0
  const u = await User.findOneAndUpdate(
    { _id: userId, balance: { $gte: Math.max(paise, minPlay) } },
    { $inc: { balance: -paise } },
    { new: true, session, projection: { balance: 1 } },
  )
  if (!u) {
    if (minPlay > paise && (await balanceOf(userId)) >= paise) {
      throw new HttpError(400, `You need at least ₹${(minPlay / 100).toLocaleString('en-IN')} in your wallet to play. Please deposit.`)
    }
    throw new HttpError(400, 'Insufficient wallet balance')
  }
  await record(session, userId, -paise, u.balance, meta)
  return u.balance
}

/** Add money atomically. Call inside tx(). */
export async function credit(session, userId, paise, meta) {
  if (!Number.isInteger(paise) || paise <= 0) return balanceOf(userId)
  const u = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { balance: paise } },
    { new: true, session, projection: { balance: 1 } },
  )
  await record(session, userId, paise, u.balance, meta)
  return u.balance
}

export function serializeTx(t) {
  return {
    id: String(t._id),
    amount: toRupees(t.amount),
    balanceAfter: toRupees(t.balanceAfter),
    type: t.type,
    game: t.game ?? null,
    note: t.note ?? null,
    time: t.createdAt,
  }
}
