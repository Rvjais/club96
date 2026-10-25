import { lazy } from 'react'
import image from '../icons/redDog.svg'

export default {
  id: 'redDog',
  name: 'Red Dog',
  tagline: 'Shoot the spread',
  category: 'cards',
  path: '/games/red-dog',
  icon: 'spade',
  image,
  bg: '#9a3412',
  glow: '#fb923c',
  badge: 'NEW',
  component: lazy(() => import('./RedDog')),
}
