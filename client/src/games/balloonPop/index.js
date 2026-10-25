import { lazy } from 'react'
import image from '../icons/balloonPop.svg'

export default {
  id: 'balloonPop',
  name: 'Balloon Pop',
  tagline: 'Prize or pop',
  category: 'probability',
  path: '/games/balloon-pop',
  icon: 'zap',
  image,
  bg: '#be185d',
  glow: '#f472b6',
  badge: 'NEW',
  component: lazy(() => import('./BalloonPop')),
}
