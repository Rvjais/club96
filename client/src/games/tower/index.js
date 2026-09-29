import { lazy } from 'react'

// Card + route metadata for the Tower game (consumed by src/games/index.js)
export default {
  id: 'tower',
  name: 'Tower',
  tagline: 'Climb & cash out',
  category: 'grid',
  path: '/games/tower',
  icon: 'layers',
  bg: 'linear-gradient(160deg,#ff7a93 0%,#c21d4b 45%,#1f1830 100%)',
  glow: '#ff9db0',
  badge: 'NEW',
  component: lazy(() => import('./Tower')),
}
