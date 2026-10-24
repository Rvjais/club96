import { lazy } from 'react'
import image from '../icons/keno.svg'

export default {
  id: 'keno',
  name: 'Keno',
  tagline: 'Pick & Win',
  category: 'lottery',
  path: '/games/keno',
  icon: 'grid',
  image,
  bg: 'linear-gradient(160deg,#a855f7 0%,#7e22ce 45%,#1a0a2e 100%)',
  glow: '#d8b4fe',
  badge: 'NEW',
  component: lazy(() => import('./Keno')),
}