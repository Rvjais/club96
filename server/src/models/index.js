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
  inviteCode: String, // code typed at sign-up
  // ── Referrals: every player gets a code; whoever's code they signed up with is their upline
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: ObjectId, ref: 'User' },
  ancestors: { type: [ObjectId], default: undefined }, // upline, closest first: [inviter, inviter's inviter, …]
  depositTotal: { type: Number, default: 0 }, // paise deposited (tracked by referral.js)
  depositCount: { type: Number, default: 0 },
  firstDepositAt: Date,
  commission: { type: Number, default: 0 }, // paise earned from the team, not yet moved to the wallet
  commissionTotal: { type: Number, default: 0 }, // paise earned all-time
  partnerClaimed: { type: [String], default: undefined }, // partner-reward tiers already paid
  balance: { type: Number, default: 0, min: 0 },
  // Bank account withdrawals are paid to (added by the player on their Account page)
  bank: {
    type: new Schema({
      accountName: String,
      accountNumber: String,
      ifsc: String,
      updatedAt: Date,
    }, { _id: false }),
    default: undefined,
  },
  status: { type: String, enum: ['active', 'blocked', 'deleted'], default: 'active' },
  // ── Deleted by the player: the account and its history stay for the admins; the phone is released
  // (phone becomes "deleted:<id>") so the player can sign up again with a new ID.
  deletedAt: Date,
  deletedPhone: String, // the phone the account had
  deletedBalance: Number, // paise forfeited on deletion
  deletedCommission: Number, // unclaimed referral commission (paise) dropped on deletion
  deleteReason: String,
  previousAccounts: { type: [ObjectId], default: undefined }, // earlier deleted accounts with the same phone
  signupIp: String,
  lastLoginAt: Date,
  lastLoginIp: String,
  loginCount: { type: Number, default: 0 },
}, { timestamps: true })

userSchema.index({ ancestors: 1 })
userSchema.index({ deletedPhone: 1 }, { sparse: true })
userSchema.index({ status: 1, deletedAt: -1 })

const transactionSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true }, // signed
  balanceAfter: { type: Number, required: true },
  type: { type: String, required: true }, // bonus | deposit | bet | win | refund | adjustment | withdraw | withdraw_refund | commission | forfeit
  game: String,
  ref: String,
  note: String,
}, { timestamps: { createdAt: true, updatedAt: false } })
transactionSchema.index({ user: 1, createdAt: -1 })
transactionSchema.index({ createdAt: -1 }) // admin dashboard ranges

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

// ── Lucky Spin: fixed price, fixed ₹ prizes, settled instantly
const spinBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true }, // price paid (paise)
  index: Number, // prize segment landed on
  prizes: [Number], // the wheel's ₹ prizes (paise) at spin time
  chance: Number, // % chance of the prize landed on
  multiplier: { type: Number, default: 0 }, // win ÷ price
  win: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })
spinBetSchema.index({ user: 1, createdAt: -1 })

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
  cfg: { type: Schema.Types.Mixed, required: true },
  state: { type: Schema.Types.Mixed, required: true },
  v: { type: Number, default: 0 },
  hands: { type: Number, default: 0 },
  rake: { type: Number, default: 0 },
  status: { type: String, required: true },
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
  settledAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false }, minimize: false })
pokerTableSchema.index({ user: 1, createdAt: -1 })
pokerTableSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } })

// ── Double (Red-Black): instant 50/50 color bet
const doubleBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  color: { type: String, enum: ['red', 'black'], required: true },
  result: { type: String, enum: ['red', 'black'], required: true },
  seed: { type: String, required: true },
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })
doubleBetSchema.index({ user: 1, createdAt: -1 })

// ── Hi-Lo Cards: guess higher/lower, streak multipliers
const hiLoBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  seed: { type: String, required: true },
  deck: { type: [String], required: true }, // remaining cards in order
  currentCard: { type: String, required: true },
  streak: { type: Number, default: 0 },
  multiplier: { type: Number, default: 1 },
  status: { type: String, enum: ['active', 'won', 'lost'], required: true },
  win: { type: Number, default: 0 },
  settledAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } })
hiLoBetSchema.index({ user: 1, createdAt: -1 })
hiLoBetSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } })

// ── Keno: pick numbers, 20 drawn per period
const kenoResultSchema = new Schema({
  _id: String, // "room:period"
  room: { type: String, required: true },
  period: { type: Number, required: true },
  numbers: { type: [Number], required: true },
  seed: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } })
kenoResultSchema.index({ room: 1, period: -1 })

const kenoBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  room: { type: String, required: true },
  period: { type: Number, required: true },
  picks: { type: [Number], required: true },
  amount: { type: Number, required: true }, // after fee
  fee: { type: Number, required: true },
  maxWin: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'won', 'lost', 'refunded'], default: 'pending' },
  drawn: { type: [Number], default: undefined },
  matches: Number,
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
  settledAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } })
kenoBetSchema.index({ user: 1, createdAt: -1 })
kenoBetSchema.index({ room: 1, period: 1, status: 1 })

// ── Blackjack: player vs dealer, hit/stand/double
const blackjackBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true }, // total staked (original + doubles)
  betAmount: { type: Number, required: true }, // current payout base (changes on double)
  deck: { type: [Number], required: true },
  playerCards: { type: [Number], required: true },
  dealerCards: { type: [Number], required: true },
  playerValue: { type: Number, required: true },
  dealerValue: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'won', 'lost', 'refunded'], required: true },
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
  result: String, // blackjack | playerWins | dealerWins | dealerBust | push | bust
  finished: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } })
blackjackBetSchema.index({ user: 1, createdAt: -1 })
blackjackBetSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } })

// ── Baccarat: player / banker / tie, fixed drawing rules
const baccaratBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  betOn: { type: String, enum: ['player', 'banker', 'tie'], required: true },
  playerCards: { type: [Number], required: true },
  bankerCards: { type: [Number], required: true },
  playerValue: { type: Number, required: true },
  bankerValue: { type: Number, required: true },
  status: { type: String, enum: ['won', 'lost', 'refunded'], required: true },
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
  result: String, // player | banker | tie
  finished: { type: Boolean, default: true },
}, { timestamps: { createdAt: true, updatedAt: false } })
baccaratBetSchema.index({ user: 1, createdAt: -1 })

// ── Scratch Cards: instant win, 3 panels, match 3 symbols to win
const scratchBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  panels: { type: [String], required: true },
  revealed: { type: Boolean, default: false },
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'won', 'lost', 'refunded'], required: true },
  result: String, // win | loss
  finished: { type: Boolean, default: true },
}, { timestamps: { createdAt: true, updatedAt: false } })
scratchBetSchema.index({ user: 1, createdAt: -1 })
scratchBetSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } })

// ── Teen Patti: 3-card vs house, play/fold, optional Pair+ side bet
const teenPattiBetSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true }, // total staked (ante + play + pair+)
  ante: { type: Number, required: true },
  pairPlus: { type: Number, default: 0 },
  deck: { type: [String], required: true },
  playerCards: { type: [String], required: true },
  dealerCards: { type: [String], required: true },
  playerRank: { type: Number, required: true },
  dealerRank: { type: Number, required: true },
  status: { type: String, enum: ['active', 'won', 'lost', 'refunded'], required: true },
  multiplier: { type: Number, default: 0 },
  win: { type: Number, default: 0 },
  result: String, // playerWins | dealerWins | push | folded
  finished: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } })
teenPattiBetSchema.index({ user: 1, createdAt: -1 })
teenPattiBetSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } })

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

// ── Deposits: the player opens an order, pays the admin's UPI QR, then submits the UTR; an admin confirms and credits.
// unpaid (order open, no UTR yet) → pending (UTR submitted) → approved | rejected; unpaid orders can also be cancelled or expire.
const depositSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  orderNo: { type: String, unique: true, sparse: true }, // shown to the player, e.g. RC20261001032237a1b2c3d4e5f6
  amount: { type: Number, required: true }, // paise the player said they paid
  utr: String, // UPI transaction reference from the player's app (set when the order is paid)
  upiId: String, // the UPI ID shown to the player at the time
  payeeName: String,
  expiresAt: Date, // pay-by time for an unpaid order
  status: { type: String, enum: ['unpaid', 'pending', 'approved', 'rejected', 'cancelled', 'expired'], default: 'pending', index: true },
  credited: Number, // paise actually credited on approval (the amount received)
  adminNote: String,
  processedBy: String,
  processedAt: Date,
}, { timestamps: true })
depositSchema.index({ status: 1, createdAt: -1 })
depositSchema.index({ utr: 1 })

// ── Customer service chat: one conversation per player with the admins
const supportMessageSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true }, // the player whose conversation this is
  from: { type: String, enum: ['user', 'admin'], required: true },
  admin: String, // admin username, on admin replies
  text: { type: String, required: true },
  readAt: Date, // when the other side opened it
}, { timestamps: { createdAt: true, updatedAt: false } })
supportMessageSchema.index({ user: 1, createdAt: -1 })
supportMessageSchema.index({ from: 1, readAt: 1 })

// ── Referral commission: one bucket per earner, subordinate, level and day (IST), incremented as bets/deposits come in
const commissionSchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true }, // who earns
  from: { type: ObjectId, ref: 'User', required: true }, // the subordinate who bet / deposited
  level: { type: Number, required: true }, // 1 = direct invite
  day: { type: String, required: true }, // YYYY-MM-DD, India time
  bet: { type: Number, default: 0 }, // paise wagered (refunds subtracted)
  betComm: { type: Number, default: 0 },
  deposit: { type: Number, default: 0 },
  depositComm: { type: Number, default: 0 },
}, { timestamps: true })
commissionSchema.index({ user: 1, from: 1, level: 1, day: 1 }, { unique: true })
commissionSchema.index({ user: 1, day: -1 })

// Small key/value store for server bookkeeping (e.g. the referral job's progress)
const metaSchema = new Schema({
  _id: String,
  value: Schema.Types.Mixed,
}, { timestamps: true })

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
export const SpinBet = model('SpinBet', spinBetSchema)
export const WingoResult = model('WingoResult', wingoResultSchema)
export const WingoBet = model('WingoBet', wingoBetSchema)
export const PokerTable = model('PokerTable', pokerTableSchema)
export const DoubleBet = model('DoubleBet', doubleBetSchema)
export const HiLoBet = model('HiLoBet', hiLoBetSchema)
export const KenoResult = model('KenoResult', kenoResultSchema)
export const KenoBet = model('KenoBet', kenoBetSchema)
export const BlackjackBet = model('BlackjackBet', blackjackBetSchema)
export const BaccaratBet = model('BaccaratBet', baccaratBetSchema)
export const ScratchBet = model('ScratchBet', scratchBetSchema)
export const TeenPattiBet = model('TeenPattiBet', teenPattiBetSchema)
export const Admin = model('Admin', adminSchema)
export const Withdrawal = model('Withdrawal', withdrawalSchema)
export const Deposit = model('Deposit', depositSchema)
export const SupportMessage = model('SupportMessage', supportMessageSchema)
export const Commission = model('Commission', commissionSchema)
export const Meta = model('Meta', metaSchema)
export const GameSettings = model('GameSettings', gameSettingsSchema)
export const SettingsLog = model('SettingsLog', settingsLogSchema)
