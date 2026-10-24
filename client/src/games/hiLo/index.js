import { lazy } from 'react'
import image from '../icons/hiLo.svg'

export default {
  id: 'hiLo',
  name: 'Hi-Lo',
  tagline: 'Higher or Lower',
  category: 'cards',
  path: '/games/hi-lo',
  icon: 'sortUp',
  image,
  bg: 'linear-gradient(160deg,#22c55e 0%,#15803d 45%,#0a1a0f 100%)',
  glow: '#4ade80',
  badge: 'NEW',
  component: lazy(() => import('./HiLo')),
}