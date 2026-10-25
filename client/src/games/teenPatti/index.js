import { lazy } from 'react'
import image from '../icons/teenPatti.svg'

export default {
  id: 'teenPatti',
  name: 'Teen Patti',
  tagline: '3-Card vs House',
  category: 'cards',
  path: '/games/teen-patti',
  icon: 'heart',
  image,
  bg: '#b91c1c',
  glow: '#f87171',
  badge: 'NEW',
  component: lazy(() => import('./TeenPatti')),
}