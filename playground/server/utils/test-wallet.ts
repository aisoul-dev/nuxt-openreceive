import { createHash, randomBytes } from 'node:crypto'
import { createOpenReceive, type OpenReceive } from '@openreceive/node'

// PLAYGROUND / TESTS ONLY. An in-memory "wallet" so the full flow (mint,
// poll, settle, onPaid) runs without a real NWC code. Never ship this.
interface Tx {
  invoice: string
  payment_hash: string
  amount_msats: bigint
  created_at: number
  expires_at: number
  settled_at?: number
  description?: string
}

const txs = new Map<string, Tx>()
const now = () => Math.floor(Date.now() / 1000)

export function settleTestInvoice(paymentHash: string): boolean {
  const tx = txs.get(paymentHash)
  if (!tx || tx.settled_at) return false
  tx.settled_at = now()
  return true
}

export function createTestWallet(): Promise<OpenReceive> {
  return createOpenReceive({
    env: {},
    nwc: 'nostr+walletconnect://0000000000000000000000000000000000000000000000000000000000000001?relay=wss%3A%2F%2Frelay.invalid&secret=0000000000000000000000000000000000000000000000000000000000000002',
    client: {
      async preflight() {
        return {
          walletPubkey: '00'.repeat(32),
          relays: ['wss://relay.invalid'],
          methods: ['make_invoice', 'lookup_invoice', 'list_transactions', 'get_info'],
          encryption: 'nip44_v2',
          spendCapabilityAdvertised: false,
          receiveCheckoutReady: true,
          warnings: [],
        }
      },
      async makeInvoice(req) {
        const preimage = randomBytes(32)
        const payment_hash = createHash('sha256').update(preimage).digest('hex')
        const created_at = now()
        const tx: Tx = {
          invoice: `lnbcrt${req.amount_msats / BigInt(1000)}n1test${payment_hash.slice(0, 20)}`,
          payment_hash,
          amount_msats: req.amount_msats,
          created_at,
          expires_at: created_at + (req.expiry ?? 600),
          description: req.description,
        }
        txs.set(payment_hash, tx)
        return { invoice: tx.invoice, payment_hash, amount_msats: tx.amount_msats, created_at, expires_at: tx.expires_at }
      },
      async listTransactions() {
        return {
          transactions: [...txs.values()].map(tx => ({
            type: 'incoming' as const,
            ...tx,
            state: tx.settled_at ? 'settled' as const : 'pending' as const,
          })),
        }
      },
    },
  })
}
