import { lazy } from 'react'
import image from '../icons/plinko.png'

// Card + route metadata for the Plinko game (consumed by src/games/index.js)
export default {
  id: 'plinko',
  name: 'Plinko',
  tagline: 'Drop the ball',
  category: 'physics',
  path: '/games/plinko',
  icon: 'pyramid',
  image, // lobby / history artwork (src/games/icons)
  bg: '#0f766e',
  glow: '#ffc53d',
  badge: 'NEW',
  component: lazy(() => import('./Plinko')),
}
