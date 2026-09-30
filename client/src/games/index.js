// Game registry — every playable game lives in its own folder under src/games/
// and exports its card/route metadata from that folder's index.js.
// To add a game: create src/games/<name>/ with an index.js like aviator's, then list it here.
import aviator from './aviator'
import wingo from './wingo'
import mines from './mines'
import tower from './tower'
import plinko from './plinko'
import dice from './dice'
import wheel from './wheel'

export const games = [wingo, aviator, mines, tower, plinko, wheel, dice]

// Lobby tabs / sections; every game's index.js names one of these keys as its `category`
export const gameCategories = [
  { key: 'all', label: 'Lobby', icon: 'home' },
  { key: 'lottery', label: 'Lottery', icon: 'timer', title: 'Lottery', sub: 'Colour & number draws every 30 seconds to 5 minutes' },
  { key: 'crash', label: 'Crash', icon: 'plane', title: 'Crash', sub: 'Cash out before the plane flies away' },
  { key: 'grid', label: 'Mines & Tower', icon: 'grid', title: 'Mines & Tower', sub: 'Pick safe tiles, cash out any time' },
  { key: 'physics', label: 'Plinko & Wheel', icon: 'wheel', title: 'Plinko & Wheel', sub: 'Drop the ball or spin for a multiplier' },
  { key: 'probability', label: 'Dice', icon: 'dices', title: 'Dice', sub: 'Choose your odds, roll over or under' },
]
