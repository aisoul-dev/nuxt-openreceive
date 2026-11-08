# Changelog

## Unreleased

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
