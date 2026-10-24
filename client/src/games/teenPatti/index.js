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
  bg: 'linear-gradient(160deg,#dc2626 0%,#b91c1c 45%,#450a0a 100%)',
  glow: '#f87171',
  badge: 'NEW',
  component: lazy(() => import('./TeenPatti')),
}