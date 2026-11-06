// Playground only: the app's own orders table.
export default defineNitroPlugin(async () => {
  await useDb().query(`
    CREATE TABLE IF NOT EXISTS orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      visitor text NOT NULL,
      title text NOT NULL,
      amount_sats bigint NOT NULL,
      state text NOT NULL DEFAULT 'awaiting_payment',
      paid_at timestamptz
    )`)
})
