import { lazy } from 'react'
import image from '../icons/threeCard.svg'

export default {
  id: 'threeCard',
  name: '3 Card Poker',
  tagline: 'Play or fold',
  category: 'cards',
  path: '/games/three-card',
  icon: 'heart',
  image,
  bg: 'linear-gradient(160deg,#8b5cf6 0%,#6d28d9 45%,#2e1065 100%)',
  glow: '#a78bfa',
  badge: 'NEW',
  component: lazy(() => import('./ThreeCard')),
}
