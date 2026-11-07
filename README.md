# nuxt-openreceive

[![CI](https://github.com/aisoul-dev/nuxt-openreceive/actions/workflows/ci.yml/badge.svg)](https://github.com/aisoul-dev/nuxt-openreceive/actions/workflows/ci.yml)

Nuxt module for [OpenReceive](https://openreceive.org): accept Bitcoin over Lightning, plus optional USDT / USDC / ETH / SOL through a swap provider. Payments settle straight into **your own wallet**. You don't need an account or an API key, and no third party ever holds your funds.

OpenReceive doesn't ship a Nuxt package. Its docs have you copy a server route, a lazy singleton, IP wiring and a checkout page by hand. This module does that wiring for you, so all you write is the host file:

- mounts the payment routes at `/openreceive/**` (configurable)
- builds the OpenReceive stack lazily on the first request (builds and prerendering never touch the wallet) and retries if boot fails
- reads secrets from Nuxt `runtimeConfig` (`NUXT_OPENRECEIVE_*`), falling back to OpenReceive's own `NWC_URI`, `LSC_URI_*` and `DATABASE_URL`
- manages a `pg` pool for you, or takes your own handle, Supabase, or a custom repository
- gives `authorize` a typed `event: H3Event`, so it can read your existing session
- turns on per-IP rate limiting with `getRequestIP` wired in
- registers `<OpenReceiveCheckout>` globally with the prefix already filled in, ships it pre-compiled, and handles the CSS and Vite pre-bundling
- stops the build on edge presets, since the wallet client and SQL driver need Node
- closes the wallet connection and the pool when Nitro shuts down

## Tested with real money

On top of CI (a full payment e2e against Postgres on an in-memory test wallet), the module was tested by hand end to end in a Nuxt 4 tip jar app, with no test doubles:

- SOL sent from an exchange went through the Lightning Swap provider to a Lightning invoice, and **3 000 sats landed in the receiving wallet** (Rizful, connected with a receive-only NWC code).
- The checkout showed settlement verified by the backend, and `onPaid` marked the order paid inside the settlement transaction.

The swap refund path (`refund_required`) has not been tested with real funds yet.

## Install

```sh
pnpm add nuxt-openreceive pg
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-openreceive'],
})
```

```sh
# .env (server only, never NUXT_PUBLIC_*)
NUXT_OPENRECEIVE_NWC_URI=nostr+walletconnect://...      # receive-only code from your wallet
NUXT_OPENRECEIVE_DATABASE_URL=postgres://...            # or DATABASE_URL
# optional, for USDT/USDC/ETH/SOL swaps:
NUXT_OPENRECEIVE_LSC_URI_PRIMARY=lightning+swapconnect://...
```

To get a receive-only NWC code, use Rizful (menu → NWC → *Receive-only*) or Alby Hub (Connections → Add Connection → *Read Only*). See the [guide](https://openreceive.org/get_a_nwc_code_to_receive_payments). OpenReceive refuses to boot with a code that can spend.

Create the payment tables once through your own migrations:

```ts
// e.g. a one-off Nitro task or your migration tool: the DDL is idempotent
await db.query(openReceiveSchemaSql('postgres')) // auto-imported on the server
```

`npx openreceive scaffold payments --orm drizzle` (or prisma, knex, ...) emits the same tables as an ORM migration.

Or set `openreceive: { migrate: true }` to run the DDL on boot when the module manages the pool.

## The host file

`server/openreceive.ts` is how OpenReceive talks to your app: three hooks mapped onto **your** existing order and user tables.

```ts
// server/openreceive.ts
export default defineOpenReceiveHost({
  // The trusted price, from YOUR order row. Never from the request.
  amountFor: async (reference) => {
    const order = await findOrder(reference)
    return order?.state === 'awaiting_payment'
      ? { currency: 'USD', value: order.total, description: order.title } // decimal string
      : null // → 404
  },

  // Runs on every payment request. `resource.reference` is a claim, not proof.
  authorize: async ({ event, resource }) => {
    const { user } = await getUserSession(event) // nuxt-auth-utils, Supabase, ...
    const order = resource.reference ? await findOrder(resource.reference) : undefined
    return Boolean(user && order?.userId === user.id)
  },

  // Once per order, INSIDE the settlement transaction. Write through `query`.
  onPaid: async ({ reference, paidAt, query }) => {
    await query(
      `UPDATE orders SET state = 'paid', paid_at = to_timestamp($1)
        WHERE id = $2 AND state = 'awaiting_payment'`,
      [paidAt, reference],
    )
  },
})
```

Pass a function instead (`defineOpenReceiveHost(() => ({ ... }))`) to defer work until the first payment request.

### Rules that matter

- **`reference` is your order id.** Create the order before checkout, keep its id across retries, and never reuse it. If you generate a fresh id on every page load, one order can be paid twice.
- **`onPaid` is for database writes only, and it must be idempotent.** Send emails and webhooks after the commit, from your own worker or an outbox table. Writes made through your ORM's own connection survive a rolled-back settlement; writes made through `query` don't.
- **Lightning payments can't be refunded by the merchant.** The wallet code is receive-only. The only refunds are swap refunds (see below).

### Bring your own storage

```ts
export default defineOpenReceiveHost(() => ({
  amountFor, authorize,
  // your existing pg Pool (Drizzle: pass the Pool underneath it), mysql2, node:sqlite, better-sqlite3
  storage: { db: usePgPool(), onPaid },
  // or Supabase over HTTPS (fulfillment is the SQL function public.openreceive_on_paid):
  // storage: { supabase: { url: process.env.SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! } },
}))
```

## The checkout page

```vue
<!-- app/pages/checkout/[reference].vue -->
<script setup lang="ts">
const route = useRoute()
// your own route that 404s unless the visitor owns the order
const { data, refresh } = await useFetch(`/api/checkout/${route.params.reference}`)
const settledHere = ref(false)
</script>

<template>
  <p>{{ data?.state === 'paid' ? 'Paid' : 'Awaiting payment' }}</p>
  <!-- show it only while unpaid, but keep it mounted once it settles: it is the receipt -->
  <OpenReceiveCheckout
    v-if="data && (data.state !== 'paid' || settledHere)"
    :reference="data.reference"
    :resumable="true"
    :onSettled="() => { settledHere = true; refresh() }"
  />
</template>
```

Every `@openreceive/vue` prop passes through. Event handlers (`onSettled`, `onState`, …) are **props** (`:onSettled`), not `@settled`.

**Swaps:** if you set `LSC_URI_PRIMARY`, the checkout must live at a per-order URL the payer can come back to (`/checkout/:reference`), and `authorize` must still recognise them hours later. A deposit that arrives short or late becomes `refund_required` and is claimed on that second visit. See [swap refunds](https://openreceive.org/guides/swap-refunds.md).

## Options

```ts
openreceive: {
  prefix: '/openreceive',              // route prefix; the component uses it too
  host: '~~/server/openreceive',       // host definition file
  component: true,                     // true → <OpenReceiveCheckout>, string → custom name, false → none
  css: true,                           // add @openreceive/vue/styles.css
  rateLimiting: true,                  // or { limitPerHour, limitPerDay, message }
  trustProxy: false,                   // read x-forwarded-for (only behind YOUR proxy)
  migrate: false,                      // run the payment-table DDL on boot (managed pool only)
}
```

Server auto-imports: `defineOpenReceiveHost`, `useOpenReceive()` (the booted stack, if you need `handler` in a custom route), and `openReceiveSchemaSql(dialect)`.

## Deploying

- Runs on `node-server` and on Node serverless presets (Vercel, Netlify, AWS Lambda). On serverless, use a **pooled** database URL. Edge presets are refused at build time.
- You don't need a worker or a cron job. Every payment request runs a reconcile pass through a lock in your database, so an abandoned checkout settles on the next request. For push settlement, run OpenReceive's optional `startNotificationWorker` in a separate process.
- The built server doesn't read `.env`. Set the variables in its environment, or start it with `node --env-file=.env .output/server/index.mjs`.

## Development

```sh
pnpm install
pnpm dev:prepare
DATABASE_URL=postgres://... OPENRECEIVE_TEST_WALLET=1 pnpm dev   # playground on an in-memory test wallet
DATABASE_URL=postgres://... pnpm test                            # builds the playground and runs a full payment e2e
```

After bumping `@openreceive/vue`, run `pnpm compile:checkout`. The module ships its `Checkout.vue` pre-compiled to JS, so apps never compile a third-party SFC or resolve its prop types (CI fails if the file is stale).

`OPENRECEIVE_TEST_WALLET=1` swaps in a fake receive-only wallet, so you can run the whole flow without a real NWC code. It is **playground only**. `POST /api/dev/settle/:hash` marks an invoice paid.

Known noise: the Vite build prints `postcss` "Lexical error" warnings for `mod()` / `round()` in OpenReceive's stylesheet. These are harmless: the CSS is valid and works in browsers.

## Releasing

```sh
pnpm version patch          # bumps package.json, commits, tags vX.Y.Z
git push --follow-tags      # the Release workflow tests and stages the version on npm
```

The Release workflow authenticates through npm Trusted Publishing (no token in the repo) and only **stages** the version, with provenance. It goes live after a maintainer approves it with 2FA: npmjs.com → nuxt-openreceive → **Staged Packages** → **Approve**, or `npm stage list` and `npm stage approve <stage-id>`. Don't run `pnpm publish` locally, or that version ships without provenance.

## License

MIT © Grygorii Liashenko ([frontender-ua](https://github.com/frontender-ua)) · [aisoul](https://aisoul.dev). OpenReceive itself is MIT, © its authors.
