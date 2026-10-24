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
  bg: 'linear-gradient(160deg,#7e22ce 0%,#4c1d95 45%,#1a0a2e 100%)',
  glow: '#a855f7',
  badge: 'NEW',
  component: lazy(() => import('./Baccarat')),
}