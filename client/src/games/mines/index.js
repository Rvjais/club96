import { lazy } from 'react'
import image from '../icons/mines.png'

// Card + route metadata for the Mines game (consumed by src/games/index.js)
export default {
  id: 'mines',
  name: 'Mines',
  tagline: 'Find the gems',
  category: 'grid',
  path: '/games/mines',
  icon: 'bomb',
  image, // lobby / history artwork (src/games/icons)
  bg: 'linear-gradient(160deg,#ffc24d 0%,#b86b00 45%,#1e2940 100%)',
  glow: '#ffd27a',
  badge: 'NEW',
  component: lazy(() => import('./Mines')),
}
