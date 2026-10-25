import { lazy } from 'react'
import image from '../icons/baccarat.svg'

export default {
  id: 'baccarat',
  name: 'Baccarat',
  tagline: 'Player vs Banker',
  category: 'cards',
  path: '/games/baccarat',
  icon: 'heart',
  image,
  bg: '#4c1d95',
  glow: '#a855f7',
  badge: 'NEW',
  component: lazy(() => import('./Baccarat')),
}