import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = path.join(serverDir, '..')

export const IS_PROD = process.env.NODE_ENV === 'production'
export const PORT = Number(process.env.PORT) || 4000

export const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  console.error('\n  MONGODB_URI is not set.\n  Copy server/.env.example to server/.env and paste your MongoDB Atlas connection string.\n')
  process.exit(1)
}

// Built frontends, served by Express in production
export const CLIENT_DIST = path.join(rootDir, 'client', 'dist')
export const ADMIN_DIST = path.join(rootDir, 'admin', 'dist')

// All money is stored in paise (integer) to avoid floating point errors.
// The sign-up bonus and minimum balance to play are set in the admin panel (settings.js → platform).
export const DEMO_DEPOSITS = process.env.DEMO_DEPOSITS !== 'false'

export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || (IS_PROD ? null : 'admin')
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PROD ? null : 'admin123')

// JWT secret: env var in production; in development generate one and keep it
// in server/.dev-secret so sessions survive restarts.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (IS_PROD) throw new Error('JWT_SECRET must be set in production')
  const file = path.join(serverDir, '.dev-secret')
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim()
  const secret = crypto.randomBytes(48).toString('hex')
  fs.writeFileSync(file, secret, { mode: 0o600 })
  return secret
}

export const JWT_SECRET = loadSecret()
export const SESSION_DAYS = 7
export const ADMIN_SESSION_HOURS = 12
