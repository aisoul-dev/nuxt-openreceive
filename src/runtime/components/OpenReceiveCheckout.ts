import { defineComponent, h, type DefineComponent } from 'vue'
import type { WrapperCheckoutComponentProps } from '@openreceive/vue'
import { useRuntimeConfig } from '#imports'
// Pre-compiled from @openreceive/vue's Checkout.vue (see scripts/compile-checkout.mjs),
// so the host app never has to compile a third-party SFC or resolve its prop types.
import Checkout from './checkout.generated.js'

/**
 * `@openreceive/vue`'s Checkout with the module's route prefix filled in.
 * Every prop (`reference`, `syncUrl`, `onSettled`, `onState`, ...) passes
 * straight through; an explicit `prefix` still wins.
 */
const OpenReceiveCheckout = defineComponent({
  name: 'OpenReceiveCheckout',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    const { prefix } = useRuntimeConfig().public.openreceive
    return () => h(Checkout, { prefix, ...attrs }, slots)
  },
})

export default OpenReceiveCheckout as unknown as DefineComponent<WrapperCheckoutComponentProps>
