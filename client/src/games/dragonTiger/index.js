import { lazy } from 'react'
import image from '../icons/poker.png'
export default { id: 'dragon-tiger', name: 'Dragon Tiger', tagline: 'Dragon, Tiger or Tie', category: 'cards', path: '/games/dragon-tiger', icon: 'club', image, bg: '#602020', glow: '#ff776d', component: lazy(() => import('./Table')) }
