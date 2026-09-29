// ─────────────────────────────────────────────────────────────
// Aviator client engine — animates the server's round timeline.
// The server (server/games/aviator.js) owns the crash point, bets,
// cash-outs and the wallet; this module only:
//   • syncs snapshots pushed over SSE (sync)
//   • derives phase / multiplier each frame from server time (onFrame)
//   • simulates cosmetic bot players for the live feed
//   • sends bet / cancel / cash-out requests (action)
// ─────────────────────────────────────────────────────────────
import { api } from '../../lib/api'

export const WAIT_MS = 6000

// Must match the server formula
export const multiplierAt = (sec) => 1 + 0.08 * sec + 0.02 * Math.pow(sec, 2.1)

const BOT_NAMES = ['CryptoFlyer', 'LuckyJet', 'AcePilot', 'MoonRider', 'SkyHigh', 'RiskTaker', 'Aviation99', 'TurboMax', 'AlphaBet', 'DiamondHands', 'RocketMan', 'VortexUser', 'Rahul', 'Priya', 'Karan', 'Neha', 'Arjun', 'Simran']
const BOT_STAKES = [10, 20, 20, 50, 50, 100, 100, 200, 500, 1000]

function makeBots() {
  const count = 14 + Math.floor(Math.random() * 10)
  const bots = []
  for (let i = 0; i < count; i++) {
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    bots.push({
      id: `b${i}`,
      name: `${name[0]}***${Math.floor(Math.random() * 10)}`,
      hue: Math.floor(Math.random() * 5),
      amount: BOT_STAKES[Math.floor(Math.random() * BOT_STAKES.length)],
      target: 1.1 + Math.pow(Math.random(), 2) * 7,
      cashMult: null,
      lost: false,
    })
  }
  return bots.sort((a, b) => b.amount - a.amount)
}

const idlePanel = { status: 'idle', amount: 0 }

// Used until the first server snapshot arrives; the server publishes the live rules
const DEFAULT_RULES = { enabled: true, houseEdge: 3, instantCrash: 3, maxMultiplier: 1000, minBet: 1, maxBet: 10000 }

export const getInitialSnapshot = () => ({
  ready: false,
  phase: 'waiting',
  balance: 0,
  crashAt: null,
  history: [],
  panels: { 1: idlePanel, 2: idlePanel },
  bots: [],
  userRound: [],
  myBets: [],
  round: { id: 0, hash: '' },
  prevRound: null,
  pending: { 1: false, 2: false },
  rules: DEFAULT_RULES,
})

export function createAviatorEngine({ onState, onFrame, onEvent }) {
  let server = null // last server snapshot
  let offset = 0 // serverNow - Date.now()
  let phase = 'waiting'
  let bots = []
  let botsRound = 0
  let raf = 0
  let alive = false
  const pending = { 1: false, 2: false }
  const seenCashed = new Set()

  const serverNow = () => Date.now() + offset

  function phaseAt(now) {
    const r = server.round
    if (r.crashed) return 'crashed'
    return now < r.flightStart ? 'waiting' : 'flying'
  }

  function panelsFor(ph) {
    const panels = { 1: idlePanel, 2: idlePanel }
    for (const b of server.bets) {
      if (b.status === 'queued') panels[b.panel] = { status: 'queued', amount: b.amount, betId: b.id }
      else if (b.status === 'active') {
        panels[b.panel] = { status: ph === 'waiting' ? 'placed' : ph === 'flying' ? 'flying' : 'idle', amount: b.amount, betId: b.id, autoCashout: b.autoCashout }
      }
    }
    return panels
  }

  function emit() {
    if (!server) return
    const r = server.round
    onState({
      ready: true,
      phase,
      balance: server.balance,
      crashAt: r.crashed ? r.crashAt : null,
      history: server.history,
      panels: panelsFor(phase),
      bots: bots.map((b) => ({ ...b })),
      userRound: server.bets
        .filter((b) => b.status !== 'queued')
        .map((b) => ({ panel: b.panel, amount: b.amount, cashMult: b.status === 'cashed' ? b.cashMult : null, lost: b.status === 'lost' })),
      myBets: server.records.map((m) => ({ ...m, key: m.id })),
      round: { id: r.id, hash: r.hash },
      prevRound: server.prevRound,
      pending: { ...pending },
      rules: server.rules ?? DEFAULT_RULES,
    })
  }

  /** Apply a snapshot from the server (SSE push or API response). */
  function sync(snap) {
    const measured = snap.serverNow - Date.now()
    offset = server ? offset * 0.7 + measured * 0.3 : measured
    const newRound = !server || server.round.id !== snap.round.id

    for (const b of snap.bets) {
      if (b.status === 'cashed' && !seenCashed.has(b.id)) {
        seenCashed.add(b.id)
        if (server) onEvent({ type: 'cashout', panel: b.panel, mult: b.cashMult, win: b.win })
      }
    }
    const first = !server
    server = snap
    if (newRound && botsRound !== snap.round.id) {
      bots = makeBots()
      botsRound = snap.round.id
    }
    if (snap.round.crashed) {
      // Bots only "cashed" below the real crash point
      for (const b of bots) {
        if (b.cashMult != null && b.cashMult >= snap.round.crashAt) b.cashMult = null
        if (b.cashMult == null) b.lost = true
      }
    }

    // Resolve the phase immediately so the UI never shows a stale phase
    // (e.g. "waiting" on first load while the plane is already flying).
    // No sounds on first load — the player joined mid-round.
    if (first) phase = phaseAt(serverNow())
    else if (advancePhase(serverNow())) return // advancePhase already emitted
    emit()
  }

  /** Move to the phase implied by server time; fires takeoff/crash events. Returns true if it changed. */
  function advancePhase(now) {
    const next = phaseAt(now)
    if (next === phase) return false
    const prev = phase
    phase = next
    if (next === 'flying') onEvent({ type: 'takeoff' })
    if (next === 'crashed' && prev === 'flying') onEvent({ type: 'crash', crashAt: server.round.crashAt })
    emit()
    return true
  }

  function tick() {
    if (!alive) return
    if (server) {
      const now = serverNow()
      const r = server.round
      advancePhase(now)

      let mult = 1
      let flightSec = 0
      let sincePhase = 0
      if (phase === 'flying') {
        flightSec = Math.max(0, (now - r.flightStart) / 1000)
        mult = multiplierAt(flightSec)
        let changed = false
        for (const b of bots) {
          if (b.cashMult == null && !b.lost && mult >= b.target) {
            b.cashMult = Math.floor(b.target * 100) / 100
            changed = true
          }
        }
        if (changed) emit()
      } else if (phase === 'crashed') {
        mult = r.crashAt
        flightSec = (r.crashTime - r.flightStart) / 1000
        sincePhase = Math.max(0, now - r.crashTime)
      } else {
        sincePhase = now - r.waitStart
      }

      onFrame({
        phase,
        mult,
        flightSec,
        sincePhase,
        waitLeft: phase === 'waiting' ? Math.max(0, r.flightStart - now) : 0,
        panels: panelsFor(phase),
        now: performance.now(),
      })
    }
    raf = requestAnimationFrame(tick)
  }

  async function send(id, path, body, onOk) {
    if (pending[id]) return
    pending[id] = true
    emit()
    try {
      const snap = await api.post(path, body)
      onOk?.(snap)
      sync(snap)
    } catch (err) {
      onEvent({ type: 'toast', kind: 'error', text: err.message })
    } finally {
      pending[id] = false
      emit()
    }
  }

  return {
    start() {
      alive = true
      raf = requestAnimationFrame(tick)
    },

    stop() {
      alive = false
      cancelAnimationFrame(raf)
    },

    sync,

    /** Bet / cancel / cash out depending on the panel's current status. */
    action(id, amount, auto) {
      if (!server) return
      const panel = panelsFor(phase)[id]

      if (panel.status === 'flying') return send(id, '/games/aviator/cashout', { panel: id })

      if (panel.status === 'placed' || panel.status === 'queued') {
        return send(id, '/games/aviator/cancel', { panel: id }, () =>
          onEvent({ type: 'toast', kind: 'info', text: panel.status === 'queued' ? `Queued bet ${id} cancelled` : `Bet ${id} cancelled` }),
        )
      }

      return send(
        id,
        '/games/aviator/bet',
        { panel: id, amount: Number(amount), autoCashout: auto?.enabled ? Number(auto.value) : null },
        (snap) =>
          onEvent({
            type: 'toast',
            kind: 'info',
            text: snap.placed === 'current' ? `Bet ${id} placed` : `Bet ${id} queued for next round`,
          }),
      )
    },
  }
}
