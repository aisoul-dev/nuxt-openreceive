# Changelog

## 0.1.2

- Fix: apps failed to build with `Failed to resolve import source "@openreceive/elements/wrapper-shared"` in a standard Nuxt 4 project (pnpm, TypeScript, references-style `tsconfig.json`). The checkout component now ships pre-compiled, so the app's Vue compiler never has to resolve `@openreceive/vue`'s prop types.
- Fix: `require is not defined` in `nuxi dev` under pnpm. `@openreceive/vue` is no longer transpiled (Nuxt excluded it from Vite pre-bundling), and it is pre-bundled through `nuxt-openreceive` when it is not a direct dependency.
- `@openreceive/vue` is pinned to an exact version, because the compiled checkout is generated from it.

## 0.1.1

- Package metadata.

## 0.1.0

- Initial release.
