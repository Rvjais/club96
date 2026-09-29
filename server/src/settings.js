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
  },
  color: {
    enabled: true,
    weights: { red: 45, green: 45, violet: 10 }, // % chance of each result
    multipliers: { red: 2, green: 2, violet: 4.5 },
    minBet: 10,
    maxBet: 100000,
  },
}

export const GAMES = Object.keys(DEFAULTS)
const COLOR_KEYS = ['red', 'green', 'violet']

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
    return s
  }

  if (game === 'color') {
    const weights = {}
    const multipliers = {}
    for (const c of COLOR_KEYS) {
      weights[c] = num(input.weights?.[c], `${c} chance`, 0, 100)
      multipliers[c] = num(input.multipliers?.[c], `${c} payout`, 1.01, 100)
    }
    const total = round2(COLOR_KEYS.reduce((t, c) => t + weights[c], 0))
    if (Math.abs(total - 100) > 0.001) throw new HttpError(400, `Chances must add up to 100% (currently ${total}%)`)
    const s = {
      enabled: Boolean(input.enabled),
      weights,
      multipliers,
      minBet: num(input.minBet, 'Minimum bet', 1, 10_000_000),
      maxBet: num(input.maxBet, 'Maximum bet', 1, 10_000_000),
    }
    if (s.maxBet < s.minBet) throw new HttpError(400, 'Maximum bet must be at least the minimum bet')
    return s
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
