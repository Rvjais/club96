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
  bg: '#6d28d9',
  glow: '#c084fc',
  badge: 'NEW',
  component: lazy(() => import('./MoneyWheel')),
}
