import { lazy } from 'react'
import image from '../icons/lucky6.svg'

export default {
  id: 'lucky6',
  name: 'Lucky 6/49',
  tagline: 'Pick 6 draw 6',
  category: 'lottery',
  path: '/games/lucky-6',
  icon: 'grid',
  image,
  bg: 'linear-gradient(160deg,#34d399 0%,#059669 45%,#064e3b 100%)',
  glow: '#6ee7b7',
  badge: 'NEW',
  component: lazy(() => import('./Lucky6')),
}
