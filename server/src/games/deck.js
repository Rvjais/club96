// ─────────────────────────────────────────────────────────────
// Shared 52-card deck utilities for the card games (string cards:
// value + suit char, e.g. 'A♠', '10♥', '2♦'). Ace is high (14)
// for the poker-style games.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto'

export const SUITS = ['♠', '♥', '♦', '♣']
export const RANK_STRS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

// Ace = 14, King = 13, …, Deuce = 2
export function rankVal(card) {
  const r = card.slice(0, -1)
  if (r === 'A') return 14
  if (r === 'K') return 13
  if (r === 'Q') return 12
  if (r === 'J') return 11
  return Number(r)
}

export function suitOf(card) {
  return card.slice(-1)
}

export function newDeck() {
  const deck = []
  for (const s of SUITS) for (const r of RANK_STRS) deck.push(r + s)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}
