# Changelog

## 0.1.7

- `@openreceive/*` 0.4.35, with two fixes reported from this module:
  - The checkout element sends one `POST /checkouts/prepare` when it upgrades, not two (OpenReceive#137, OpenReceive#138). The first, aborted request could settle a payment while holding the reconcile gate, so a reopened paid order briefly offered "Pay this invoice" and then failed with 409.
  - `@openreceive/vue` binds the element's inputs as attributes itself, so a custom `prefix` is kept on client renders (OpenReceive#132, OpenReceive#139). `compile:checkout` no longer patches upstream's `Checkout.js`: it copies it and fails if that attribute binding ever disappears.
- Docs and playground: the checkout page example refetches the order on `onError` again. Reopening an order within seconds of paying, before the payment is recorded, can still offer to pay and then fail with 409; upstream recommends the refetch for that window (OpenReceive#137).

## 0.1.6

- `@openreceive/*` 0.4.33. An order paid on another device (or in a tab closed before it noticed) now opens straight on the receipt and fires `onSettled`, instead of offering to pay again and then failing (OpenReceive#122). A paid reference is always refused with 409, even when `amountFor` returns `null` for paid orders. The `onError` refetch from 0.1.5 is no longer needed and was removed from the docs and playground.
- `@openreceive/vue` now ships its checkout compiled, so `compile:checkout` no longer compiles an SFC: it copies upstream's `Checkout.js` and keeps one patch, setting the element's inputs as attributes (`prefix` is a built-in, read-only DOM property, so assigning it as a property dropped custom prefixes). `@vue/compiler-sfc` is no longer a dev dependency.

## 0.1.5

- Docs and playground: the checkout page example refetches the order on `onError`. When an invoice was paid on another device (or in a tab that was closed before it noticed), the checkout's first request settles it, and an `amountFor` that returns `null` for paid orders makes that request fail with `Unknown reference.`. Refetching shows the order as paid instead of the error. No second invoice was ever minted; the e2e test now asserts that.

## 0.1.4

- `css: true` (the default) now ships `@openreceive/vue/styles.css` with the checkout component's chunk instead of every page's entry CSS. Pages without `<OpenReceiveCheckout>` no longer load ~200 KB of render-blocking checkout CSS; pages with it still get the styles on first load and on client-side navigation. `css: 'global'` restores the old app-wide behaviour (use it if you render the `<openreceive-checkout>` element directly, without the component), and with `component: false` the stylesheet stays global as before.

## 0.1.3

- Fix: a custom `prefix` could be silently lost when the checkout rendered on the client. Once `<openreceive-checkout>` is defined, Vue assigned `prefix` as a DOM property, which the element only exposes as a getter, so the assignment threw (`Failed setting prop "prefix"`) and the attribute was never set. The compiled checkout now always sets the element's inputs as attributes.
- The module no longer touches the file system: the redundant `existsSync` checks are gone (`findPath` already only returns existing files), and the dev pre-bundle path is chosen from where the module runs.
- Releases are staged from GitHub Actions with npm provenance (trusted publishing) and go live only after a maintainer approves them with 2FA, so npm and Socket can verify each version was built from this repository.

## 0.1.2

- Fix: apps failed to build with `Failed to resolve import source "@openreceive/elements/wrapper-shared"` in a standard Nuxt 4 project (pnpm, TypeScript, references-style `tsconfig.json`). The checkout component now ships pre-compiled, so the app's Vue compiler never has to resolve `@openreceive/vue`'s prop types.
- Fix: `require is not defined` in `nuxi dev` under pnpm. `@openreceive/vue` is no longer transpiled (Nuxt excluded it from Vite pre-bundling), and it is pre-bundled through `nuxt-openreceive` when it is not a direct dependency.
- `@openreceive/vue` is pinned to an exact version, because the compiled checkout is generated from it.

## 0.1.1

- Package metadata.

## 0.1.0

- Initial release.
