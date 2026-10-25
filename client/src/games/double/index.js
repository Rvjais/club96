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
  bg: '#c62828',
  glow: '#ff4d4d',
  badge: 'NEW',
  component: lazy(() => import('./Double')),
}