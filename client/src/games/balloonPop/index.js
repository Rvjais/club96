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
  bg: 'linear-gradient(160deg,#ec4899 0%,#be185d 45%,#500724 100%)',
  glow: '#f472b6',
  badge: 'NEW',
  component: lazy(() => import('./BalloonPop')),
}
