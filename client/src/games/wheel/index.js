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
  bg: '#7c3aed',
  glow: '#ffcf5a',
  badge: 'NEW',
  component: lazy(() => import('./Wheel')),
}
