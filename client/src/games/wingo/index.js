import { lazy } from 'react'
import image from '../icons/wingo.png'

// Card + route metadata for the Win Go game (consumed by src/games/index.js)
export default {
  id: 'wingo',
  name: 'Win Go',
  tagline: 'Colour & number',
  category: 'lottery',
  path: '/games/wingo',
  icon: 'timer',
  image, // lobby / history artwork (src/games/icons)
  bg: 'linear-gradient(160deg,#ff8a8a 0%,#e02020 45%,#9c27b0 100%)',
  glow: '#ffd54f',
  badge: 'HOT',
  // One lobby card per room
  rooms: [
    { key: '30s', label: 'Win Go 30s' },
    { key: '1m', label: 'Win Go 1Min' },
    { key: '3m', label: 'Win Go 3Min' },
    { key: '5m', label: 'Win Go 5Min' },
  ],
  component: lazy(() => import('./WinGo')),
}
