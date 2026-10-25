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
  bg: '#6d28d9',
  glow: '#a78bfa',
  badge: 'NEW',
  component: lazy(() => import('./ThreeCard')),
}
