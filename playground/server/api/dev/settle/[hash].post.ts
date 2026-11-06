import { settleTestInvoice } from '../../../utils/test-wallet'

// PLAYGROUND ONLY: pretend the payer paid. Disabled unless the test wallet is on.
export default defineEventHandler((event) => {
  if (process.env.OPENRECEIVE_TEST_WALLET !== '1') {
    throw createError({ statusCode: 404 })
  }
  return { settled: settleTestInvoice(getRouterParam(event, 'hash') ?? '') }
})
