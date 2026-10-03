import crypto from 'node:crypto'
import { Router } from 'express'
import { tx } from '../db.js'
import { requireAuth } from '../auth.js'
import { HttpError, credit, debit, toPaise, toRupees } from '../wallet.js'
import { getSettings } from '../settings.js'

export const horseRacingRouter = Router()
horseRacingRouter.use(requireAuth)

const HORSES = [
  { id: 1, name: 'Thunderbolt', jockey: 'L. Dettori', silk: '#e84b4b', form: '1-1-2' },
  { id: 2, name: 'Royal Sovereign', jockey: 'R. Moore', silk: '#3984e8', form: '2-1-3' },
  { id: 3, name: 'Crimson Comet', jockey: 'W. Buick', silk: '#11a978', form: '3-2-1' },
  { id: 4, name: 'Shadow Dancer', jockey: 'H. Doyle', silk: '#eea51c', form: '1-4-2' },
  { id: 5, name: 'Celtic Pride', jockey: 'O. Murphy', silk: '#8c62d5', form: '4-3-2' },
  { id: 6, name: 'Lucky Vagabond', jockey: 'C. Soumillon', silk: '#16aec1', form: '6-2-4' },
]
const BASE_ODDS = [2.2, 3.4, 5, 7.5, 11, 18]
const runnerList = HORSES.map((h, i) => ({ ...h, winOdds: BASE_ODDS[i], placeOdds: Math.round((BASE_ODDS[i] * 0.45 + 0.35) * 100) / 100 }))
const randomUnit = () => crypto.randomInt(1, 1_000_001) / 1_000_001
function weightedPick(list) {
  const total = list.reduce((sum, h) => sum + h.weight, 0)
  let point = randomUnit() * total
  for (const h of list) { point -= h.weight; if (point <= 0) return h }
  return list.at(-1)
}

horseRacingRouter.get('/state', async (req, res) => {
  const { enabled, minBet, maxBet, maxWin, houseEdge } = getSettings('horseRacing')
  res.json({ rules: { enabled, minBet, maxBet, maxWin, houseEdge }, horses: runnerList })
})

horseRacingRouter.post('/race', async (req, res) => {
  const cfg = getSettings('horseRacing')
  if (!cfg.enabled) throw new HttpError(403, 'Horse racing is paused')
  const amount = toPaise(req.body?.amount)
  if (!Number.isInteger(amount) || amount < Math.round(cfg.minBet * 100)) throw new HttpError(400, `Minimum bet is ₹${cfg.minBet.toLocaleString('en-IN')}`)
  if (amount > Math.round(cfg.maxBet * 100)) throw new HttpError(400, `Maximum bet is ₹${cfg.maxBet.toLocaleString('en-IN')}`)
  const horseId = Number(req.body?.horseId)
  const betType = req.body?.betType
  if (!HORSES.some((h) => h.id === horseId)) throw new HttpError(400, 'Choose a horse')
  if (betType !== 'win' && betType !== 'place') throw new HttpError(400, 'Choose win or place')

  const runners = runnerList.map((h) => ({ ...h, weight: 1 / h.winOdds }))
  const first = weightedPick(runners)
  const second = weightedPick(runners.filter((h) => h.id !== first.id))
  const payoutOdds = betType === 'win'
    ? first.id === horseId ? first.winOdds : runners.find((h) => h.id === horseId).winOdds
    : runners.find((h) => h.id === horseId).placeOdds
  const placed = betType === 'win' ? first.id === horseId : first.id === horseId || second.id === horseId
  const win = placed ? Math.min(Math.floor(amount * payoutOdds * (1 - cfg.houseEdge / 100)), Math.round(cfg.maxWin * 100)) : 0
  const ref = `horse:${crypto.randomUUID()}`
  const balance = await tx(async (session) => {
    let current = await debit(session, req.userId, amount, { type: 'bet', game: 'horseRacing', ref })
    if (win > 0) current = await credit(session, req.userId, win, { type: 'win', game: 'horseRacing', ref })
    return current
  })
  const publicHorse = ({ weight, ...h }) => h
  res.json({ balance: toRupees(balance), win: toRupees(win), placed, first: publicHorse(first), second: publicHorse(second), horses: runners.map(publicHorse) })
})
