// ─────────────────────────────────────────────────────────────
// 5-card poker hand evaluation, shared by Caribbean Stud and
// Pai Gow Poker. Cards are strings like 'A♠' (value + suit char).
//
// eval5(cards) → { cat, cards: [primary, …kickers] } where cat is
//   8 straight flush · 7 four of a kind · 6 full house · 5 flush
//   4 straight · 3 three of a kind · 2 two pair · 1 one pair
//   0 high card
// and `cards` is a descending list of rank values (2..14) used to
// break ties. compare5(aHand, bHand) → 1 | -1 | 0.
// ─────────────────────────────────────────────────────────────
import { rankVal, suitOf } from './deck.js'

export function eval5(cards) {
  if (cards.length !== 5) throw new Error('eval5 needs exactly 5 cards')
  const vals = cards.map(rankVal).sort((a, b) => b - a)
  const suits = cards.map(suitOf)
  const flush = suits.every(s => s === suits[0])

  const uniques = [...new Set(vals)]
  let straightHigh = 0
  if (uniques.length === 5) {
    if (vals[0] - vals[4] === 4) {
      straightHigh = vals[0]
    } else if (vals.join(',') === '14,5,4,3,2') {
      straightHigh = 5 // wheel: A-2-3-4-5 plays as 5-high
    }
  }

  // counts of each rank
  const count = new Map()
  for (const v of vals) count.set(v, (count.get(v) ?? 0) + 1)
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])

  if (flush && straightHigh) return { cat: 8, cards: [straightHigh] }
  if (groups[0][1] === 4) return { cat: 7, cards: [groups[0][0], groups[1][0]] }
  if (groups[0][1] === 3 && groups[1][1] === 2) return { cat: 6, cards: [groups[0][0], groups[1][0]] }
  if (flush) return { cat: 5, cards: vals }
  if (straightHigh) return { cat: 4, cards: [straightHigh] }
  if (groups[0][1] === 3) {
    const kickers = groups[1] ? [groups[1][0]] : []
    return { cat: 3, cards: [groups[0][0], ...kickers] }
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) return { cat: 2, cards: [groups[0][0], groups[1][0], groups[2][0]] }
  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map(g => g[0])
    return { cat: 1, cards: [groups[0][0], ...kickers] }
  }
  return { cat: 0, cards: vals }
}

export function compare5(a, b) {
  if (a.cat !== b.cat) return a.cat > b.cat ? 1 : -1
  const n = Math.max(a.cards.length, b.cards.length)
  for (let i = 0; i < n; i++) {
    const x = a.cards[i] ?? 0
    const y = b.cards[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

// Best 5-card hand from 6 or 7 cards — the Pai Gow back (five-card)
// hand. Equivalent to evaluating every combination that keeps 5 cards.
export function bestOf(cards) {
  let best = null
  for (let i = 0; i < cards.length - 1; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const hand = cards.filter((_, k) => k !== i && k !== j)
      if (hand.length !== 5) continue
      const ev = eval5(hand)
      if (!best || compare5(ev, best) > 0) best = ev
    }
  }
  return best
}
