// End-to-end: builds the playground, boots it on the in-memory test wallet,
// and walks a payment through the module's routes against real Postgres.
//
//   DATABASE_URL=postgres://user:pass@localhost:5432/db npm test
//
// Skipped when DATABASE_URL is not set.
import { spawn, execFileSync } from 'node:child_process'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const DATABASE_URL = process.env.DATABASE_URL
const PORT = 3911
const BASE = `http://localhost:${PORT}`
const JSON_HEADERS = { 'content-type': 'application/json', origin: BASE }

let server

before(async () => {
  if (!DATABASE_URL) return
  execFileSync('npx', ['nuxi', 'build', 'playground'], { cwd: root, stdio: 'ignore' })
  server = spawn('node', ['playground/.output/server/index.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), DATABASE_URL, OPENRECEIVE_TEST_WALLET: '1' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE)
      return
    }
    catch {
      await new Promise(r => setTimeout(r, 200))
    }
  }
  throw new Error('playground did not start')
}, { timeout: 300_000 })

after(() => server?.kill())

async function call(path, body, cookie) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null), res }
}

test('payment flow through nuxt-openreceive', { skip: !DATABASE_URL && 'DATABASE_URL not set' }, async () => {
  const order = await call('/api/orders')
  const cookie = order.res.headers.get('set-cookie').split(';')[0]
  const reference = order.body.id

  // css: true ships the stylesheet with the checkout's chunk, not every page's entry CSS.
  const home = await fetch(BASE).then(r => r.text())
  assert.doesNotMatch(home, /openreceive-root|rel="stylesheet"/, 'a page without the checkout ships no checkout CSS')
  const unpaid = await fetch(`${BASE}/checkout/${reference}`, { headers: { cookie } }).then(r => r.text())
  assert.match(unpaid, /openreceive-root/, 'the checkout page ships its CSS')

  const stranger = await call('/openreceive/checkouts/prepare', { reference })
  assert.equal(stranger.status, 403, 'authorize denies a visitor who does not own the order')

  const spoof = await call('/openreceive/checkouts', { reference, amount: { sats: 1 } }, cookie)
  assert.equal(spoof.status, 400, 'payer-supplied amounts are refused')

  const created = await call('/openreceive/checkouts', { reference }, cookie)
  assert.equal(created.status, 201)
  assert.equal(created.body.checkout.amount_msats, 2_100_000, 'price comes from amountFor')
  const paymentHash = created.body.checkout.payment_hash

  const pending = await call('/openreceive/payments/check', { reference, payment_hash: paymentHash }, cookie)
  assert.equal(pending.body.status, 'pending')

  await call(`/api/dev/settle/${paymentHash}`)

  // Settlement lands on a later check once the reconcile gate's interval passes.
  let status
  for (let i = 0; i < 30 && status !== 'settled'; i++) {
    await new Promise(r => setTimeout(r, 1000))
    status = (await call('/openreceive/payments/check', { reference, payment_hash: paymentHash }, cookie)).body.status
  }
  assert.equal(status, 'settled')

  const page = await fetch(`${BASE}/checkout/${reference}`, { headers: { cookie } }).then(r => r.text())
  assert.match(page, /Paid, thank you!/, 'onPaid marked the order paid')

  const again = await call('/openreceive/checkouts', { reference }, cookie)
  assert.ok(again.status >= 400, 'a paid order cannot start a new checkout')
})
