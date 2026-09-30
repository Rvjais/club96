import mongoose from 'mongoose'

const { Schema, model } = mongoose
const ObjectId = Schema.Types.ObjectId

// Amounts are integers in paise everywhere.

const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  uid: { type: Number, unique: true, sparse: true }, // short public ID shown to the player
  displayName: { type: String, trim: true },
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
  type: { type: String, required: true }, // bonus | deposit | bet | win | refund | adjustment | withdraw | withdraw_refund
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
  // Settings the crash point was generated with (for fairness verification)
  houseEdge: Number,
  instantCrash: Number,
  maxMultiplier: Number,
  curve: { type: [{ _id: false, mult: Number, chance: Number }], default: undefined }, // custom odds, if any
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
  multiplier: Number, // payout locked in when the bet was placed
  status: { type: String, default: 'pending' }, // pending | won | lost
  result: String,
  win: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })
colorBetSchema.index({ user: 1, createdAt: -1 })
colorBetSchema.index({ period: 1, status: 1 })

// ── Mines: 5×5 grid; the round stays `active` until cash-out or a mine
const minesBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  mines: { type: Number, required: true },
  houseEdge: Number, // locked in when the round starts
  ladder: [Number], // payout after 1, 2, … gems, locked in when the round starts
  maxWin: Number, // ₹ cap locked in when the round starts
  minePositions: { type: [Number], required: true }, // secret until the round ends
  picks: { type: [Number], default: [] },
  hit: Number, // the mine that ended the round
  status: { type: String, required: true }, // active | won | lost
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
  settledAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } })
minesBetSchema.index({ user: 1, createdAt: -1 })
minesBetSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } }) // one round at a time

// ── Tower: climb level by level; one pick per level
const towerBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  mode: { type: String, required: true }, // easy | medium | hard | expert
  levels: { type: Number, required: true },
  houseEdge: Number,
  ladder: [Number], // payout per level, locked in when the round starts
  maxWin: Number,
  safe: { type: [[Number]], required: true }, // safe columns per level — secret until the round ends
  picks: { type: [Number], default: [] },
  status: { type: String, required: true }, // active | won | lost
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
  settledAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } })
towerBetSchema.index({ user: 1, createdAt: -1 })
towerBetSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } })

// ── Plinko: settled instantly; path is the left(0)/right(1) bounce per row
const plinkoBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  rows: { type: Number, required: true },
  risk: { type: String, required: true },
  path: [Number],
  bucket: Number,
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })
plinkoBetSchema.index({ user: 1, createdAt: -1 })

// ── Dice: settled instantly; roll 0.00–99.99
const diceBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  direction: { type: String, required: true }, // over | under
  target: { type: Number, required: true },
  chance: Number,
  payout: Number, // multiplier offered for this roll
  roll: Number,
  won: Boolean,
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })
diceBetSchema.index({ user: 1, createdAt: -1 })

// ── Wheel: settled instantly; every segment equally likely
const wheelBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  risk: { type: String, required: true },
  segments: Number,
  index: Number,
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })
wheelBetSchema.index({ user: 1, createdAt: -1 })

// ── Win Go: a digit 0–9 is drawn at the end of every period, in four rooms (30s / 1m / 3m / 5m)
const wingoResultSchema = new Schema({
  _id: String, // "<room>:<period index>"
  room: { type: String, required: true },
  period: { type: Number, required: true }, // floor(time / room length)
  number: { type: Number, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } })
wingoResultSchema.index({ room: 1, period: -1 })

const wingoBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  room: { type: String, required: true },
  period: { type: Number, required: true },
  pick: { type: String, required: true }, // green | red | violet | big | small | 0–9
  amount: { type: Number, required: true }, // paise staked (fee included)
  fee: Number, // % service fee locked in when the bet was placed
  payouts: Schema.Types.Mixed, // payout table locked in when the bet was placed
  maxWin: Number, // ₹ cap locked in when the bet was placed
  status: { type: String, default: 'pending' }, // pending | won | lost
  result: Number,
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })
wingoBetSchema.index({ user: 1, createdAt: -1 })
wingoBetSchema.index({ room: 1, period: 1, status: 1 })
wingoBetSchema.index({ status: 1, period: 1 })

// ── Poker: one sitting at a Texas Hold'em table against house bots.
// `amount` = everything bought in, `win` = the stack cashed out on leaving.
const pokerTableSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  cfg: { type: Schema.Types.Mixed, required: true }, // blinds, rake and bot settings locked in when seated
  state: { type: Schema.Types.Mixed, required: true }, // the table (see games/pokerEngine.js) — holds the deck, never sent as-is
  v: { type: Number, default: 0 }, // bumped on every save so two taps can't act twice
  hands: { type: Number, default: 0 },
  rake: { type: Number, default: 0 },
  status: { type: String, required: true }, // active | won | lost
  multiplier: { type: Number, default: 0 }, // cash-out ÷ buy-in
  win: { type: Number, default: 0 },
  settledAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false }, minimize: false })
pokerTableSchema.index({ user: 1, createdAt: -1 })
pokerTableSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } }) // one table at a time

const adminSchema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  lastLoginAt: Date,
}, { timestamps: true })

const withdrawalSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true }, // paise, held from the wallet when requested
  method: { type: String, enum: ['upi', 'bank'], required: true },
  details: {
    upiId: String,
    accountName: String,
    accountNumber: String,
    ifsc: String,
  },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  adminNote: String,
  reference: String, // e.g. UPI transaction ID of the payout
  processedBy: String,
  processedAt: Date,
}, { timestamps: true })
withdrawalSchema.index({ status: 1, createdAt: -1 })

const gameSettingsSchema = new Schema({
  _id: String, // game key
  data: { type: Schema.Types.Mixed, required: true },
  updatedBy: String,
}, { timestamps: true, minimize: false })

const settingsLogSchema = new Schema({
  game: { type: String, required: true },
  admin: String,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } })

export const User = model('User', userSchema)
export const Transaction = model('Transaction', transactionSchema)
export const AviatorRound = model('AviatorRound', aviatorRoundSchema)
export const AviatorBet = model('AviatorBet', aviatorBetSchema)
export const ColorResult = model('ColorResult', colorResultSchema)
export const ColorBet = model('ColorBet', colorBetSchema)
export const MinesBet = model('MinesBet', minesBetSchema)
export const TowerBet = model('TowerBet', towerBetSchema)
export const PlinkoBet = model('PlinkoBet', plinkoBetSchema)
export const DiceBet = model('DiceBet', diceBetSchema)
export const WheelBet = model('WheelBet', wheelBetSchema)
export const WingoResult = model('WingoResult', wingoResultSchema)
export const WingoBet = model('WingoBet', wingoBetSchema)
export const PokerTable = model('PokerTable', pokerTableSchema)
export const Admin = model('Admin', adminSchema)
export const Withdrawal = model('Withdrawal', withdrawalSchema)
export const GameSettings = model('GameSettings', gameSettingsSchema)
export const SettingsLog = model('SettingsLog', settingsLogSchema)
