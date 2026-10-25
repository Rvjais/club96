// Shared playing-card face component for the card games.
// Cards are strings like 'A♠' / '10♥' (value + last-char suit).
import './cards.css'

const RED_SUITS = new Set(['♥', '♦'])

export function suitColor(card) {
  return RED_SUITS.has(card?.slice?.(-1)) ? 'red' : 'black'
}

export function CardFace({ card, small, back, dim }) {
  if (back || !card) {
    return <div className={`cf-card cf-back ${small ? 'cf-sm' : ''}`}><span className="cf-rune">✦</span></div>
  }
  const rank = card.slice(0, -1)
  const suit = card.slice(-1)
  const color = suitColor(card)
  return (
    <div className={`cf-card ${small ? 'cf-sm' : ''} ${dim ? 'cf-dim' : ''} ${color === 'red' ? 'is-red' : 'is-black'}`}>
      <span className="cf-rank">{rank}</span>
      <span className="cf-suit">{suit}</span>
    </div>
  )
}
