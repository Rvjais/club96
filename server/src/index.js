import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import { ADMIN_DIST, CLIENT_DIST, IS_PROD, PORT } from './config.js'
import { connectDb } from './db.js'
import { authRouter } from './auth.js'
import { walletRouter } from './routes/wallet.js'
import { accountRouter } from './routes/account.js'
import { adminRouter, seedAdmin } from './routes/admin.js'
import { aviatorRouter, startAviator } from './games/aviator.js'
import { refundRetiredColorBets } from './games/color.js'
import { startWingo, wingoRouter } from './games/wingo.js'
import { minesRouter } from './games/mines.js'
import { towerRouter } from './games/tower.js'
import { plinkoRouter } from './games/plinko.js'
import { diceRouter } from './games/dice.js'
import { wheelRouter } from './games/wheel.js'
import { spinRouter } from './games/spin.js'
import { pokerRouter } from './games/poker.js'
import { cardsRouter } from './games/cards.js'
import { supportRouter } from './routes/support.js'
import { promotionRouter, startReferrals } from './referral.js'
import { HttpError } from './wallet.js'
import { loadSettings } from './settings.js'

const app = express()
app.disable('x-powered-by')
// Behind Render's proxy (and Vercel's /api rewrite) the real client IP is in X-Forwarded-For
app.set('trust proxy', IS_PROD ? true : 'loopback')
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/wallet', walletRouter)
app.use('/api/account', accountRouter)
app.use('/api/support', supportRouter)
app.use('/api/promotion', promotionRouter)
app.use('/api/games/aviator', aviatorRouter)
app.use('/api/games/wingo', wingoRouter)
app.use('/api/games/mines', minesRouter)
app.use('/api/games/tower', towerRouter)
app.use('/api/games/plinko', plinkoRouter)
app.use('/api/games/dice', diceRouter)
app.use('/api/games/wheel', wheelRouter)
app.use('/api/games/spin', spinRouter)
app.use('/api/games/poker', pokerRouter)
app.use('/api/games/cards', cardsRouter)
app.use('/api/admin', adminRouter)
app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')))

// In production, serve the built admin panel at /admin and the site at /
if (IS_PROD) {
  if (fs.existsSync(ADMIN_DIST)) {
    app.use('/admin', express.static(ADMIN_DIST))
    app.get(/^\/admin(\/.*)?$/, (req, res) => res.sendFile(path.join(ADMIN_DIST, 'index.html')))
  }
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST))
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')))
  } else {
    // Backend-only deploy (site hosted on Vercel): the root opens the admin panel
    app.get('/', (req, res) => res.redirect('/admin/'))
  }
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500)
  if (status >= 500) console.error(err)
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message })
})

await connectDb()
await loadSettings()
await seedAdmin()
await startAviator()
await refundRetiredColorBets()
await startWingo()
startReferrals()

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`))
