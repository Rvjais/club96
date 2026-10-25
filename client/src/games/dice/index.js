import { lazy } from 'react'
import image from '../icons/dice.png'

// Card + route metadata for the Dice game (consumed by src/games/index.js)
export default {
  id: 'dice',
  name: 'Dice',
  tagline: 'Over or under',
  category: 'probability',
  path: '/games/dice',
  icon: 'dices',
  image, // lobby / history artwork (src/games/icons)
  bg: '#1d4ed8',
  glow: '#93c5fd',
  badge: 'NEW',
  component: lazy(() => import('./Dice')),
}
