// ─────────────────────────────────────────────────────────────
// Color Prediction engine — pure state machine, no React.
// Phases: open (betting) → locked (last seconds) → settling → open …
// ─────────────────────────────────────────────────────────────

export const ROUND_MS = 30000
export const LOCK_MS = 5000
export const SETTLE_MS = 2500
export const START_BALANCE = 10000
export const MIN_BET = 10
export const MAX_BET = 100000

export const COLORS = {
  red: { label: 'Red', multiplier: 2, weight: 0.45 },
  violet: { label: 'Violet', multiplier: 4.5, weight: 0.1 },
  green: { label: 'Green', multiplier: 2, weight: 0.45 },
}

function rollColor() {
  const r = Math.random()
  if (r < COLORS.red.weight) return 'red'
  if (r < COLORS.red.weight + COLORS.green.weight) return 'green'
  return 'violet'
}

function periodBase() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function initialState() {
  const base = periodBase()
  return {
    phase: 'open',
    endsAt: 0,
    settleUntil: 0,
    base,
    seq: 11,
    balance: START_BALANCE,
    history: Array.from({ length: 10 }, (_, i) => ({ period: `${base}${String(i + 1).padStart(3, '0')}`, color: rollColor() })),
    bets: [],
    records: [],
    timeLeft: ROUND_MS,
  }
}

const periodOf = (s) => `${s.base}${String(s.seq).padStart(3, '0')}`

function toSnapshot(s) {
  return {
    phase: s.phase,
    period: periodOf(s),
    timeLeft: s.timeLeft,
    balance: s.balance,
    history: [...s.history],
    bets: s.bets.map((b) => ({ ...b })),
    records: [...s.records],
  }
}

export const getInitialSnapshot = () => ({ ...toSnapshot(initialState()), timeLeft: ROUND_MS })

export function createColorEngine({ onState, onEvent }) {
  const s = initialState()
  let timer = 0
  let betId = 0

  const emit = () => onState(toSnapshot(s))

  function startRound(now) {
    s.phase = 'open'
    s.endsAt = now + ROUND_MS
    s.timeLeft = ROUND_MS
    s.bets = []
    emit()
  }

  function settle(now) {
    const color = rollColor()
    const period = periodOf(s)
    s.history.push({ period, color })
    if (s.history.length > 30) s.history.shift()

    let winnings = 0
    for (const b of s.bets) {
      const win = b.color === color ? b.amount * COLORS[color].multiplier : 0
      winnings += win
      s.records.unshift({ id: b.id, period, color: b.color, amount: b.amount, result: color, win })
    }
    s.records = s.records.slice(0, 30)
    s.balance += winnings

    s.phase = 'settling'
    s.settleUntil = now + SETTLE_MS
    s.timeLeft = 0
    onEvent({ type: 'result', color, period, played: s.bets.length > 0, winnings, staked: s.bets.reduce((t, b) => t + b.amount, 0) })
    emit()
  }

  function tick() {
    const now = Date.now()
    if (s.phase === 'settling') {
      if (now >= s.settleUntil) {
        s.seq++
        startRound(now)
      }
      return
    }

    s.timeLeft = Math.max(0, s.endsAt - now)
    if (s.phase === 'open' && s.timeLeft <= LOCK_MS) {
      s.phase = 'locked'
      onEvent({ type: 'locked' })
    }
    if (s.timeLeft <= 0) return settle(now)
    emit()
  }

  return {
    start() {
      startRound(Date.now())
      timer = setInterval(tick, 200)
    },

    stop() {
      clearInterval(timer)
    },

    placeBet(color, rawAmount) {
      if (s.phase !== 'open') return { ok: false, error: 'Betting is closed for this period' }
      const amount = Math.floor(Number(rawAmount))
      if (!Number.isFinite(amount) || amount < MIN_BET) return { ok: false, error: `Minimum bet is ₹${MIN_BET}` }
      if (amount > MAX_BET) return { ok: false, error: `Maximum bet is ₹${MAX_BET.toLocaleString('en-IN')}` }
      if (amount > s.balance) return { ok: false, error: 'Insufficient wallet balance' }

      s.balance -= amount
      s.bets.push({ id: `${periodOf(s)}-${++betId}`, color, amount })
      emit()
      return { ok: true, amount }
    },

    resetBalance() {
      s.balance = START_BALANCE
      emit()
    },
  }
}
