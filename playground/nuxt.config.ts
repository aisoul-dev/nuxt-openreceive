export default defineNuxtConfig({
  modules: ['../src/module'],
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  openreceive: {
    // Playground convenience: create the payment tables on first boot.
    migrate: true,
  },
})
