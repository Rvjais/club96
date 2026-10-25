import { lazy } from 'react'
import image from '../icons/paiGow.svg'

export default {
  id: 'paiGow',
  name: 'Pai Gow Poker',
  tagline: 'Win both hands',
  category: 'cards',
  path: '/games/pai-gow',
  icon: 'layers',
  image,
  bg: 'linear-gradient(160deg,#84cc16 0%,#4d7c0f 45%,#1a2e05 100%)',
  glow: '#a3e635',
  badge: 'NEW',
  component: lazy(() => import('./PaiGow')),
}
