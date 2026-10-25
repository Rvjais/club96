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
  bg: '#7e22ce',
  glow: '#d8b4fe',
  badge: 'NEW',
  component: lazy(() => import('./Keno')),
}