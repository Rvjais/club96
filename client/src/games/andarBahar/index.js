import { lazy } from 'react'
import image from '../icons/poker.png'
export default { id: 'andar-bahar', name: 'Andar Bahar', tagline: 'Find the matching side', category: 'cards', path: '/games/andar-bahar', icon: 'club', image, bg: '#6b361b', glow: '#f3c768', component: lazy(() => import('./Table')) }
