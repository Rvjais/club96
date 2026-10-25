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
  bg: 'linear-gradient(160deg,#14b8a6 0%,#0f766e 45%,#134e4a 100%)',
  glow: '#2dd4bf',
  badge: 'NEW',
  component: lazy(() => import('./HighCard')),
}
