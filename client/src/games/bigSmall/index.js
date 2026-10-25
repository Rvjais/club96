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
  bg: 'linear-gradient(160deg,#ef4444 0%,#991b1b 45%,#450a0a 100%)',
  glow: '#fca5a5',
  badge: 'NEW',
  component: lazy(() => import('./BigSmall')),
}
