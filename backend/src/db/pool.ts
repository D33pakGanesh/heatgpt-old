import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

export const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
})

export async function connectWithRetry(maxAttempts = 3): Promise<void> {
  const delays = [1000, 2000, 4000]

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect()
      client.release()
      console.log('Database connection established')
      return
    } catch (err) {
      console.error(`Database connection attempt ${attempt} failed:`, err)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt - 1]))
      } else {
        throw new Error('Failed to connect to database after maximum retries')
      }
    }
  }
}
