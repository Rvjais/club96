import { lazy } from 'react'
import image from '../icons/highCard.svg'

export default {
  id: 'highCard',
  name: 'High Card Draw',
  tagline: 'Beat the dealer',
  category: 'probability',
  path: '/games/high-card',
  icon: 'spade',
  image,
  bg: '#0f766e',
  glow: '#2dd4bf',
  badge: 'NEW',
  component: lazy(() => import('./HighCard')),
}
