// ─────────────────────────────────────────────────────────────
// Win Go client engine — follows the server's period clocks.
// The server (server/games/wingo.js) draws numbers, takes bets and
// settles them against the shared wallet. This module keeps every
// room's countdown ticking between SSE pushes and announces results.
// Phases per room: open → locked (last lockMs) → settling (until the
// next period arrives from the server).
// ─────────────────────────────────────────────────────────────
import { api } from '../../lib/api'

export const ROOM_KEYS = ['30s', '1m', '3m', '5m']
export const ROOM_TABS = { '30s': '30s', '1m': '1Min', '3m': '3Min', '5m': '5Min' }

/** Colours of a drawn number: 0 = red+violet, 5 = green+violet, odd = green, even = red. */
export function colorsOf(n) {
  if (n === 0) return ['red', 'violet']
  if (n === 5) return ['green', 'violet']
  return n % 2 ? ['green'] : ['red']
}
export const sizeOf = (n) => (n >= 5 ? 'big' : 'small')

export const PICK_LABELS = { green: 'Green', red: 'Red', violet: 'Violet', big: 'Big', small: 'Small' }
export const pickLabel = (pick) => PICK_LABELS[pick] ?? `Number ${pick}`

/** Multiplier(s) shown for a pick, e.g. "2x" or "2x / 1.5x". */
export function pickOdds(pick, p) {
  if (pick === 'big' || pick === 'small') return `${p.size}x`
  if (pick === 'violet') return `${p.violet}x`
  if (pick === 'green' || pick === 'red') return `${p.color}x`
  return `${p.number}x`
}

export function createWingoEngine({ onState, onEvent }) {
  let server = null
  let offset = 0
  let timer = 0
  const seen = {} // room → last result id announced
  const lastPhase = {}

  function view() {
    const now = Date.now() + offset
    const rooms = {}
    for (const key of ROOM_KEYS) {
      const r = server.rooms[key]
      if (!r) continue
      const timeLeft = Math.max(0, r.period.endsAt - now)
      const phase = timeLeft <= 0 ? 'settling' : timeLeft <= server.rules.lockMs ? 'locked' : 'open'
      rooms[key] = { ...r, timeLeft, phase }
    }
    return { ready: true, balance: server.balance, rules: server.rules, rooms, records: server.records }
  }

  function emit() {
    if (!server) return
    const v = view()
    for (const [key, r] of Object.entries(v.rooms)) {
      if (r.phase === 'locked' && lastPhase[key] === 'open') onEvent({ type: 'locked', room: key })
      lastPhase[key] = r.phase
    }
    onState(v)
  }

  function sync(snap) {
    const measured = snap.serverNow - Date.now()
    offset = server ? offset * 0.7 + measured * 0.3 : measured
    // A new result the player hasn't seen yet → announce it
    for (const [key, r] of Object.entries(snap.rooms)) {
      const res = r.lastResult
      if (res && seen[key] !== undefined && res.id !== seen[key]) onEvent({ type: 'result', room: key, label: r.label, ...res })
      seen[key] = res?.id ?? null
    }
    server = snap
    emit()
  }

  return {
    start() { timer = setInterval(emit, 200) },
    stop() { clearInterval(timer) },
    sync,
    async placeBet(room, pick, amount) {
      try {
        sync(await api.post('/games/wingo/bet', { room, pick, amount }))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    },
  }
}
