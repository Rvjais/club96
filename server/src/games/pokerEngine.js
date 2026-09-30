// ─────────────────────────────────────────────────────────────
// Texas Hold'em engine — pure table logic, no database.
// A table is a plain JSON object (stored as-is on the PokerTable doc).
// Seat 0 is always the player; the other seats are house bots.
// All money is integer paise. Functions mutate the state they are
// given and report every visible step through ctx.emit(msg, kind).
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'

export const HERO = 0
const RANKS = '23456789TJQKA'
const SUITS = 'shdc'
const RANK = Object.fromEntries([...RANKS].map((r, i) => [r, i + 2]))
const SUIT = Object.fromEntries([...SUITS].map((s, i) => [s, i]))
const FULL_DECK = [...SUITS].flatMap((s) => [...RANKS].map((r) => r + s))

const BOT_NAMES = [
  'Johnzo2578', 'FaceitPlayer', 'funnyguytom', 'GTHRO', 'Rysiff', 'AceHunter', 'RiverRat', 'NutsOnly', 'BluffKing',
  'ChipLeader', 'SlowRoll', 'PocketRockets', 'TiltProof', 'LuckyLuke', 'CheckRaise', 'FoldEquity', 'DonkBet', 'Monk3y',
]
const AVATARS = 6
const SKILL = {
  easy: { noise: 0.14, iters: 120, loose: 0.12 },
  normal: { noise: 0.06, iters: 220, loose: 0.04 },
  hard: { noise: 0.02, iters: 400, loose: 0 },
}
const MAX_RAISES = 4 // bots stop re-raising after this many raises in one street

// ── Hand evaluation ──────────────────────────────────────────
// Score = category then up to five tie-break ranks, 4 bits each; higher wins.
const score = (cat, ks) => {
  let s = cat
  for (let i = 0; i < 5; i++) s = s * 16 + (ks[i] ?? 0)
  return s
}

function straightHigh(mask) {
  if (mask & (1 << 14)) mask |= 1 << 1 // ace plays low too
  for (let hi = 14; hi >= 5; hi--) {
    const need = 0b11111 << (hi - 4)
    if ((mask & need) === need) return hi
  }
  return 0
}

/** Best poker hand from 2–7 cards like 'As', 'Td'. */
export function evaluate(cards) {
  const counts = new Array(15).fill(0)
  const suitMask = [0, 0, 0, 0]
  const suitCount = [0, 0, 0, 0]
  let mask = 0
  for (const c of cards) {
    const r = RANK[c[0]]
    const s = SUIT[c[1]]
    counts[r]++
    suitMask[s] |= 1 << r
    suitCount[s]++
    mask |= 1 << r
  }
  const flush = suitCount.findIndex((n) => n >= 5)
  if (flush >= 0) {
    const sf = straightHigh(suitMask[flush])
    if (sf) return score(8, [sf])
  }
  const quads = []
  const trips = []
  const pairs = []
  const singles = []
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quads.push(r)
    else if (counts[r] === 3) trips.push(r)
    else if (counts[r] === 2) pairs.push(r)
    else if (counts[r] === 1) singles.push(r)
  }
  if (quads.length) return score(7, [quads[0], Math.max(0, ...trips, ...pairs, ...singles)])
  if (trips.length && (trips.length > 1 || pairs.length)) return score(6, [trips[0], Math.max(trips[1] ?? 0, pairs[0] ?? 0)])
  if (flush >= 0) {
    const ks = []
    for (let r = 14; r >= 2 && ks.length < 5; r--) if (suitMask[flush] & (1 << r)) ks.push(r)
    return score(5, ks)
  }
  const st = straightHigh(mask)
  if (st) return score(4, [st])
  if (trips.length) return score(3, [trips[0], ...singles.slice(0, 2)])
  if (pairs.length >= 2) return score(2, [pairs[0], pairs[1], Math.max(pairs[2] ?? 0, singles[0] ?? 0)])
  if (pairs.length) return score(1, [pairs[0], ...singles.slice(0, 3)])
  return score(0, singles.slice(0, 5))
}

const NAMES = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' }
const plural = (r) => (r === 6 ? 'Sixes' : `${NAMES[r]}s`)

/** 'Pair of Kings', 'Full House, Sevens over Twos', … */
export function handName(s) {
  const k = []
  let x = s
  for (let i = 0; i < 5; i++) {
    k.unshift(x % 16)
    x = Math.floor(x / 16)
  }
  switch (x) {
    case 8: return k[0] === 14 ? 'Royal Flush' : `Straight Flush, ${NAMES[k[0]]} high`
    case 7: return `Four ${plural(k[0])}`
    case 6: return `Full House, ${plural(k[0])} over ${plural(k[1])}`
    case 5: return `Flush, ${NAMES[k[0]]} high`
    case 4: return `Straight, ${NAMES[k[0]]} high`
    case 3: return `Three ${plural(k[0])}`
    case 2: return `Two Pair, ${plural(k[0])} & ${plural(k[1])}`
    case 1: return `Pair of ${plural(k[0])}`
    default: return `${NAMES[k[0]]} High`
  }
}

// ── Table setup ──────────────────────────────────────────────
function shuffled() {
  const deck = [...FULL_DECK]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

const emptyHand = () => ({ bet: 0, total: 0, cards: [], folded: false, allIn: false, acted: false, action: null, won: 0 })

function makeBot(seats, cfg) {
  const taken = new Set(seats.map((s) => s?.name))
  const free = BOT_NAMES.filter((n) => !taken.has(n))
  const name = free[crypto.randomInt(free.length)]
  // Bots sit with a random stack in the buy-in range, rounded to big blinds
  const lo = Math.ceil(cfg.minBuyIn / cfg.bb)
  const hi = Math.max(lo, Math.floor(cfg.maxBuyIn / cfg.bb))
  return {
    ...emptyHand(),
    name,
    avatar: 1 + crypto.randomInt(AVATARS - 1),
    stack: crypto.randomInt(lo, hi + 1) * cfg.bb,
    style: (crypto.randomInt(31) - 15) / 100, // each bot is a bit tighter or looser
  }
}

export function createTable(heroName, stack, cfg) {
  const seats = [{ ...emptyHand(), name: heroName, avatar: 0, stack, hero: true }]
  for (let i = 0; i < cfg.bots; i++) seats.push(makeBot(seats, cfg))
  return {
    seats,
    dealer: crypto.randomInt(seats.length),
    street: 'idle', // idle | preflop | flop | turn | river | done
    turn: -1,
    board: [],
    deck: [],
    currentBet: 0,
    minRaise: 0,
    raises: 0,
    flopSeen: false,
    showdown: false,
    handNo: 0,
    totalRake: 0,
    deadline: null,
    result: null,
    log: [],
  }
}

export const inHand = (state) => !['idle', 'done'].includes(state.street)

// ── Helpers ──────────────────────────────────────────────────
const canAct = (s) => !s.folded && !s.allIn
const potOf = (state) => state.seats.reduce((t, s) => t + s.total, 0)
const inr = (p) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const cardsText = (list) => list.map((c) => c.replace('T', '10')).join(' ')

function say(state, ctx, msg, kind) {
  state.log.push(msg)
  if (state.log.length > 60) state.log.splice(0, state.log.length - 60)
  ctx.emit?.(msg, kind)
}

function pay(s, amount) {
  const p = Math.min(s.stack, amount)
  s.stack -= p
  s.bet += p
  s.total += p
  if (s.stack === 0) s.allIn = true
  return p
}

function nextActor(state, from) {
  const n = state.seats.length
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n
    const s = state.seats[j]
    if (canAct(s) && (!s.acted || s.bet < state.currentBet)) return j
  }
  return -1
}

// ── Hand flow ────────────────────────────────────────────────
export function newHand(state, cfg, ctx) {
  const n = state.seats.length
  // Busted bots leave and a fresh one sits down
  state.seats.forEach((s, i) => {
    if (!s.hero && s.stack < cfg.bb) {
      state.seats[i] = makeBot(state.seats, cfg)
      say(state, ctx, `${s.name} left, ${state.seats[i].name} sits down`, 'join')
    }
  })
  for (const s of state.seats) Object.assign(s, emptyHand())

  state.handNo++
  state.deck = shuffled()
  state.board = []
  state.result = null
  state.flopSeen = false
  state.showdown = false
  state.raises = 0
  state.street = 'preflop'
  state.dealer = (state.dealer + 1) % n

  // Heads-up the dealer posts the small blind
  const sb = n === 2 ? state.dealer : (state.dealer + 1) % n
  const bb = (sb + 1) % n
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < n; j++) state.seats[(sb + j) % n].cards.push(state.deck.pop())
  }
  say(state, ctx, `Hand #${state.handNo} · ${state.seats[state.dealer].name} has the button`, 'deal')

  pay(state.seats[sb], cfg.sb)
  state.seats[sb].action = 'SB'
  pay(state.seats[bb], cfg.bb)
  state.seats[bb].action = 'BB'
  state.currentBet = cfg.bb
  state.minRaise = cfg.bb
  say(state, ctx, `${state.seats[sb].name} posts ${inr(state.seats[sb].bet)}, ${state.seats[bb].name} posts ${inr(state.seats[bb].bet)}`, 'chip')

  state.turn = bb
  advance(state, cfg, ctx)
}

/** Apply one action for the seat whose turn it is. `amount` = total to raise to this street. */
export function act(state, cfg, ctx, action, amount) {
  if (!inHand(state)) throw new Error('No hand in progress')
  const i = state.turn
  const s = state.seats[i]
  const toCall = state.currentBet - s.bet
  const who = s.hero ? 'You' : s.name

  if (action === 'fold') {
    s.folded = true
    s.action = 'Fold'
    say(state, ctx, `${who} fold${s.hero ? '' : 's'}`, 'fold')
  } else if (action === 'check' || (action === 'call' && toCall <= 0)) {
    if (toCall > 0) throw new Error('You cannot check, there is a bet to call')
    s.action = 'Check'
    say(state, ctx, `${who} check${s.hero ? '' : 's'}`, 'check')
  } else if (action === 'call') {
    const p = pay(s, toCall)
    s.action = s.allIn ? 'All-in' : 'Call'
    say(state, ctx, `${who} call${s.hero ? '' : 's'} ${inr(p)}${s.allIn ? ' (all-in)' : ''}`, 'chip')
  } else if (action === 'raise' || action === 'allin') {
    const maxTo = s.bet + s.stack
    if (maxTo <= state.currentBet) return act(state, cfg, ctx, 'call') // can only call off
    let target = action === 'allin' ? maxTo : Math.round(Number(amount))
    if (!Number.isFinite(target)) throw new Error('Invalid raise amount')
    const minTo = state.currentBet + state.minRaise
    if (target >= maxTo) target = maxTo
    else if (target < minTo) throw new Error(`Minimum raise is to ${inr(minTo)}`)
    const opened = state.currentBet === 0
    pay(s, target - s.bet)
    if (target - state.currentBet >= state.minRaise) state.minRaise = target - state.currentBet
    state.currentBet = target
    state.raises++
    for (const o of state.seats) if (o !== s && canAct(o)) o.acted = false
    s.action = s.allIn ? 'All-in' : opened ? 'Bet' : 'Raise'
    const verb = opened ? (s.hero ? 'bet' : 'bets') : (s.hero ? 'raise to' : 'raises to')
    say(state, ctx, `${who} ${s.allIn ? 'go all-in for' : verb} ${inr(target)}`, 'chip')
  } else {
    throw new Error('Unknown action')
  }
  s.acted = true
  advance(state, cfg, ctx)
}

function advance(state, cfg, ctx) {
  const live = state.seats.filter((s) => !s.folded)
  if (live.length === 1) return finish(state, cfg, ctx)

  const actors = state.seats.filter(canAct)
  const done = actors.every((s) => s.bet === state.currentBet && (s.acted || actors.length === 1))
  if (!done) {
    state.turn = nextActor(state, state.turn)
    return
  }

  // Betting round over: bets go into the pot
  for (const s of state.seats) {
    s.bet = 0
    s.acted = false
    if (!s.folded && !s.allIn) s.action = null
  }
  state.currentBet = 0
  state.minRaise = cfg.bb
  state.raises = 0
  if (state.street === 'river') return finish(state, cfg, ctx)

  if (state.street === 'preflop') {
    state.street = 'flop'
    state.flopSeen = true
    state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop())
    say(state, ctx, `Flop: ${cardsText(state.board)}`, 'board')
  } else {
    state.street = state.street === 'flop' ? 'turn' : 'river'
    state.board.push(state.deck.pop())
    say(state, ctx, `${state.street === 'turn' ? 'Turn' : 'River'}: ${cardsText(state.board.slice(-1))}`, 'board')
  }
  state.turn = state.dealer
  advance(state, cfg, ctx) // with fewer than two players able to bet, this runs the board out
}

function finish(state, cfg, ctx) {
  const seats = state.seats
  const live = seats.filter((s) => !s.folded)

  // Return any part of a bet nobody called
  const byTotal = [...seats].sort((a, b) => b.total - a.total)
  const uncalled = byTotal[0].total - (byTotal[1]?.total ?? 0)
  if (uncalled > 0) {
    byTotal[0].stack += uncalled
    byTotal[0].total -= uncalled
    if (byTotal[0].allIn && byTotal[0].stack > 0) byTotal[0].allIn = false
  }

  state.showdown = live.length > 1
  const scores = new Map(state.showdown ? live.map((s) => [s, evaluate([...s.cards, ...state.board])]) : [])
  if (state.showdown) {
    say(state, ctx, '— Showdown —', 'board')
    for (const s of live) say(state, ctx, `${s.hero ? 'You' : s.name} show ${cardsText(s.cards)} · ${handName(scores.get(s))}`, 'show')
  }

  // Main pot + side pots, one level per distinct all-in amount
  const levels = [...new Set(live.map((s) => s.total))].sort((a, b) => a - b)
  const pots = []
  let prev = 0
  for (const lvl of levels) {
    const amount = seats.reduce((t, s) => t + Math.min(s.total, lvl) - Math.min(s.total, prev), 0)
    pots.push({ amount, eligible: live.filter((s) => s.total >= lvl) })
    prev = lvl
  }
  const leftover = potOf(state) - pots.reduce((t, p) => t + p.amount, 0)
  if (leftover > 0) pots[pots.length - 1].amount += leftover

  let rake = 0
  const winners = new Map()
  const n = seats.length
  for (const pot of pots) {
    if (pot.amount <= 0) continue
    let best = pot.eligible
    if (state.showdown) {
      const top = Math.max(...pot.eligible.map((s) => scores.get(s)))
      best = pot.eligible.filter((s) => scores.get(s) === top)
    }
    let amount = pot.amount
    // Rake: only on pots the player wins, only once a flop was dealt, capped per hand
    if (state.flopSeen && cfg.rake > 0 && best.some((s) => s.hero)) {
      const r = Math.min(Math.floor((amount * cfg.rake) / 100), Math.max(0, cfg.rakeCap - rake))
      amount -= r
      rake += r
    }
    const share = Math.floor(amount / best.length)
    let odd = amount - share * best.length
    // Odd paise go to the first winner left of the button
    const ordered = [...best].sort((a, b) => ((seats.indexOf(a) - state.dealer - 1 + n) % n) - ((seats.indexOf(b) - state.dealer - 1 + n) % n))
    for (const s of ordered) {
      const won = share + (odd > 0 ? 1 : 0)
      if (odd > 0) odd--
      s.stack += won
      s.won += won
      winners.set(s, (winners.get(s) ?? 0) + won)
    }
  }

  for (const [s, won] of winners) {
    const how = state.showdown ? ` with ${handName(scores.get(s))}` : ''
    say(state, ctx, `${s.hero ? 'You win' : `${s.name} wins`} ${inr(won)}${how}`, s.hero ? 'win' : 'chip')
  }
  if (rake > 0) say(state, ctx, `Rake ${inr(rake)}`, 'info')

  state.totalRake += rake
  state.result = {
    pot: [...winners.values()].reduce((t, w) => t + w, 0), // paid out, after rake
    rake,
    winners: [...winners].map(([s, won]) => ({ seat: seats.indexOf(s), won, hand: state.showdown ? handName(scores.get(s)) : null })),
  }
  for (const s of seats) {
    s.bet = 0
    s.total = 0
  }
  state.street = 'done'
  state.turn = -1
  state.deadline = null
}

// ── Bots ─────────────────────────────────────────────────────
/** Share of the pot this hand wins on average against `opponents` random hands (Monte Carlo). */
function equity(hole, board, opponents, iters) {
  const known = new Set([...hole, ...board])
  const rest = FULL_DECK.filter((c) => !known.has(c))
  const need = 5 - board.length + opponents * 2
  let wins = 0
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i))
      ;[rest[i], rest[j]] = [rest[j], rest[i]]
    }
    const full = board.concat(rest.slice(0, 5 - board.length))
    const mine = evaluate(hole.concat(full))
    let best = 0
    let ties = 0
    for (let o = 0; o < opponents; o++) {
      const at = 5 - board.length + o * 2
      const theirs = evaluate([rest[at], rest[at + 1], ...full])
      if (theirs > best) { best = theirs; ties = 0 }
      if (theirs === best) ties++
    }
    if (mine > best) wins++
    else if (mine === best) wins += 1 / (ties + 1)
  }
  return wins / iters
}

/** Bots only see their own cards and the board — never the player's hand. */
function botDecision(state, cfg) {
  const s = state.seats[state.turn]
  const sk = SKILL[cfg.botSkill] ?? SKILL.normal
  const opponents = state.seats.filter((o) => !o.folded).length - 1
  const e = Math.min(1, Math.max(0, equity(s.cards, state.board, opponents, sk.iters) + (Math.random() * 2 - 1) * sk.noise))
  const rel = e * (opponents + 1) // 1 = an average hand at this table
  const aggr = Math.min(1, Math.max(0, cfg.botAggression / 100 + s.style))
  const bluff = cfg.botBluff / 100
  const pot = potOf(state)
  const toCall = state.currentBet - s.bet
  const canRaise = state.raises < MAX_RAISES && s.stack > toCall
  const raiseTo = (frac) => ['raise', state.currentBet + Math.max(state.minRaise, Math.round((pot + toCall) * frac))]

  if (toCall === 0) {
    if (canRaise && rel > 1.5 - 0.5 * aggr && Math.random() < 0.45 + 0.5 * aggr) return raiseTo(0.4 + 0.4 * Math.min(1, (rel - 1) / 2))
    if (canRaise && Math.random() < bluff * 0.35) return raiseTo(0.5)
    return ['check']
  }
  const odds = toCall / (pot + toCall)
  if (canRaise && rel > 2.2 - 0.6 * aggr && Math.random() < 0.3 + 0.5 * aggr) return raiseTo(0.75)
  if (e + sk.loose >= odds * (1.1 - 0.2 * aggr)) return ['call']
  if (canRaise && Math.random() < bluff * 0.12 && toCall < s.stack * 0.25) return raiseTo(0.75)
  return ['fold']
}

/** Let bots act until it is the player's turn or the hand is over. */
export function runBots(state, cfg, ctx) {
  while (inHand(state) && state.turn !== HERO && state.turn >= 0) {
    const [action, amount] = botDecision(state, cfg)
    act(state, cfg, ctx, action, amount)
  }
}

// ── Player view ──────────────────────────────────────────────
/** What the player may see: bot cards stay hidden until a showdown. `money` converts paise. */
export function publicView(state, cfg, money) {
  const hero = state.seats[HERO]
  const myTurn = inHand(state) && state.turn === HERO
  const toCall = myTurn ? Math.min(hero.stack, state.currentBet - hero.bet) : 0
  const maxTo = hero.bet + hero.stack
  return {
    handNo: state.handNo,
    street: state.street,
    dealer: state.dealer,
    turn: state.turn,
    board: state.board,
    pot: money(potOf(state)),
    currentBet: money(state.currentBet),
    seats: state.seats.map((s) => ({
      name: s.name,
      avatar: s.avatar,
      hero: !!s.hero,
      stack: money(s.stack),
      bet: money(s.bet),
      folded: s.folded,
      allIn: s.allIn,
      action: s.action,
      won: money(s.won),
      cards: s.hero || (state.street === 'done' && state.showdown && !s.folded) ? s.cards : s.cards.map(() => null),
    })),
    heroHand: hero.cards.length ? handName(evaluate([...hero.cards, ...state.board])) : null,
    options: myTurn ? {
      toCall: money(toCall),
      canRaise: maxTo > state.currentBet,
      minRaiseTo: money(Math.min(maxTo, state.currentBet + state.minRaise)),
      maxRaiseTo: money(maxTo),
    } : null,
    result: state.result && {
      pot: money(state.result.pot),
      rake: money(state.result.rake),
      winners: state.result.winners.map((w) => ({ ...w, won: money(w.won) })),
    },
    log: state.log.slice(-40),
  }
}
