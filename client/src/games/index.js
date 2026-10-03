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
import poker from './poker'
import andarBahar from './andarBahar'
import dragonTiger from './dragonTiger'
import horseRacing from './horseRacing'

export const games = [wingo, aviator, poker, andarBahar, dragonTiger, horseRacing, mines, tower, plinko, wheel, dice]

// Artwork per game id, for history and stats lists
export const gameImages = Object.fromEntries(games.map((g) => [g.id, g.image]))

// Lobby tabs / sections; every game's index.js names one of these keys as its `category`
export const gameCategories = [
  { key: 'all', label: 'Lobby', icon: 'home' },
  { key: 'lottery', label: 'Lottery', icon: 'timer', title: 'Lottery', sub: 'Colour & number draws every 30 seconds to 5 minutes' },
  { key: 'crash', label: 'Crash', icon: 'plane', title: 'Crash', sub: 'Cash out before the plane flies away' },
  { key: 'cards', label: 'Poker', icon: 'club', title: 'Poker', sub: "Texas Hold'em against the table — buy in, cash out any time" },
  { key: 'racing', label: 'Racing', icon: 'trophy', title: 'Horse Racing', sub: 'Choose a runner and back it to win or place' },
  { key: 'grid', label: 'Mines & Tower', icon: 'grid', title: 'Mines & Tower', sub: 'Pick safe tiles, cash out any time' },
  { key: 'physics', label: 'Plinko & Wheel', icon: 'wheel', title: 'Plinko & Wheel', sub: 'Drop the ball or spin for a multiplier' },
  { key: 'probability', label: 'Dice', icon: 'dices', title: 'Dice', sub: 'Choose your odds, roll over or under' },
]
