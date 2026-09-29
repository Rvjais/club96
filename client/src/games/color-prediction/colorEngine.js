// ─────────────────────────────────────────────────────────────
// Color Prediction client engine — follows the server's period clock.
// The server (server/games/color.js) rolls results, takes bets and
// settles them against the shared wallet. This module keeps the
// countdown ticking between SSE pushes and detects new results.
// Phases: open → locked (last LOCK_MS) → settling (until the next
// period arrives from the server).
// ─────────────────────────────────────────────────────────────
import { api } from '../../lib/api'

export const ROUND_MS = 30000
export const LOCK_MS = 5000

export const COLORS = {
  red: { label: 'Red' },
  violet: { label: 'Violet' },
  green: { label: 'Green' },
}

// Used until the first server snapshot arrives; the server publishes the live rules
export const DEFAULT_RULES = {
  enabled: true,
  chances: { red: 45, green: 45, violet: 10 },
  multipliers: { red: 2, green: 2, violet: 4.5 },
  minBet: 10,
  maxBet: 100000,
}

export const getInitialSnapshot = () => ({
  ready: false,
  phase: 'open',
  period: '',
  timeLeft: ROUND_MS,
  balance: 0,
  history: [],
  bets: [],
  records: [],
  rules: DEFAULT_RULES,
})

export function createColorEngine({ onState, onEvent }) {
  let server = null
  let offset = 0
  let timer = 0
  let lastResultId = null

  function view() {
    const now = Date.now() + offset
    const p = server.period
    const timeLeft = Math.max(0, p.endsAt - now)
    const phase = timeLeft <= 0 ? 'settling' : timeLeft <= p.lockMs ? 'locked' : 'open'
    return {
      ready: true,
      phase,
      period: p.label,
      periodId: p.id,
      timeLeft,
      balance: server.balance,
      history: server.history,
      bets: server.bets,
      records: server.records,
      rules: server.rules ?? DEFAULT_RULES,
    }
  }

  let lastPhase = 'open'
  function emit() {
    if (!server) return
    const v = view()
    if (v.phase === 'locked' && lastPhase === 'open') onEvent({ type: 'locked' })
    lastPhase = v.phase
    onState(v)
  }

  function sync(snap) {
    const measured = snap.serverNow - Date.now()
    offset = server ? offset * 0.7 + measured * 0.3 : measured

    // A new result the player hasn't seen yet → announce it
    const r = snap.lastResult
    if (r && lastResultId !== null && r.id !== lastResultId) onEvent({ type: 'result', ...r })
    if (r) lastResultId = r.id
    else if (lastResultId === null) lastResultId = -1

    server = snap
    emit()
  }

  return {
    start() {
      timer = setInterval(emit, 200)
    },

    stop() {
      clearInterval(timer)
    },

    sync,

    async placeBet(color, rawAmount) {
      const amount = Math.floor(Number(rawAmount))
      try {
        sync(await api.post('/games/color/bet', { color, amount }))
        return { ok: true, amount }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    },
  }
}
