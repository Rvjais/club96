// ─────────────────────────────────────────────────────────────
// Thai Lottery 2D/3D — pick 2 or 3 digits, then a digit draw:
//   2D exact (leads zeros allowed) … pays 85x
//   2D box (two different digits, either order) … pays 40x
//   3D exact … pays 800x
//   3D box, all digits different (6 orders) … pays 120x
//   3D box, one pair (3 orders) … pays 240x
// Instant resolve. House edge 15–20% (lottery style).
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { ThaiLotteryBet } from '../models/index.js'
import { HttpError, balanceOf, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

const GAME = 'thaiLottery'

const SETTLE = {
  '2d-exact': 85,
  '2d-box': 40,
  '3d-exact': 800,
  '3d-box': 0, // resolved by permutation count below
}
const BOX3_SIX = 120 // all three digits different
const BOX3_PAIR = 240 // exactly one pair among the three digits

function serialize(b) {
  return {
    id: String(b._id),
    amount: toRupees(b.amount),
    mode: b.mode, // 2d | 3d
    betType: b.betType, // exact | box
    pick: b.pick,
    draw: b.draw,
    seed: b.seed,
    status: b.status,
    multiplier: b.multiplier,
    win: toRupees(b.win),
    time: b.createdAt,
  }
}

async function snapshotFor(userId) {
  const [balance, recent] = await Promise.all([
    balanceOf(userId),
    ThaiLotteryBet.find({ user: userId }).sort({ createdAt: -1 }).limit(30).lean(),
  ])
  const cfg = getSettings(GAME)
  return {
    balance: toRupees(balance),
    rules: {
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      maxWin: cfg.maxWin,
      payouts: { '2d-exact': 85, '2d-box': 40, '3d-exact': 800, '3d-box-6way': BOX3_SIX, '3d-box-pair': BOX3_PAIR },
    },
    history: recent.map(serialize),
  }
}

/** does the pick (digit string) match the draw given the bet type? */
function match(mode, betType, pick, draw) {
  if (mode === '2d') {
    if (betType === 'exact') return pick === draw
    // box: same multiset of digits (two different digits required)
    return pick[0] !== pick[1] && [...pick].sort().join('') === [...draw].sort().join('')
  }
  if (betType === 'exact') return pick === draw
  // 3D box: draw reshuffled equals the pick (pick must not be a triple)
  return [...pick].sort().join('') === [...draw].sort().join('')
}

export const thaiLotteryRouter = Router()
thaiLotteryRouter.use(requireAuth)

thaiLotteryRouter.get('/state', async (req, res) => res.json(await snapshotFor(req.userId)))

thaiLotteryRouter.post('/bet', async (req, res) => {
  const cfg = getSettings(GAME)
  if (!cfg.enabled) throw new HttpError(403, 'Thai Lottery is paused. Please try again later.')

  const mode = String(req.body?.mode) === '3d' ? '3d' : '2d'
  const betType = String(req.body?.betType) === 'box' ? 'box' : 'exact'
  const pick = String(req.body?.pick ?? '').trim()

  if (!/^\d{2,3}$/.test(pick) || pick.length !== (mode === '2d' ? 2 : 3)) {
    throw new HttpError(400, `Enter ${mode === '2d' ? 'two' : 'three'} digits (0-9)`)
  }
  if (betType === 'box') {
    if (mode === '2d' && pick[0] === pick[1]) throw new HttpError(400, 'Box bet needs two different digits')
    if (mode === '3d' && new Set(pick).size === 1) throw new HttpError(400, 'A triple cannot be a box bet — use exact')
  }

  const paise = toPaise(req.body?.amount)
  if (!Number.isInteger(paise) || paise < Math.round(cfg.minBet * 100)) {
    throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  }
  if (paise > Math.round(cfg.maxBet * 100)) {
    throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  }

  const seed = crypto.randomBytes(32).toString('hex')
  const digits = (mode === '2d' ? 2 : 3)
  const draw = Array.from({ length: digits }, () => crypto.randomInt(0, 10)).join('')

  let result = 'lose'
  let multiplier = 0
  let win = 0

  if (match(mode, betType, pick, draw)) {
    if (mode === '2d') {
      multiplier = SETTLE['2d-exact']
    } else if (betType === 'exact') {
      multiplier = SETTLE['3d-exact']
    } else if (new Set(pick).size === 1) {
      multiplier = SETTLE['3d-exact'] // impossible for box (validated), defensive
    } else if (new Set(pick).size === 2) {
      multiplier = BOX3_PAIR // one pair drawn: 3 permutations
    } else {
      multiplier = BOX3_SIX // six permutations
    }
    result = 'win'
    win = Math.min(Math.floor(paise * multiplier), Math.round(cfg.maxWin * 100))
  }

  await tx(async (session) => {
    await debit(session, req.userId, paise, { type: 'bet', game: GAME })
    await ThaiLotteryBet.create([{
      user: req.userId,
      amount: paise,
      mode,
      betType,
      pick,
      draw,
      seed,
      status: result === 'win' ? 'won' : 'lost',
      multiplier,
      win,
    }], { session })
    if (win > 0) await credit(session, req.userId, win, { type: 'win', game: GAME })
  })

  res.json(await snapshotFor(req.userId))
})

export async function startThaiLottery() {
  console.log('Thai Lottery ready')
}
