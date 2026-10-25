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
  bg: '#d97706',
  glow: '#fcd34d',
  badge: 'NEW',
  component: lazy(() => import('./CoinFlip')),
}
