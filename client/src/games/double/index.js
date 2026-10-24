import { lazy } from 'react'
import image from '../icons/double.svg'

export default {
  id: 'double',
  name: 'Double',
  tagline: 'Red or Black',
  category: 'probability',
  path: '/games/double',
  icon: 'circleHalf',
  image,
  bg: 'linear-gradient(160deg,#ff6b6b 0%,#c62828 45%,#1a1a2e 100%)',
  glow: '#ff4d4d',
  badge: 'NEW',
  component: lazy(() => import('./Double')),
}