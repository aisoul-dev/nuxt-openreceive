// Create the payable row BEFORE checkout; its id is the OpenReceive `reference`.
export default defineEventHandler(async (event) => {
  const visitor = useVisitor(event)
  const { rows } = await (await useDb()).query<{ id: string }>(
    `INSERT INTO orders (visitor, title, amount_sats) VALUES ($1, $2, $3) RETURNING id`,
    [visitor, 'Pro plan, 1 month', 2100],
  )
  return { id: rows[0]!.id }
})
