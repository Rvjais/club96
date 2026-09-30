import { lazy } from 'react'
import image from '../icons/aviator.png'

// Card + route metadata for the Aviator game (consumed by src/games/index.js)
export default {
  id: 'aviator',
  name: 'Aviator',
  tagline: 'Crash game',
  category: 'crash',
  path: '/games/aviator',
  icon: 'plane',
  image, // lobby / history artwork (src/games/icons)
  bg: 'linear-gradient(160deg,#ff5c7c 0%,#19212e 78%)',
  glow: '#ff2d55',
  badge: 'HOT',
  component: lazy(() => import('./Aviator')),
}
