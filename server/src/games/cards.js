import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { HttpError, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

export const cardsRouter = Router()
cardsRouter.use(requireAuth)
const suits = ['♠', '♥', '♦', '♣']
const rank = (n) => ({ rank: ['A','2','3','4','5','6','7','8','9','10','J','Q','K'][n % 13], value: n % 13 + 1, suit: suits[Math.floor(n / 13)] })

for (const [game, path] of [['andarBahar', '/andar-bahar/play'], ['dragonTiger', '/dragon-tiger/play']]) {
  cardsRouter.post(path, async (req, res) => {
    const cfg = getSettings(game)
    if (!cfg.enabled) throw new HttpError(403, 'This table is paused')
    const bet = req.body?.bet
    if (!bet || typeof bet !== 'object') throw new HttpError(400, 'Choose a bet')
    const entries = Object.entries(bet).filter(([, v]) => Number(v) > 0)
    if (!entries.length || entries.length > 2) throw new HttpError(400, 'Choose a valid bet')
    const total = entries.reduce((n, [, v]) => n + toPaise(v), 0)
    if (!Number.isInteger(total) || total < Math.round(cfg.minBet * 100) || total > Math.round(cfg.maxBet * 100)) throw new HttpError(400, `Bet must be between ₹${cfg.minBet} and ₹${cfg.maxBet}`)
    const allowed = game === 'andarBahar' ? ['andar','bahar'] : ['dragon','tiger','tie','suitedTie']
    if (entries.some(([k, v]) => !allowed.includes(k) || !Number.isFinite(Number(v)))) throw new HttpError(400, 'Invalid bet selection')
    const deck = crypto.randomInt(0, 2 ** 32)
    const cards = Array.from({ length: 52 }, (_, i) => i)
    for (let i = cards.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]] }
    const card = (i) => rank(cards[i])
    let result, winning, suited = false
    if (game === 'andarBahar') {
      const joker = card(0), match = (c) => c.value === joker.value
      let side = 'andar', matchCard
      for (let i = 1; i < 52; i++) { if (match(card(i))) { winning = side; matchCard = card(i); break } side = side === 'andar' ? 'bahar' : 'andar' }
      result = { joker, matchCard, winning }
    } else {
      const dragon = card(0), tiger = card(1)
      winning = dragon.value === tiger.value ? 'tie' : dragon.value > tiger.value ? 'dragon' : 'tiger'
      suited = winning === 'tie' && dragon.suit === tiger.suit
      result = { dragon, tiger, winning, suited }
    }
    const rates = game === 'andarBahar' ? { andar: cfg.andarPayout, bahar: cfg.baharPayout } : { dragon: cfg.dragonPayout, tiger: cfg.tigerPayout, tie: cfg.tiePayout, suitedTie: cfg.suitedTiePayout }
    let win = 0
    for (const [key, amount] of entries) if (key === winning || (key === 'suitedTie' && suited)) win += Math.floor(toPaise(amount) * rates[key])
    win = Math.min(win, Math.round(cfg.maxWin * 100))
    const ref = `${game}:${Date.now()}:${deck}`
    const balance = await tx(async (session) => {
      let b = await debit(session, req.userId, total, { type: 'bet', game, ref })
      if (win > 0) b = await credit(session, req.userId, win, { type: 'win', game, ref })
      return b
    })
    res.json({ balance: toRupees(balance), win: toRupees(win), result })
  })
}
