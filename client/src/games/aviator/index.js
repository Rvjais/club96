import { lazy } from 'react'

// Card + route metadata for the Aviator game (consumed by src/games/index.js)
export default {
  id: 'aviator',
  name: 'Aviator',
  tagline: 'Crash game',
  path: '/games/aviator',
  icon: 'plane',
  bg: 'linear-gradient(160deg,#ff5c7c 0%,#19212e 78%)',
  glow: '#ff2d55',
  badge: 'HOT',
  component: lazy(() => import('./Aviator')),
}
