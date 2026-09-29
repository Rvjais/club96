import { lazy } from 'react'

// Card + route metadata for the Color Prediction game (consumed by src/games/index.js)
export default {
  id: 'color-prediction',
  name: 'Color Prediction',
  tagline: '30s rounds',
  path: '/games/color-prediction',
  icon: 'palette',
  bg: 'linear-gradient(160deg,#ff6b6b 0%,#e02020 45%,#9c27b0 100%)',
  glow: '#ffd54f',
  badge: 'NEW',
  component: lazy(() => import('./ColorPrediction')),
}
