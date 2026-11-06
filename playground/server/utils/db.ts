import pg from 'pg'

// The app's own pool for its own tables (orders). OpenReceive gets a separate
// managed pool from DATABASE_URL; `onPaid` still writes through the
// settlement transaction's `query`, so both stay consistent.
let pool: pg.Pool | undefined

export function useDb(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL })
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
  const { rows } = await useDb().query<Order>('SELECT * FROM orders WHERE id = $1', [id])
  return rows[0]
}
