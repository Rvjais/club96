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
import double from './double'
import hiLo from './hiLo'
import keno from './keno'
import blackjack from './blackjack'
import baccarat from './baccarat'
import scratch from './scratch'
import teenPatti from './teenPatti'
import coinFlip from './coinFlip'
import highCard from './highCard'
import balloonPop from './balloonPop'
import redDog from './redDog'
import casinoWar from './casinoWar'
import threeCard from './threeCard'
import caribbeanStud from './caribbeanStud'
import paiGow from './paiGow'
import thaiLottery from './thaiLottery'
import lucky6 from './lucky6'
import bigSmall from './bigSmall'
import roulette from './roulette'
import moneyWheel from './moneyWheel'

export const games = [wingo, aviator, poker, andarBahar, dragonTiger, horseRacing, mines, tower, plinko, wheel, dice, double, hiLo, keno, blackjack, baccarat, scratch, teenPatti, coinFlip, highCard, balloonPop, redDog, casinoWar, threeCard, caribbeanStud, paiGow, thaiLottery, lucky6, bigSmall, roulette, moneyWheel]

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
