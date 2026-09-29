// Game registry — every playable game lives in its own folder under src/games/
// and exports its card/route metadata from that folder's index.js.
// To add a game: create src/games/<name>/ with an index.js like aviator's, then list it here.
import aviator from './aviator'
import colorPrediction from './color-prediction'

export const games = [aviator, colorPrediction]
