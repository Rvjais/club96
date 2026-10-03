import { lazy } from 'react'

export default {
  id: 'horse-racing',
  name: 'Royal Turf Derby',
  tagline: 'Pick a horse to win or place',
  category: 'racing',
  path: '/games/horse-racing',
  icon: 'trophy',
  image: '/horse-racing.svg',
  bg: 'linear-gradient(145deg,#368c54,#132f23 68%,#161a23)',
  glow: '#f7c75a',
  badge: 'NEW',
  component: lazy(() => import('./HorseRacing')),
}
