import { lazy } from 'react'
import image from '../icons/blackjack.svg'

export default {
  id: 'blackjack',
  name: 'Blackjack',
  tagline: '21 vs Dealer',
  category: 'cards',
  path: '/games/blackjack',
  icon: 'spade',
  image,
  bg: '#1e293b',
  glow: '#3b82f6',
  badge: 'NEW',
  component: lazy(() => import('./Blackjack')),
}