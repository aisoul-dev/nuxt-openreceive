import { closeOpenReceive } from './utils/openreceive'

interface NitroAppLike {
  hooks: { hook: (name: 'close', fn: () => Promise<void>) => unknown }
}

// Release the wallet relay connection and the managed pool on shutdown.
// (`defineNitroPlugin` is an identity helper, so a plain function is enough.)
export default function openReceiveNitroPlugin(nitroApp: NitroAppLike): void {
  nitroApp.hooks.hook('close', closeOpenReceive)
}
