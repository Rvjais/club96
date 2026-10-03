import { lazy } from 'react'
import image from '../icons/poker.png'
export default { id: 'andar-bahar', name: 'Andar Bahar', tagline: 'Find the matching side', category: 'cards', path: '/games/andar-bahar', icon: 'club', image, bg: 'linear-gradient(145deg,#d49b32,#6b361b 60%,#16101a)', glow: '#f3c768', component: lazy(() => import('./Table')) }
