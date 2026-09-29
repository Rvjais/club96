import mongoose from 'mongoose'
import { MONGODB_URI } from './config.js'

export async function connectDb() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  console.log(`MongoDB connected (${mongoose.connection.name})`)
}

/**
 * Run fn(session) inside a MongoDB transaction (Atlas clusters are replica sets,
 * so multi-document transactions are available). Retries on transient errors.
 */
export function tx(fn) {
  return mongoose.connection.transaction((session) => fn(session))
}
