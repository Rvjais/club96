import { lazy } from 'react'
import image from '../icons/coinFlip.svg'

export default {
  id: 'coinFlip',
  name: 'Coin Flip',
  tagline: 'Heads or Tails',
  category: 'probability',
  path: '/games/coin-flip',
  icon: 'coins',
  image,
  bg: 'linear-gradient(160deg,#fbbf24 0%,#d97706 45%,#7c2d12 100%)',
  glow: '#fcd34d',
  badge: 'NEW',
  component: lazy(() => import('./CoinFlip')),
}
