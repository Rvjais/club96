import { lazy } from 'react'
import image from '../icons/poker.png'

// Card + route metadata for the Poker game (consumed by src/games/index.js)
export default {
  id: 'poker',
  name: 'Poker',
  tagline: "Texas Hold'em",
  category: 'cards',
  path: '/games/poker',
  icon: 'club',
  image, // lobby / history artwork (src/games/icons)
  bg: '#0c4225',
  glow: '#34d399',
  badge: 'NEW',
  component: lazy(() => import('./Poker')),
}
