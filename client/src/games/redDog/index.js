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
  bg: 'linear-gradient(160deg,#ea580c 0%,#9a3412 45%,#431407 100%)',
  glow: '#fb923c',
  badge: 'NEW',
  component: lazy(() => import('./RedDog')),
}
