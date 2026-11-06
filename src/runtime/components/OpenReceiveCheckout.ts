import { defineComponent, h, type DefineComponent } from 'vue'
import Checkout, { type VueCheckoutProps } from '@openreceive/vue/checkout.vue'
import { useRuntimeConfig } from '#imports'

/**
 * `@openreceive/vue`'s Checkout with the module's route prefix filled in.
 * Every prop (`reference`, `syncUrl`, `onSettled`, `onState`, …) passes
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

export default OpenReceiveCheckout as unknown as DefineComponent<VueCheckoutProps>
