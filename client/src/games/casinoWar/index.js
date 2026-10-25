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
  bg: 'linear-gradient(160deg,#2563eb 0%,#1e3a8a 45%,#111c4f 100%)',
  glow: '#60a5fa',
  badge: 'NEW',
  component: lazy(() => import('./CasinoWar')),
}
