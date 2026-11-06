import { createTestWallet } from './utils/test-wallet'

export default defineOpenReceiveHost(() => ({
  // Price comes from the order row, never from the request.
  amountFor: async (reference) => {
    const order = await findOrder(reference)
    return order?.state === 'awaiting_payment'
      ? { sats: order.amount_sats, description: order.title }
      : null
  },

  // Only the buyer may pay for their order. `event` is the H3 event.
  authorize: async ({ event, resource }) => {
    const order = resource.reference ? await findOrder(resource.reference) : undefined
    return Boolean(order && order.visitor === getCookie(event, 'visitor'))
  },

  // Runs once, inside the settlement transaction. Writes go through `query`.
  onPaid: async ({ reference, paidAt, query }) => {
    await query(
      `UPDATE orders SET state = 'paid', paid_at = to_timestamp($1)
        WHERE id = $2 AND state = 'awaiting_payment'`,
      [paidAt, reference],
    )
  },

  // Playground/tests only: a fake receive-only wallet instead of a real NWC code.
  ...(process.env.OPENRECEIVE_TEST_WALLET === '1' ? { wallet: { service: createTestWallet() } } : {}),
}))
