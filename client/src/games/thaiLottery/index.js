import { lazy } from 'react'
import image from '../icons/thaiLottery.svg'

export default {
  id: 'thaiLottery',
  name: 'Thai Lottery',
  tagline: '2D & 3D draws',
  category: 'lottery',
  path: '/games/thai-lottery',
  icon: 'ticket',
  image,
  bg: 'linear-gradient(160deg,#f59e0b 0%,#b45309 45%,#713f12 100%)',
  glow: '#fbbf24',
  badge: 'NEW',
  component: lazy(() => import('./ThaiLottery')),
}
