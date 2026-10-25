import { lazy } from 'react'
import image from '../icons/casinoWar.svg'

export default {
  id: 'casinoWar',
  name: 'Casino War',
  tagline: 'Tie? Go to war',
  category: 'cards',
  path: '/games/casino-war',
  icon: 'crown',
  image,
  bg: '#1e3a8a',
  glow: '#60a5fa',
  badge: 'NEW',
  component: lazy(() => import('./CasinoWar')),
}
