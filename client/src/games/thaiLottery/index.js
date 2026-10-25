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
  bg: '#b45309',
  glow: '#fbbf24',
  badge: 'NEW',
  component: lazy(() => import('./ThaiLottery')),
}
