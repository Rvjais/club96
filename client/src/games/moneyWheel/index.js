import { lazy } from 'react'
import image from '../icons/moneyWheel.svg'

export default {
  id: 'moneyWheel',
  name: 'Money Wheel',
  tagline: 'Big Six spins',
  category: 'physics',
  path: '/games/money-wheel',
  icon: 'wheel',
  image,
  bg: 'linear-gradient(160deg,#a855f7 0%,#6d28d9 45%,#2e1065 100%)',
  glow: '#c084fc',
  badge: 'NEW',
  component: lazy(() => import('./MoneyWheel')),
}
