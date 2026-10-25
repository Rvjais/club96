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
  bg: '#14532d',
  glow: '#4ade80',
  badge: 'NEW',
  component: lazy(() => import('./Roulette')),
}
