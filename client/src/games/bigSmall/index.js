import { lazy } from 'react'
import image from '../icons/bigSmall.svg'

export default {
  id: 'bigSmall',
  name: 'Big / Small',
  tagline: 'Three dice sic bo',
  category: 'probability',
  path: '/games/big-small',
  icon: 'dices',
  image,
  bg: '#991b1b',
  glow: '#fca5a5',
  badge: 'NEW',
  component: lazy(() => import('./BigSmall')),
}
