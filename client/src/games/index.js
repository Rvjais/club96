// Game registry — every playable game lives in its own folder under src/games/
// and exports its card/route metadata from that folder's index.js.
// To add a game: create src/games/<name>/ with an index.js like aviator's, then list it here.
import aviator from './aviator'
import colorPrediction from './color-prediction'
import mines from './mines'
import tower from './tower'
import plinko from './plinko'
import dice from './dice'
import wheel from './wheel'

export const games = [aviator, colorPrediction, mines, plinko, dice, tower, wheel]

// Lobby filter chips; every game's index.js names one of these keys as its `category`
export const gameCategories = [
  { key: 'all', label: 'All games', icon: 'gamepad' },
  { key: 'crash', label: 'Crash & Multiplier', icon: 'trendingUp' },
  { key: 'grid', label: 'Grid & Mines', icon: 'grid' },
  { key: 'physics', label: 'Drops & Spins', icon: 'pyramid' },
  { key: 'probability', label: 'Dice & Prediction', icon: 'dices' },
]
