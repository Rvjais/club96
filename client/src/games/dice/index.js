import { lazy } from 'react'

// Card + route metadata for the Dice game (consumed by src/games/index.js)
export default {
  id: 'dice',
  name: 'Dice',
  tagline: 'Over or under',
  category: 'probability',
  path: '/games/dice',
  icon: 'dices',
  bg: 'linear-gradient(160deg,#60a5fa 0%,#1d4ed8 45%,#0f1528 100%)',
  glow: '#93c5fd',
  badge: 'NEW',
  component: lazy(() => import('./Dice')),
}
