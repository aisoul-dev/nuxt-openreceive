import {
  createStack,
  paymentsSchemaSql,
  type AuthorizeContext,
  type CreateStackOptions,
  type IpRateLimitConfig,
  type PaymentSettlementHook,
  type Stack,
  type StackStorage,
  type StackWallet,
} from '@openreceive/http'
import { createOpenReceive, type OpenReceive } from '@openreceive/node'
import { getRequestIP, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import hostInput from '#openreceive/host'

// ── public types ─────────────────────────────────────────────────────

/** `authorize` context with the request's H3 event, typed. */
export interface OpenReceiveAuthorizeContext extends AuthorizeContext {
  /** The H3 event of this request: read your session/cookies from it. */
  readonly event: H3Event
}

type PassThroughOptions = Omit<
  CreateStackOptions,
  'wallet' | 'storage' | 'authorize' | 'prefix' | 'amountFor' | 'rateLimiting'
>

export interface OpenReceiveHost extends PassThroughOptions {
  /**
   * The trusted price for an order id (`reference`), read from YOUR data.
   * Return `null` when there is nothing to pay (answered 404). Never trust an
   * amount the payer sends.
   */
  amountFor: CreateStackOptions['amountFor']
  /**
   * Runs on every payment request. `resource.reference` is a claim the payer
   * made, not proof: check ownership against the session on `event`.
   */
  authorize: (context: OpenReceiveAuthorizeContext) => boolean | Promise<boolean>
  /**
   * Fulfillment, when the module manages the Postgres pool (DATABASE_URL).
   * Runs once per reference INSIDE the settlement transaction: do your writes
   * through the supplied `query` (`$1` placeholders), keep it idempotent, and
   * send emails/webhooks only after commit, from your own worker.
   */
  onPaid?: PaymentSettlementHook
  /**
   * Bring your own storage instead of the managed pool: `{ db, onPaid }` with
   * an existing pg Pool / mysql2 / sqlite handle, `{ supabase: { url, key } }`
   * for Supabase over HTTPS, or `{ payments, onPaid }` for a custom repository.
   */
  storage?: StackStorage
  /**
   * Override the wallet (tests, a pre-built service). By default the module
   * builds it from `NUXT_OPENRECEIVE_NWC_URI` / `NWC_URI`.
   */
  wallet?: StackWallet
  /** Override the module-level `rateLimiting` option for this host. */
  rateLimiting?: boolean | Omit<IpRateLimitConfig, 'ip'> | IpRateLimitConfig
}

export type OpenReceiveHostFactory = () => OpenReceiveHost | Promise<OpenReceiveHost>
export type OpenReceiveHostInput = OpenReceiveHost | OpenReceiveHostFactory

/**
 * Define how OpenReceive talks to your app. Put it in `server/openreceive.ts`
 * as the default export. Pass a function to defer work (opening your DB,
 * reading config) until the first payment request.
 */
export function defineOpenReceiveHost<T extends OpenReceiveHostInput>(host: T): T {
  return host
}

/** The OpenReceive payment tables DDL for your own migrations. Idempotent. */
export function openReceiveSchemaSql(
  dialect: Parameters<typeof paymentsSchemaSql>[0] = 'postgres',
): string {
  return paymentsSchemaSql(dialect)
}

// ── lazy singleton ───────────────────────────────────────────────────

interface Booted {
  stack: Stack
  close: () => Promise<void>
}

const RETRY_AFTER_MS = 5_000

let booting: Promise<Booted> | undefined
let failedAt = 0
let lastError: unknown

/**
 * The booted OpenReceive stack for this server process. Built on first use,
 * never at import, so `nuxi build` and prerendering never touch the wallet.
 * A failed boot is retried after a short pause instead of sticking forever.
 */
export async function useOpenReceive(): Promise<Stack> {
  if (!booting) {
    if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) throw lastError
    booting = boot().catch((error) => {
      booting = undefined
      failedAt = Date.now()
      lastError = error
      throw error
    })
  }
  return (await booting).stack
}

/** Close the wallet connection and the managed pool (called on Nitro close). */
export async function closeOpenReceive(): Promise<void> {
  const current = booting
  booting = undefined
  if (!current) return
  try {
    await (await current).close()
  }
  catch {
    // boot had failed: nothing to close
  }
}

async function boot(): Promise<Booted> {
  if (!hostInput) {
    throw new Error(
      'nuxt-openreceive: no host definition. Create server/openreceive.ts with '
      + '`export default defineOpenReceiveHost({ amountFor, authorize, onPaid })`.',
    )
  }

  const config = useRuntimeConfig().openreceive
  const host = typeof hostInput === 'function' ? await hostInput() : hostInput
  const { authorize, onPaid, storage, wallet, rateLimiting, ...rest } = host

  const cleanups: Array<() => Promise<void>> = []

  // Storage: the host's own handle, or a pg Pool the module owns.
  let resolvedStorage: StackStorage
  if (storage) {
    if (onPaid) {
      console.warn('[openreceive] `onPaid` is ignored when `storage` is set: put it inside `storage`.')
    }
    resolvedStorage = storage
  }
  else {
    if (!onPaid) {
      throw new Error('nuxt-openreceive: define `onPaid` (managed pool) or `storage` in your host.')
    }
    const url = config.databaseUrl || process.env.DATABASE_URL
    if (!url) {
      throw new Error(
        'nuxt-openreceive: no database. Set NUXT_OPENRECEIVE_DATABASE_URL (or DATABASE_URL), '
        + 'or pass `storage: { db, onPaid }` in your host.',
      )
    }
    const { default: pg } = await import('pg')
    const pool = new pg.Pool({ connectionString: url })
    cleanups.push(() => pool.end())
    if (config.migrate) {
      await pool.query(paymentsSchemaSql('postgres'))
    }
    resolvedStorage = { db: pool, onPaid }
  }

  // Wallet: receive-only NWC from runtime config, falling back to the
  // variable names OpenReceive itself documents.
  let resolvedWallet: StackWallet
  if (wallet) {
    resolvedWallet = wallet
  }
  else {
    const env = withoutEmpty({
      ...process.env,
      NWC_URI: config.nwcUri || process.env.NWC_URI,
      LSC_URI_PRIMARY: config.lscUriPrimary || process.env.LSC_URI_PRIMARY,
      LSC_URI_BACKUP: config.lscUriBackup || process.env.LSC_URI_BACKUP,
    })
    if (!env.NWC_URI) {
      await runAll(cleanups)
      throw new Error(
        'nuxt-openreceive: no wallet. Set NUXT_OPENRECEIVE_NWC_URI (or NWC_URI) to a receive-only NWC code. '
        + 'See https://openreceive.org/get_a_nwc_code_to_receive_payments',
      )
    }
    const service: Promise<OpenReceive> = createOpenReceive({ env })
    cleanups.push(async () => (await service).close())
    resolvedWallet = { service }
  }

  const stack = createStack({
    ...rest,
    prefix: config.prefix,
    wallet: resolvedWallet,
    storage: resolvedStorage,
    authorize: context => authorize({ ...context, event: context.native as H3Event }),
    rateLimiting: resolveRateLimiting(rateLimiting ?? config.rateLimiting, config.trustProxy),
  })
  cleanups.unshift(() => stack.close())

  try {
    await stack.ready
  }
  catch (error) {
    await runAll(cleanups)
    throw error
  }

  return { stack, close: () => runAll(cleanups) }
}

function resolveRateLimiting(
  option: boolean | Omit<IpRateLimitConfig, 'ip'> | IpRateLimitConfig | undefined,
  trustProxy: boolean,
): boolean | IpRateLimitConfig {
  if (!option) return false
  const base: IpRateLimitConfig = option === true ? {} : option
  if (base.ip) return base
  return {
    ...base,
    ip: ({ native }) => getRequestIP(native as H3Event, { xForwardedFor: trustProxy }),
  }
}

function withoutEmpty(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value) out[key] = value
  }
  return out
}

async function runAll(tasks: Array<() => Promise<void>>): Promise<void> {
  for (const task of tasks) {
    try {
      await task()
    }
    catch {
      // best effort on shutdown
    }
  }
}
