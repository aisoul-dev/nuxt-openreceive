import {
  addComponent,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  findPath,
  useLogger,
} from '@nuxt/kit'
import { defu } from 'defu'
import type { IpRateLimitConfig } from '@openreceive/http'

export interface ModuleOptions {
  /** Turn the whole module off without removing it. Default `true`. */
  enabled: boolean
  /**
   * Where the payment routes are mounted. The checkout component talks to the
   * same prefix by default. Default `/openreceive`.
   */
  prefix: string
  /**
   * Your host definition: the file whose default export is
   * `defineOpenReceiveHost({ amountFor, authorize, onPaid })`.
   * Resolved like any Nuxt path. Default `~~/server/openreceive`.
   */
  host: string
  /**
   * Register the checkout component globally. `true` uses the name
   * `OpenReceiveCheckout`; a string sets your own name; `false` skips it.
   */
  component: boolean | string
  /** Add `@openreceive/vue/styles.css` to the app. Default `true`. */
  css: boolean
  /**
   * Per-IP invoice rate limiting (counted from `openreceive_payments`, so it
   * survives restarts and spans instances). Default `true`. The module wires
   * the client IP from the H3 event for you.
   */
  rateLimiting: boolean | Omit<IpRateLimitConfig, 'ip'>
  /**
   * Read the client IP from `x-forwarded-for`. Only enable behind YOUR own
   * reverse proxy that sets the header, otherwise payers can spoof it.
   */
  trustProxy: boolean
  /**
   * Create `openreceive_payments` / `openreceive_meta` on boot when the module
   * manages the Postgres pool. The DDL is idempotent. Default `false`: prefer
   * running it through your own migrations.
   */
  migrate: boolean
}

const EDGE_PRESETS = /^(cloudflare|vercel-edge|netlify-edge|deno-deploy|deno|bun-edge|winterjs|lagon)/

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-openreceive',
    configKey: 'openreceive',
    compatibility: { nuxt: '>=3.13.0' },
  },
  defaults: {
    enabled: true,
    prefix: '/openreceive',
    host: '~~/server/openreceive',
    component: true,
    css: true,
    rateLimiting: true,
    trustProxy: false,
    migrate: false,
  },
  async setup(options, nuxt) {
    const logger = useLogger('openreceive')
    if (!options.enabled) return

    const { resolve } = createResolver(import.meta.url)
    const prefix = normalizePrefix(options.prefix)

    // ── runtime config ────────────────────────────────────────────────
    // Secrets live in the private config only. Each can be overridden in
    // production with NUXT_OPENRECEIVE_* env vars; the runtime also falls back
    // to OpenReceive's own names (NWC_URI, LSC_URI_*, DATABASE_URL).
    nuxt.options.runtimeConfig.openreceive = defu(
      nuxt.options.runtimeConfig.openreceive as Record<string, unknown> | undefined,
      {
        nwcUri: '',
        lscUriPrimary: '',
        lscUriBackup: '',
        databaseUrl: '',
        prefix,
        rateLimiting: options.rateLimiting,
        trustProxy: options.trustProxy,
        migrate: options.migrate,
      },
    )
    nuxt.options.runtimeConfig.public.openreceive = defu(
      nuxt.options.runtimeConfig.public.openreceive as Record<string, unknown> | undefined,
      { prefix },
    )

    // ── host definition (virtual import) ──────────────────────────────
    const hostPath = await findPath(options.host, { extensions: ['.ts', '.mts', '.js', '.mjs'] })
    if (!hostPath) {
      logger.warn(
        `No host definition found at \`${options.host}\`. Payment routes under \`${prefix}\` will answer 503 until you create it `
        + '(export default defineOpenReceiveHost({ amountFor, authorize, onPaid })).',
      )
    }
    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.virtual ||= {}
      nitroConfig.virtual['#openreceive/host'] = hostPath
        ? `export { default } from ${JSON.stringify(hostPath)}`
        : 'export default undefined'
      // Raw-SFC component and ESM-only packages must not be externalised wrongly.
      nitroConfig.externals ||= {}
      nitroConfig.externals.inline ||= []
      nitroConfig.externals.inline.push(resolve('./runtime'))
    })

    // The wallet connection and DB drivers need Node; refuse edge presets early.
    nuxt.hook('nitro:init', (nitro) => {
      const preset = String(nitro.options.preset || '')
      if (EDGE_PRESETS.test(preset)) {
        throw new Error(
          `[nuxt-openreceive] Nitro preset "${preset}" is an edge runtime. OpenReceive needs Node (NWC wallet client + SQL driver). `
          + 'Use node-server, or a Node serverless preset (vercel, netlify, aws-lambda).',
        )
      }
    })

    // ── server ───────────────────────────────────────────────────────
    addServerHandler({
      route: `${prefix}/**`,
      handler: resolve('./runtime/server/handler'),
    })
    addServerPlugin(resolve('./runtime/server/plugin'))
    addServerImports([
      { name: 'defineOpenReceiveHost', from: resolve('./runtime/server/utils/openreceive') },
      { name: 'useOpenReceive', from: resolve('./runtime/server/utils/openreceive') },
      { name: 'openReceiveSchemaSql', from: resolve('./runtime/server/utils/openreceive') },
    ])

    addTypeTemplate({
      filename: 'types/openreceive-host.d.ts',
      getContents: () => [
        `declare module '#openreceive/host' {`,
        `  const host: import(${JSON.stringify(resolve('./runtime/server/utils/openreceive'))}).OpenReceiveHostInput | undefined`,
        `  export default host`,
        `}`,
      ].join('\n'),
    }, { nitro: true, nuxt: true })

    // ── client ───────────────────────────────────────────────────────
    // The checkout ships pre-compiled (runtime/components/checkout.generated.js),
    // so the app never compiles @openreceive/vue's raw SFC. In dev, Vite must
    // still pre-bundle its JS entry: it reaches the CommonJS `qrcode` package.
    // (Do NOT add it to build.transpile: Nuxt excludes transpiled packages from
    // pre-bundling, which would ship raw CommonJS to the browser.)
    // Installed from npm, reach it through this module: under pnpm it is not a
    // direct dependency of the app (the nested form also works with hoisting).
    // Running from source (this repo's playground), it is a direct dependency.
    const installed = import.meta.url.includes('/node_modules/')
    nuxt.options.vite.optimizeDeps = defu(nuxt.options.vite.optimizeDeps, {
      include: [installed ? 'nuxt-openreceive > @openreceive/vue' : '@openreceive/vue'],
    })

    if (options.css) {
      nuxt.options.css.push('@openreceive/vue/styles.css')
    }

    if (options.component) {
      addComponent({
        name: typeof options.component === 'string' ? options.component : 'OpenReceiveCheckout',
        filePath: resolve('./runtime/components/OpenReceiveCheckout'),
      })
    }

    logger.info(`OpenReceive routes mounted at \`${prefix}/**\``)
  },
})

function normalizePrefix(prefix: string): string {
  const trimmed = `/${prefix.trim().replace(/^\/+|\/+$/g, '')}`
  return trimmed === '/' ? '/openreceive' : trimmed
}

declare module '@nuxt/schema' {
  interface RuntimeConfig {
    openreceive: {
      nwcUri: string
      lscUriPrimary: string
      lscUriBackup: string
      databaseUrl: string
      prefix: string
      rateLimiting: ModuleOptions['rateLimiting']
      trustProxy: boolean
      migrate: boolean
    }
  }
  interface PublicRuntimeConfig {
    openreceive: { prefix: string }
  }
}
