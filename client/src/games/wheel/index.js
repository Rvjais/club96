import { lazy } from 'react'
import image from '../icons/wheel.png'

// Card + route metadata for the Wheel game (consumed by src/games/index.js)
export default {
  id: 'wheel',
  name: 'Wheel',
  tagline: 'Spin to win',
  category: 'physics',
  path: '/games/wheel',
  icon: 'wheel',
  image, // lobby / history artwork (src/games/icons)
  bg: 'linear-gradient(160deg,#c4b5fd 0%,#7c3aed 45%,#1d1938 100%)',
  glow: '#ffcf5a',
  badge: 'NEW',
  component: lazy(() => import('./Wheel')),
}
