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
  bg: '#0369a1',
  glow: '#38bdf8',
  badge: 'NEW',
  component: lazy(() => import('./CaribbeanStud')),
}
