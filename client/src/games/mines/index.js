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
  bg: '#b86b00',
  glow: '#ffd27a',
  badge: 'NEW',
  component: lazy(() => import('./Mines')),
}
