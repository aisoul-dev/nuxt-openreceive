import pg from 'pg'

// The app's own pool for its own tables (orders). OpenReceive gets a separate
// managed pool from DATABASE_URL; `onPaid` still writes through the
// settlement transaction's `query`, so both stay consistent.
let pool: pg.Pool | undefined
let schema: Promise<void> | undefined

/**
 * The pool, once the app's tables exist. Nitro does not await async plugins,
 * so the first request can arrive before a startup CREATE TABLE has finished:
 * every query goes through this instead.
 */
export async function useDb(): Promise<pg.Pool> {
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL })
  schema ??= pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      visitor text NOT NULL,
      title text NOT NULL,
      amount_sats bigint NOT NULL,
      state text NOT NULL DEFAULT 'awaiting_payment',
      paid_at timestamptz
    )`).then(() => undefined, (error) => {
    schema = undefined
    throw error
  })
  await schema
  return pool
}

export interface Order {
  id: string
  visitor: string
  title: string
  amount_sats: string
  state: 'awaiting_payment' | 'paid'
  paid_at: string | null
}

export async function findOrder(id: string): Promise<Order | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined
  const { rows } = await (await useDb()).query<Order>('SELECT * FROM orders WHERE id = $1', [id])
  return rows[0]
}
