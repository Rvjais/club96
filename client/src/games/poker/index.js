import { lazy } from 'react'

// Card + route metadata for the Poker game (consumed by src/games/index.js)
export default {
  id: 'poker',
  name: 'Poker',
  tagline: "Texas Hold'em",
  category: 'cards',
  path: '/games/poker',
  icon: 'club',
  bg: 'linear-gradient(160deg,#1b854e 0%,#0c4225 50%,#1e2940 100%)',
  glow: '#34d399',
  badge: 'NEW',
  component: lazy(() => import('./Poker')),
}
