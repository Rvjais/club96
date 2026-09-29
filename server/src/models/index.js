import mongoose from 'mongoose'

const { Schema, model } = mongoose
const ObjectId = Schema.Types.ObjectId

// Amounts are integers in paise everywhere.

const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  passwordChangedAt: { type: Date, default: Date.now },
  sessionVersion: { type: Number, default: 0 }, // bump to log the user out everywhere
  inviteCode: String,
  balance: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },
  signupIp: String,
  lastLoginAt: Date,
  lastLoginIp: String,
  loginCount: { type: Number, default: 0 },
}, { timestamps: true })

const transactionSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true }, // signed
  balanceAfter: { type: Number, required: true },
  type: { type: String, required: true }, // bonus | deposit | bet | win | refund | adjustment
  game: String,
  ref: String,
  note: String,
}, { timestamps: { createdAt: true, updatedAt: false } })
transactionSchema.index({ user: 1, createdAt: -1 })

const aviatorRoundSchema = new Schema({
  _id: Number,
  seed: { type: String, required: true },
  hash: { type: String, required: true },
  crashAt: { type: Number, required: true },
  startedAt: { type: Date, required: true },
  crashedAt: Date,
})

const aviatorBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  round: { type: Number, default: null }, // null while queued for the next round
  panel: { type: Number, required: true },
  amount: { type: Number, required: true },
  autoCashout: { type: Number, default: null },
  status: { type: String, required: true }, // queued | active | cashed | lost | cancelled | refunded
  cashMult: Number,
  win: { type: Number, default: 0 },
  settledAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } })
aviatorBetSchema.index({ user: 1, createdAt: -1 })
aviatorBetSchema.index({ round: 1, status: 1 })
aviatorBetSchema.index({ status: 1 })

const colorResultSchema = new Schema({
  _id: Number, // period index = floor(time / 30s)
  color: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } })

const colorBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  period: { type: Number, required: true },
  color: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'pending' }, // pending | won | lost
  result: String,
  win: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })
colorBetSchema.index({ user: 1, createdAt: -1 })
colorBetSchema.index({ period: 1, status: 1 })

const adminSchema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  lastLoginAt: Date,
}, { timestamps: true })

export const User = model('User', userSchema)
export const Transaction = model('Transaction', transactionSchema)
export const AviatorRound = model('AviatorRound', aviatorRoundSchema)
export const AviatorBet = model('AviatorBet', aviatorBetSchema)
export const ColorResult = model('ColorResult', colorResultSchema)
export const ColorBet = model('ColorBet', colorBetSchema)
export const Admin = model('Admin', adminSchema)
