// ─────────────────────────────────────────────────────────────
// Color Prediction (retired — replaced by Win Go, see wingo.js).
// Only kept so past bets still show in player / admin history, and so
// any bet left unsettled when the game was retired is refunded.
// ─────────────────────────────────────────────────────────────
import { tx } from '../db.js'
import { ColorBet } from '../models/index.js'
import { credit } from '../wallet.js'

const PERIOD_MS = 30000

/** 20260930 + sequence within the day, e.g. 202609300421 */
export function periodLabel(idx) {
  const start = new Date(idx * PERIOD_MS)
  const y = start.getFullYear()
  const m = String(start.getMonth() + 1).padStart(2, '0')
  const d = String(start.getDate()).padStart(2, '0')
  const midnight = new Date(y, start.getMonth(), start.getDate()).getTime()
  const seq = Math.floor((idx * PERIOD_MS - midnight) / PERIOD_MS) + 1
  return `${y}${m}${d}${String(seq).padStart(4, '0')}`
}

/** Return the stake of every Color Prediction bet that was never drawn. */
export async function refundRetiredColorBets() {
  const pending = await ColorBet.find({ status: 'pending' }).lean()
  for (const bet of pending) {
    await tx(async (session) => {
      const upd = await ColorBet.updateOne({ _id: bet._id, status: 'pending' }, { status: 'refunded' }, { session })
      if (upd.modifiedCount) {
        await credit(session, bet.user, bet.amount, { type: 'refund', game: 'color', ref: bet._id, note: 'Color Prediction retired — bet refunded' })
      }
    })
  }
  if (pending.length) console.log(`Refunded ${pending.length} unsettled Color Prediction bet(s)`)
}
