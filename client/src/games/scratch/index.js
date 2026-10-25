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
  bg: '#d97706',
  glow: '#fbbf24',
  badge: 'NEW',
  component: lazy(() => import('./Scratch')),
}