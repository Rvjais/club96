// ─────────────────────────────────────────────────────────────
// Game settings — odds, payouts, bet limits and on/off switch per game.
// Edited from the admin panel, published to players in each game, and
// every change is logged. Odds changes apply from the next round/period.
// ─────────────────────────────────────────────────────────────
import { GameSettings, SettingsLog } from './models/index.js'
import { HttpError } from './wallet.js'

export const DEFAULTS = {
  aviator: {
    enabled: true,
    houseEdge: 3, // % kept by the house on every cash-out target
    instantCrash: 3, // % of rounds that crash at 1.00x
    maxMultiplier: 1000,
    minBet: 1,
    maxBet: 10000,
    // Optional custom odds: [{ mult, chance }] = % of rounds that reach `mult`.
    // Empty → the house-edge formula decides how far rounds fly.
    curve: [],
  },
  wingo: {
    enabled: true,
    rooms: { '30s': true, '1m': true, '3m': true, '5m': true }, // which round lengths are open
    lockSeconds: 5, // betting closes this long before each draw
    fee: 2, // % service fee taken from every stake before payouts are worked out
    weights: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // % chance of drawing 0–9
    payouts: {
      size: 2, // Big (5–9) / Small (0–4)
      color: 2, // Green on 1·3·7·9, Red on 2·4·6·8
      colorSplit: 1.5, // Green on 5, Red on 0 (those numbers are also Violet)
      violet: 4.5, // 0 or 5
      number: 9, // exact digit
    },
    minBet: 1,
    maxBet: 100000,
    maxWin: 1000000,
  },
  mines: {
    enabled: true,
    houseEdge: 3,
    minMines: 1,
    maxMines: 24,
    minBet: 10,
    maxBet: 10000,
    maxWin: 500000, // ₹ cap on any single payout
    // Hand-set payouts: { [mine count]: [multiplier after 1 gem, 2 gems, …] }.
    // Mine counts not listed here follow the house-edge formula.
    custom: {},
  },
  tower: {
    enabled: true,
    houseEdge: 3,
    levels: 8,
    minBet: 10,
    maxBet: 10000,
    maxWin: 500000,
    // Hand-set payouts: { [difficulty]: [multiplier at level 1, 2, …] }; others follow the formula
    custom: {},
  },
  plinko: {
    enabled: true,
    // Bucket payouts, left → right, for each row count and risk level
    tables: {
      8: {
        low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
        medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
        high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
      },
      12: {
        low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
        medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
        high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
      },
      16: {
        low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
        medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
        high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
      },
    },
    minBet: 10,
    maxBet: 10000,
    maxWin: 500000,
  },
  dice: {
    enabled: true,
    houseEdge: 1,
    minChance: 5, // % win chance a player may pick
    maxChance: 95,
    minBet: 10,
    maxBet: 10000,
    maxWin: 500000,
  },
  wheel: {
    enabled: true,
    // Each segment is equally likely; a group adds `count` segments paying `mult`
    risks: {
      low: [{ mult: 1.5, count: 2 }, { mult: 1.2, count: 14 }, { mult: 0, count: 4 }],
      medium: [{ mult: 3, count: 2 }, { mult: 2, count: 3 }, { mult: 1.7, count: 1 }, { mult: 1.5, count: 4 }, { mult: 0, count: 10 }],
      high: [{ mult: 19.6, count: 1 }, { mult: 0, count: 19 }],
    },
    minBet: 10,
    maxBet: 10000,
    maxWin: 500000,
  },
  poker: {
    enabled: true,
    smallBlind: 5,
    bigBlind: 10,
    minBuyIn: 200, // ₹ a player brings to the table (top-ups count too)
    maxBuyIn: 2000,
    rake: 5, // % the house takes from each pot the player wins once a flop is dealt
    rakeCap: 50, // ₹ most rake taken from one hand
    bots: 5, // opponents at the table (1–5)
    botSkill: 'normal', // easy | normal | hard — how well bots judge their hands
    botAggression: 50, // % how often bots bet and raise with good hands
    botBluff: 15, // % how often bots bet with weak hands
    turnSeconds: 30, // time to act before the player auto-checks / folds
  },
}

export const GAMES = Object.keys(DEFAULTS)
export const WINGO_ROOMS = ['30s', '1m', '3m', '5m']
export const RISKS = ['low', 'medium', 'high']
export const PLINKO_ROWS = [8, 12, 16]
export const TOWER_MODE_KEYS = ['easy', 'medium', 'hard', 'expert']
export const POKER_SKILLS = ['easy', 'normal', 'hard']

const cache = structuredClone(DEFAULTS)
const listeners = new Map() // game → [fn]

export const getSettings = (game) => cache[game]

export function onSettingsChange(game, fn) {
  listeners.set(game, [...(listeners.get(game) ?? []), fn])
}

export async function loadSettings() {
  const docs = await GameSettings.find().lean()
  for (const d of docs) {
    if (!DEFAULTS[d._id]) continue
    try {
      cache[d._id] = validate(d._id, { ...structuredClone(DEFAULTS[d._id]), ...d.data })
    } catch (err) {
      console.warn(`Ignoring invalid saved settings for ${d._id}: ${err.message}`)
    }
  }
}

const round2 = (n) => Math.round(n * 100) / 100

/** Pause switch + stake limits + per-round win cap, shared by mines, tower, plinko, dice and wheel. */
function limits(input) {
  const s = {
    enabled: Boolean(input.enabled),
    minBet: num(input.minBet, 'Minimum bet', 1, 1_000_000),
    maxBet: num(input.maxBet, 'Maximum bet', 1, 1_000_000),
    maxWin: num(input.maxWin, 'Maximum win', 1, 100_000_000),
  }
  if (s.maxBet < s.minBet) throw new HttpError(400, 'Maximum bet must be at least the minimum bet')
  if (s.maxWin < s.maxBet) throw new HttpError(400, 'Maximum win must be at least the maximum bet')
  return s
}

function num(value, label, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} must be a number`)
  if (n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}`)
  return round2(n)
}

/** Normalise and validate an admin-submitted settings object. */
export function validate(game, input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Invalid settings')

  if (game === 'aviator') {
    const s = {
      enabled: Boolean(input.enabled),
      houseEdge: num(input.houseEdge, 'House edge', 0, 50),
      instantCrash: num(input.instantCrash, 'Instant crash chance', 0, 50),
      maxMultiplier: num(input.maxMultiplier, 'Max multiplier', 2, 10000),
      minBet: num(input.minBet, 'Minimum bet', 1, 1_000_000),
      maxBet: num(input.maxBet, 'Maximum bet', 1, 1_000_000),
    }
    if (s.maxBet < s.minBet) throw new HttpError(400, 'Maximum bet must be at least the minimum bet')
    const curve = Array.isArray(input.curve) ? input.curve : []
    if (curve.length > 12) throw new HttpError(400, 'Use at most 12 odds points')
    s.curve = curve.map((p, i) => ({
      mult: num(p?.mult, `Odds point ${i + 1} multiplier`, 1.01, s.maxMultiplier),
      chance: num(p?.chance, `Odds point ${i + 1} chance`, 0.01, 100),
    }))
    let prev = { mult: 1, chance: 100 - s.instantCrash }
    for (const [i, p] of s.curve.entries()) {
      if (p.mult <= prev.mult) throw new HttpError(400, `Odds point ${i + 1}: multipliers must go up (${p.mult}x after ${prev.mult}x)`)
      if (p.chance > prev.chance) {
        throw new HttpError(400, i === 0
          ? `Odds point 1: at most ${prev.chance}% of rounds can reach ${p.mult}x (the rest crash instantly)`
          : `Odds point ${i + 1}: chances must go down (${p.chance}% after ${prev.chance}%)`)
      }
      prev = p
    }
    return s
  }

  if (game === 'poker') {
    const s = {
      enabled: Boolean(input.enabled),
      smallBlind: num(input.smallBlind, 'Small blind', 0.01, 100_000),
      bigBlind: num(input.bigBlind, 'Big blind', 0.02, 200_000),
      minBuyIn: num(input.minBuyIn, 'Minimum buy-in', 1, 10_000_000),
      maxBuyIn: num(input.maxBuyIn, 'Maximum buy-in', 1, 10_000_000),
      rake: num(input.rake, 'Rake', 0, 10),
      rakeCap: num(input.rakeCap, 'Rake cap', 0, 1_000_000),
      bots: Math.round(num(input.bots, 'Opponents', 1, 5)),
      botSkill: String(input.botSkill),
      botAggression: num(input.botAggression, 'Bot aggression', 0, 100),
      botBluff: num(input.botBluff, 'Bot bluffing', 0, 100),
      turnSeconds: Math.round(num(input.turnSeconds, 'Time to act', 10, 300)),
    }
    if (!POKER_SKILLS.includes(s.botSkill)) throw new HttpError(400, 'Bot skill must be easy, normal or hard')
    if (s.bigBlind < s.smallBlind) throw new HttpError(400, 'Big blind must be at least the small blind')
    if (s.minBuyIn < s.bigBlind * 10) throw new HttpError(400, 'Minimum buy-in must be at least 10 big blinds')
    if (s.maxBuyIn < s.minBuyIn) throw new HttpError(400, 'Maximum buy-in must be at least the minimum buy-in')
    return s
  }

  if (!DEFAULTS[game]) throw new HttpError(404, 'Unknown game')
  const base = limits(input)

  if (game === 'wingo') {
    const rooms = {}
    for (const r of WINGO_ROOMS) rooms[r] = input.rooms?.[r] !== false
    if (!Object.values(rooms).some(Boolean)) throw new HttpError(400, 'Keep at least one round length open (or pause the game instead)')
    if (!Array.isArray(input.weights) || input.weights.length !== 10) throw new HttpError(400, 'Give a chance for each number 0–9')
    const weights = input.weights.map((w, i) => num(w, `Chance of ${i}`, 0, 100))
    const total = round2(weights.reduce((t, w) => t + w, 0))
    if (Math.abs(total - 100) > 0.001) throw new HttpError(400, `Number chances must add up to 100% (currently ${total}%)`)
    const p = input.payouts ?? {}
    return {
      ...base,
      rooms,
      lockSeconds: Math.round(num(input.lockSeconds, 'Betting lock', 1, 15)),
      fee: num(input.fee, 'Service fee', 0, 20),
      weights,
      payouts: {
        size: num(p.size, 'Big / Small payout', 1.01, 100),
        color: num(p.color, 'Green / Red payout', 1.01, 100),
        colorSplit: num(p.colorSplit, 'Green / Red on 0 or 5 payout', 1, 100),
        violet: num(p.violet, 'Violet payout', 1.01, 100),
        number: num(p.number, 'Number payout', 1.01, 1000),
      },
    }
  }

  if (game === 'mines') {
    const s = {
      ...base,
      houseEdge: num(input.houseEdge, 'House edge', 0, 50),
      minMines: Math.round(num(input.minMines, 'Fewest mines', 1, 24)),
      maxMines: Math.round(num(input.maxMines, 'Most mines', 1, 24)),
    }
    if (s.maxMines < s.minMines) throw new HttpError(400, 'Most mines must be at least the fewest mines')
    s.custom = {}
    for (const [key, list] of Object.entries(input.custom ?? {})) {
      const m = Number(key)
      if (!Number.isInteger(m) || m < 1 || m > 24) throw new HttpError(400, `Invalid mine count ${key}`)
      if (!Array.isArray(list) || list.length !== 25 - m) throw new HttpError(400, `${m}-mine payouts need ${25 - m} values`)
      s.custom[m] = list.map((v, i) => num(v, `${m} mines, gem ${i + 1} payout`, 0.01, 1_000_000))
    }
    return s
  }

  if (game === 'tower') {
    const s = {
      ...base,
      houseEdge: num(input.houseEdge, 'House edge', 0, 50),
      levels: Math.round(num(input.levels, 'Tower height', 3, 12)),
      custom: {},
    }
    for (const [mode, list] of Object.entries(input.custom ?? {})) {
      if (!TOWER_MODE_KEYS.includes(mode)) throw new HttpError(400, `Unknown difficulty ${mode}`)
      if (!Array.isArray(list) || list.length !== s.levels) throw new HttpError(400, `${mode} payouts need ${s.levels} levels`)
      s.custom[mode] = list.map((v, i) => num(v, `${mode} level ${i + 1} payout`, 0.01, 1_000_000))
    }
    return s
  }

  if (game === 'dice') {
    const s = {
      ...base,
      houseEdge: num(input.houseEdge, 'House edge', 0, 50),
      minChance: num(input.minChance, 'Lowest win chance', 0.01, 98),
      maxChance: num(input.maxChance, 'Highest win chance', 1, 98),
    }
    if (s.maxChance <= s.minChance) throw new HttpError(400, 'Highest win chance must be above the lowest')
    return s
  }

  if (game === 'plinko') {
    const tables = {}
    for (const rows of PLINKO_ROWS) {
      tables[rows] = {}
      for (const risk of RISKS) {
        const list = input.tables?.[rows]?.[risk]
        if (!Array.isArray(list) || list.length !== rows + 1) throw new HttpError(400, `${rows}-row ${risk} table needs ${rows + 1} payouts`)
        tables[rows][risk] = list.map((v, i) => num(v, `${rows}-row ${risk} bucket ${i + 1}`, 0, 10000))
      }
    }
    return { ...base, tables }
  }

  if (game === 'wheel') {
    const risks = {}
    for (const risk of RISKS) {
      const groups = input.risks?.[risk]
      if (!Array.isArray(groups) || groups.length < 1 || groups.length > 10) throw new HttpError(400, `${risk} wheel needs 1–10 payout groups`)
      risks[risk] = groups.map((g, i) => ({
        mult: num(g?.mult, `${risk} wheel group ${i + 1} payout`, 0, 10000),
        count: Math.round(num(g?.count, `${risk} wheel group ${i + 1} segments`, 1, 60)),
      }))
      const total = risks[risk].reduce((t, g) => t + g.count, 0)
      if (total < 2 || total > 60) throw new HttpError(400, `${risk} wheel must have 2–60 segments (currently ${total})`)
    }
    return { ...base, risks }
  }

  throw new HttpError(404, 'Unknown game')
}

export async function updateSettings(game, input, adminUsername) {
  if (!DEFAULTS[game]) throw new HttpError(404, 'Unknown game')
  const next = validate(game, input)
  const before = cache[game]
  await GameSettings.updateOne({ _id: game }, { data: next, updatedBy: adminUsername }, { upsert: true })
  await SettingsLog.create({ game, admin: adminUsername, before, after: next })
  cache[game] = next
  for (const fn of listeners.get(game) ?? []) fn(next, before)
  return next
}

export async function settingsLog(limit = 30) {
  const rows = await SettingsLog.find().sort({ createdAt: -1 }).limit(limit).lean()
  return rows.map((r) => ({ id: String(r._id), game: r.game, admin: r.admin, before: r.before, after: r.after, time: r.createdAt }))
}
