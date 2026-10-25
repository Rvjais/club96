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
  bg: '#4d7c0f',
  glow: '#a3e635',
  badge: 'NEW',
  component: lazy(() => import('./PaiGow')),
}
