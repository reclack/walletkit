# @reclack/walletkit

A wallet picker and connection layer for the web. Connect a wallet, read an
address, read a balance, on EVM chains and on Solana.

- **Works with any framework.** The picker is a custom element, and the
  connection layer is a plain object with `getState` and `subscribe`.
- **One dependency**, loaded only when someone picks a wallet that needs it.
- **Nothing to configure.** Endpoints, the wallet catalogue and relay pairing
  all ship with sensible defaults.
- **Typed**, and safe to import in a server render.

```sh
npm install @reclack/walletkit
```

## Quick start

```html
<script type="module">
  import '@reclack/walletkit/element'
</script>

<reclack-connect variant="modal" family="evm"></reclack-connect>
```

Importing `@reclack/walletkit/element` defines the tag. With no bundler, point
a module script at a CDN instead:

```html
<script type="module" src="https://esm.sh/@reclack/walletkit/element"></script>
```

```js
document.querySelector('reclack-connect')
  .addEventListener('connect', (event) => {
    console.log(event.detail.address)
  })
```

Or, if you only need a value and not a component:

```ts
import { connectWallet } from '@reclack/walletkit/element'

const { address } = await connectWallet({ intent: ['address'], family: 'evm' })
```

## Your framework

### React, Next.js, Remix, React Router

```sh
npm install @reclack/walletkit @reclack/walletkit-react
```

```tsx
import { ReclackConnect } from '@reclack/walletkit-react'

<ReclackConnect
  variant="modal"
  family="evm"
  chainId={8453}
  intent={['address']}
  onConnect={({ address }) => setAddress(address)}
  onCancel={() => setOpen(false)}
/>
```

In Next.js, add `'use client'` to the file that renders it. Importing
`@reclack/walletkit` itself on the server is fine.

### Preact

The React package, unchanged. `preact/compat` handles the rest.

### Vue

```sh
npm install @reclack/walletkit @reclack/walletkit-vue
```

```vue
<script setup>
import { ReclackConnect } from '@reclack/walletkit-vue'
</script>

<template>
  <ReclackConnect variant="modal" family="evm" :chain-id="8453" @connect="onConnect" />
</template>
```

### Angular, Svelte, SolidJS, plain HTML

No wrapper needed. Each binds properties and listens for events on a custom
element natively.

```html
<!-- Angular, with CUSTOM_ELEMENTS_SCHEMA on the component or module -->
<reclack-connect family="evm" (connect)="onConnect($event)"></reclack-connect>
```

```svelte
<!-- Svelte -->
<reclack-connect family="evm" on:connect={(e) => take(e.detail)} />
```

```jsx
/* SolidJS */
<reclack-connect family="evm" on:connect={(e) => take(e.detail)} />
```

Editors and Vue's language server read the `custom-elements.json` shipped in
this package, so the tag and its attributes autocomplete without a wrapper.
`vscode.html-custom-data.json` does the same for plain HTML.

## The element

### Attributes

| Attribute | Values | Default | What it does |
| --- | --- | --- | --- |
| `variant` | `inline`, `modal` | `inline` | A list on the page, or the picker over it |
| `family` | `evm`, `svm` | `evm` | Which wallets to offer |
| `chain-id` | number | none | Require this chain, switching the wallet if needed |
| `intent` | `address`, `balance`, comma separated | `address` | What to return |
| `keep-alive` | present or absent | absent | Stay connected after resolving |
| `asset-base` | URL path | `/images/` | Where the wallet logos are served from |
| `api-url` | URL | Reclack's | A different deployment, such as a sandbox |
| `theme` | `WalletKitTheme`, as a property | none | Colours, radius and type. See [Theming](#theming) |

### Properties

For anything an attribute cannot carry, set a property instead.

```js
element.kit = sharedKit                       // share one kit, see below
element.theme = { mode: 'dark', brand: '#f60' }
element.request = {                           // an intent carrying assets
  intent: ['address', 'balance'],
  assets: [{ family: 'evm', chainId: 8453, token: USDC, decimals: 6 }],
}
```

### Events

| Event | Detail |
| --- | --- |
| `connect` | `{ address, chainId, walletId, name, family, balances }` |
| `cancel` | none, the person closed the picker |
| `connect-error` | `{ message }` |

All three are composed, so a listener on an ancestor hears them through the
shadow boundary. It is `connect-error` rather than `error` because `error`
already means a resource failed to load.

The markup lives in a shadow root, so the picker cannot restyle your page and
your stylesheet cannot reach into it. Theme it with the attributes above, or
by setting any `--rkw-` token on the element.

`variant="modal"` is a native `<dialog>`, so focus trapping, Esc to close, an
inert background and a backdrop all come from the browser.

## The kit

The element makes its own kit, and you never have to touch one. Reach for the
kit directly when you want the wallet state without the picker, or when
several pickers should share one.

```ts
import { createWalletKit } from '@reclack/walletkit'

const kit = createWalletKit()
const stop = kit.subscribe(() => render(kit.getState()))
```

```ts
const { evm, svm, catalog, scheme, variables, handheld } = kit.getState()
evm.available   // the wallets this browser has
evm.connected   // { address, chainId, walletId, name } once one is
```

| Method | What it does |
| --- | --- |
| `getState()` | The whole state, as one object |
| `subscribe(fn)` | Calls `fn` on every change, returns an unsubscribe |
| `connectEvm(wallet)` / `connectSvm(wallet)` | Connect one from `available` |
| `connectRemote(wallet, chainId, onUri)` | Pair by QR code |
| `resolveIntent(family, request)` | Connect and return what you asked for |
| `readBalances(family, assets)` | Balances for a connected address |
| `ensureChain(chainId)` | Switch the wallet's chain, true if it is there |
| `setTheme(theme)` | Replace the theme, such as when branding loads |
| `disconnect(family?)` | Drop the session |
| `destroy()` | Release listeners |

`getState` and `subscribe` are all any framework needs:

```ts
// React
const state = useSyncExternalStore(kit.subscribe, kit.getState, kit.getState)

// Vue
const state = shallowRef(kit.getState())
onMounted(() => kit.subscribe(() => { state.value = kit.getState() }))

// Svelte
const state = {
  subscribe: (run) => (run(kit.getState()), kit.subscribe(() => run(kit.getState()))),
}

// Angular
readonly state = toSignal(
  new Observable((s) => kit.subscribe(() => s.next(kit.getState()))),
)
```

### Sharing one kit

Discovering wallets means a window listener and a catalogue fetch. A page with
several pickers should share a kit rather than run both twice.

```ts
element.kit = myKit
```

Themes stay per element, so one kit can serve a light picker in a panel and a
dark one in a drawer.

### Options

Every one of these is an override. The defaults are what most integrations
want.

```ts
createWalletKit({
  theme: { mode: 'system', brand: '#ff6600' },
  assetBase: '/wallets/',
  rpcUrls: { 8453: 'https://your-node.example' },  // worth setting, see Balances
  svmRpcUrl: 'https://your-solana-node.example',
  walletConnect: { projectId: 'your-project-id' },
  apiUrl: 'https://api.reclack.com',
  catalog: [],        // supply the wallet list yourself instead of fetching it
})
```

## Intent

What you want back from connecting, as a list rather than a mode, because
these are not alternatives.

```ts
await kit.connectEvm(wallet)

const result = await kit.resolveIntent('evm', {
  intent: ['address', 'balance'],
  assets: [{ family: 'evm', chainId: 8453, token: USDC, decimals: 6 }],
  keepAlive: false,
})
// { address, chainId, walletId, name, family, balances }
```

- `address` always comes back. Listing it says you want it handed to you.
- `balance` needs an asset to be a balance of. Asking without one throws.
- `keepAlive` holds the connection open and keeps following account and chain
  changes. True for a checkout that signs later, false for a form that wanted
  a value and is done.

A chain is enforced only when you pass `chainId`. Leave it out when collecting
a settlement address: the same address receives on every EVM chain, so asking
someone to switch networks to read it back serves no purpose.

## Theming

Twelve tokens, light or dark.

```ts
createWalletKit({
  theme: {
    mode: 'system',               // 'light' | 'dark' | 'system'
    brand: '#ff6600',             // worn by the primary action
    radius: '14px',
    fontFamily: 'Inter, sans-serif',
    dark: { surface: '#000000' }, // applied on top, in dark only
  },
})
```

On the element, set it as a property:

```ts
element.theme = { mode: 'dark', brand: '#ff6600', radius: '14px' }
```

### Theme attributes

A nested object will not fit in an attribute, so the four values a plain HTML
page is most likely to want have one each. They build the same theme:

| Attribute | Theme field | Values | Default |
| --- | --- | --- | --- |
| `theme-mode` | `mode` | `light`, `dark`, `system` | `system` |
| `brand` | `brand` | `#rrggbb` | Reclack's |
| `radius` | `radius` | CSS length | `10px` |
| `font` | `fontFamily` | CSS font stack | inherited |

```html
<reclack-connect theme-mode="dark" brand="#ff6600" radius="14px"></reclack-connect>
```

**A theme wins over all four.** Setting the `theme` property, or sharing a kit
that already carries a theme, makes these attributes ignored and uses the
theme whole. That is deliberate: a checkout that themed its kit should not
have to theme every picker inside it as well.

### Following the reader's system

The resolved mode and the tokens are part of the state you are already
subscribed to, so the picker follows the reader's system without a second
listener:

```ts
const { scheme, variables } = kit.getState()
// scheme: 'dark'
// variables: { '--rkw-surface': '#16161a', '--rkw-brand': '#ff6600', ... }
```

Three things worth knowing:

- **Text on your brand colour is computed** from its relative luminance, so a
  pale brand gets dark text rather than unreadable white.
- **Dark is its own palette, not an inversion.** A brand colour you set is
  kept in both modes.
- **Colours must be `#rrggbb`.** Anything else is ignored and the default
  stands, so a value from an API response can never end up inside a style.

Tokens are prefixed `--rkw-` so they cannot collide with your own.

## Balances

Amounts are `bigint`, in the asset's smallest unit. `formatUnits` places the
decimal point with string arithmetic, because money does not survive a float.

```ts
import { formatUnits } from '@reclack/walletkit'

const [usdc] = await kit.readBalances('evm', [
  { family: 'evm', chainId: 8453, token: USDC, decimals: 6 },
])
formatUnits(usdc.amount, 6)   // "125.40"
```

Balances are read through an endpoint by default, which can cover several
chains at once and does not move the wallet onto another network. Reading
through the connected wallet instead requires it to already be on that chain,
which suits a check immediately before signing.

Public endpoints are used unless you pass `rpcUrls`. Set your own for anything
heavier than a balance or two. Solana balances are endpoint-only.

## Wallet artwork

Logos ship in `assets/` as `.webp`. Copy them into whatever your app serves
static files from, then say where that is:

```ts
createWalletKit({ assetBase: '/wallets/' })
```

```html
<reclack-connect asset-base="/wallets/"></reclack-connect>
```

The default is `/images/`. Serving them yourself means your checkout makes no
third-party image request. A wallet that supplies its own icon through
EIP-6963 uses that instead, so getting the path wrong costs you the logos of
wallets that are not installed, not the ability to connect.

## Pairing by QR code

Some wallets connect over a relay rather than through the browser. That works
out of the box, with nothing to install or configure, and the relay provider
is fetched only if someone picks one of those wallets.

To pair under your own WalletConnect project instead:

```ts
createWalletKit({
  walletConnect: {
    projectId: 'your-project-id',
    metadata: { name: 'Your app', url: 'https://your-app.example' },
  },
})
```

## Server rendering

Nothing touches `window` until something subscribes, so importing the kit in a
server render is safe and needs no guards. Registering the element is skipped
where there is no `customElements`.

## TypeScript

Types ship with the package. The ones you are most likely to name:

```ts
import type {
  WalletKit,
  WalletKitState,
  WalletKitTheme,
  ConnectRequest,
  ConnectResult,
  Asset,
  Balance,
} from '@reclack/walletkit'
```

## Licence

MIT.
