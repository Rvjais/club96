import { lazy } from 'react'
import image from '../icons/scratch.svg'

export default {
  id: 'scratch',
  name: 'Scratch Cards',
  tagline: 'Instant Win',
  category: 'probability',
  path: '/games/scratch',
  icon: 'gift',
  image,
  bg: 'linear-gradient(160deg,#f59e0b 0%,#d97706 45%,#78350f 100%)',
  glow: '#fbbf24',
  badge: 'NEW',
  component: lazy(() => import('./Scratch')),
}