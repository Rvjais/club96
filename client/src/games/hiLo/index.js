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
  bg: '#15803d',
  glow: '#4ade80',
  badge: 'NEW',
  component: lazy(() => import('./HiLo')),
}