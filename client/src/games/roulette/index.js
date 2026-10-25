import { lazy } from 'react'
import image from '../icons/roulette.svg'

export default {
  id: 'roulette',
  name: 'Roulette',
  tagline: 'Single-zero wheel',
  category: 'physics',
  path: '/games/roulette',
  icon: 'wheel',
  image,
  bg: 'linear-gradient(160deg,#16a34a 0%,#14532d 45%,#052e16 100%)',
  glow: '#4ade80',
  badge: 'NEW',
  component: lazy(() => import('./Roulette')),
}
