import { lazy } from 'react'
import image from '../icons/caribbeanStud.svg'

export default {
  id: 'caribbeanStud',
  name: 'Caribbean Stud',
  tagline: '5-card vs house',
  category: 'cards',
  path: '/games/caribbean-stud',
  icon: 'spade',
  image,
  bg: 'linear-gradient(160deg,#0ea5e9 0%,#0369a1 45%,#082f49 100%)',
  glow: '#38bdf8',
  badge: 'NEW',
  component: lazy(() => import('./CaribbeanStud')),
}
