// Customer service chat, player side. Each player has one conversation with
// the admins; the admin side lives in routes/admin.js (/api/admin/support).
import { Router } from 'express'
import mongoose from 'mongoose'
import { requireAuth } from '../auth.js'
import { SupportMessage } from '../models/index.js'
import { HttpError } from '../wallet.js'

export const MAX_MESSAGE = 1000

export function serializeMessage(m) {
  return {
    id: String(m._id),
    from: m.from,
    text: m.text,
    time: m.createdAt,
    readAt: m.readAt ?? null,
  }
}

/** Trimmed message text, or a 400. */
export function messageText(body) {
  const text = String(body?.text ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) throw new HttpError(400, 'Type a message')
  if (text.length > MAX_MESSAGE) throw new HttpError(400, `Messages can be at most ${MAX_MESSAGE} characters`)
  return text
}

/**
 * Messages of one conversation, oldest first. With `after` (a message id) only newer
 * ones are returned, so clients can poll cheaply.
 */
export async function conversation(userId, after) {
  const filter = { user: userId }
  if (after && mongoose.isValidObjectId(after)) {
    filter._id = { $gt: new mongoose.Types.ObjectId(String(after)) }
    return SupportMessage.find(filter).sort({ _id: 1 }).limit(200).lean()
  }
  const rows = await SupportMessage.find(filter).sort({ _id: -1 }).limit(200).lean()
  return rows.reverse()
}

// Basic flood protection: 20 messages per player per minute
const recent = new Map()
function checkFlood(key) {
  const now = Date.now()
  const list = (recent.get(key) ?? []).filter((t) => now - t < 60_000)
  if (list.length >= 20) throw new HttpError(429, 'You are sending messages too fast. Please wait a moment.')
  list.push(now)
  recent.set(key, list)
}

export const supportRouter = Router()
supportRouter.use(requireAuth)

// Unread admin replies (for a badge on the Customer Service button)
supportRouter.get('/unread', async (req, res) => {
  res.json({ unread: await SupportMessage.countDocuments({ user: req.userId, from: 'admin', readAt: null }) })
})

// Opening / polling the chat marks admin replies as read
supportRouter.get('/messages', async (req, res) => {
  const messages = await conversation(req.userId, req.query.after)
  await SupportMessage.updateMany({ user: req.userId, from: 'admin', readAt: null }, { readAt: new Date() })
  // Read receipts for the player's own messages that the admin has since opened
  const seen = await SupportMessage.find({ user: req.userId, from: 'user', readAt: { $ne: null } }, { _id: 1 })
    .sort({ _id: -1 }).limit(1).lean()
  res.json({ messages: messages.map(serializeMessage), seenUpTo: seen[0] ? String(seen[0]._id) : null })
})

supportRouter.post('/messages', async (req, res) => {
  const text = messageText(req.body)
  checkFlood(req.userId)
  const m = await SupportMessage.create({ user: req.userId, from: 'user', text })
  res.status(201).json({ message: serializeMessage(m.toObject()) })
})
