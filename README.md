# @reclack/walletkit

Connect a wallet, read an address, read a balance. No renderer, no framework,
no wallet SDK.

Wallets speak EIP-1193, EIP-6963 and the Wallet Standard, all of which are
small enough to talk to by hand. A page that handles other people's money
should ship as little code it did not write as it can, so this talks to them
directly.

One dependency, and only five wallets need it: Safe, Kraken, BitPay,
Bitcoin.com and Blockchain.com inject nothing into a page, so they are reached
over a relay. Its provider sits behind a dynamic import and is fetched only
when one of those is chosen. Everyone else loads none of it.

```sh
npm install @reclack/walletkit
```

## The kit

Everything hangs off one object with `getState` and `subscribe`. That pair is
the only shape every framework agrees on, so this package picks none of them.

```ts
import { createWalletKit } from '@reclack/walletkit'

const kit = createWalletKit()
const stop = kit.subscribe(() => render(kit.getState()))
```

No configuration. Which API to read the wallet catalogue from, which relay to
pair over, which endpoints to read balances from: none of that is a decision a
page embedding a wallet picker should have to make, so the kit ships with it.
Options exist for a sandbox, a private endpoint or a partner running the kit
under its own name, and all of them are overrides rather than requirements.

Nothing touches `window` until the first subscriber arrives, so importing this
on a server is safe and a host that renders on one needs no guards.

### Vanilla

```js
kit.subscribe(() => {
  const { evm } = kit.getState()
  list.replaceChildren(...evm.available.map(toRow))
})
```

### React

```tsx
const state = useSyncExternalStore(kit.subscribe, kit.getState, kit.getState)
```

### Vue

```ts
const state = shallowRef(kit.getState())
onMounted(() => kit.subscribe(() => { state.value = kit.getState() }))
```

### Svelte

```ts
const state = { subscribe: (run) => (run(kit.getState()), kit.subscribe(() => run(kit.getState()))) }
```

### Angular

```ts
readonly state = toSignal(new Observable((s) => kit.subscribe(() => s.next(kit.getState()))))
```

## Intent

What a caller wants back from connecting, as a list rather than a mode,
because these are not alternatives.

```ts
await kit.connectEvm(wallet)

const result = await kit.resolveIntent('evm', {
  intent: ['address', 'balance'],
  assets: [{ family: 'evm', chainId: 8453, token: USDC, decimals: 6 }],
  keepAlive: false,
})
// { address, chainId, walletId, name, family, balances }
```

- `address` is the by-product of connecting, so it is always obtained. Asking
  for it says only that the caller wants it handed back.
- `balance` needs an asset to be a balance of. Asking without one throws: it
  is a mistake in the caller, not a state anybody can connect their way out of.
- `keepAlive` holds the provider open and keeps following account and chain
  changes. True for a checkout, which signs later. False for a form, which
  wanted a value and is done.

A chain is enforced only when `chainId` is given. A page collecting a
settlement address should leave it out: the same address receives on every EVM
chain, and asking somebody to switch networks in their wallet to read an
address back is theatre.

## The element

The picker itself, as a custom element. An element is the only component model
React, Vue, Angular, Svelte and a page with no framework already share, so
that is what it is.

```html
<script type="module" src="/path/to/@reclack/walletkit/element"></script>

<reclack-connect
  variant="modal"
  family="evm"
  chain-id="8453"
  intent="address,balance"
  theme-mode="system"
  brand="#ff6600"
  asset-base="/wallets/"
></reclack-connect>
```

```js
document.querySelector('reclack-connect')
  .addEventListener('connect', (event) => {
    event.detail // { address, chainId, walletId, name, family, balances }
  })
```

Events are `connect`, `cancel` and `connect-error`, all composed, so a
listener on an ancestor hears them through the shadow boundary. `connect-error`
rather than `error`, which already means a resource failed to load.

`variant` is `inline`, the short list a checkout puts on the page with the
full catalogue folded behind one row, or `modal`, the whole picker over the
page. The modal is a native `<dialog>`: focus trapping, Esc, an inert
background and a backdrop come from the platform rather than from a focus-trap
library shipped on a page that takes payments.

Markup is in a shadow root, so nothing here can reach the host's page and
nothing in the page can reach in. The tokens are set on the element itself,
where a host can still override any single one of them.

### Your framework

The tag is `reclack-connect` because a custom element's name must be
lowercase and contain a hyphen. That is the HTML spec, not a style choice, and
nobody should have to write it.

**React, and anything built on it (Next.js, Remix, React Router):**

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

In Next.js the file needs `'use client'`, because the component uses hooks.
The kit itself is safe to import on a server: it touches no browser API until
something subscribes, and registering the element is skipped where there is no
`customElements`.

**Preact:** the same package. Preact's `preact/compat` alias makes React
components work unchanged, which is how this checkout uses it.

**Vue:**

```sh
npm install @reclack/walletkit @reclack/walletkit-vue
```

```vue
<ReclackConnect variant="modal" family="evm" :chain-id="8453" @connect="onConnect" />
```

**Angular, Svelte, SolidJS, and plain HTML need no wrapper**, and adding one
would be ceremony rather than help: all three bind properties and listen to
custom events on an element natively, which is the whole thing a wrapper does
for React.

```html
<!-- Angular, with CUSTOM_ELEMENTS_SCHEMA in the component or module -->
<reclack-connect [kit]="kit" family="evm" (connect)="onConnect($event)"></reclack-connect>
```

```svelte
<!-- Svelte -->
<reclack-connect {kit} family="evm" on:connect={(e) => take(e.detail)} />
```

```jsx
/* SolidJS */
<reclack-connect prop:kit={kit} family="evm" on:connect={(e) => take(e.detail)} />
```

Editors and Vue's language server read `custom-elements.json`, shipped in this
package, so the tag and its attributes autocomplete without a wrapper.
`vscode.html-custom-data.json` does the same for plain HTML.

### One call

For a host that only wants a value, filling a settlement address should not
take an element, two listeners and a piece of state:

```ts
import { connectWallet } from '@reclack/walletkit/element'

const { address } = await connectWallet({ intent: ['address'], family: 'evm' })
```

It opens the modal, resolves with the result and rejects when the person
closes it. That is a refusal, not a failure, and a caller that wants to ignore
it can.

### Sharing a kit

Each element makes its own kit unless given one. A page with several pickers
should share, because discovery is a window listener and a catalogue fetch,
and a second kit runs both again to answer the same question.

```ts
element.useKit(myKit)
```

Themes stay per element even then, so a dashboard can show a light picker in a
panel and a dark one in a drawer off one kit.

## Theme

Twelve tokens, light or dark, and nothing else to override.

```ts
const kit = createWalletKit({
  theme: {
    mode: 'system',        // 'light' | 'dark' | 'system' (the default)
    brand: '#ff6600',      // your colour, worn by the primary action
    radius: '14px',
    fontFamily: 'Inter, sans-serif',
    dark: { surface: '#000000' },   // applied on top, in dark only
  },
})
```

The resolved mode and the tokens live in the state everything is already
subscribed to, so when the reader's system flips to dark the picker follows
without a second listener:

```ts
const { scheme, variables } = kit.getState()
// scheme: 'dark'
// variables: { '--rkw-surface': '#16161a', '--rkw-brand': '#ff6600', ... }
```

`kit.setTheme(...)` replaces it later, which is what an embedded checkout does
when a merchant's branding arrives.

Three things the kit decides rather than asking:

- **Text on the brand colour is computed**, by relative luminance, so a pale
  brand gets dark text instead of the white that would leave the button
  unreadable.
- **Dark is a chosen palette, not an inverted one.** Inverting gives muddy
  greys and a brand that has stopped contrasting with anything. A brand colour
  a host sets is kept in both modes, though: it is their colour.
- **A value it cannot read is dropped** and the default stands. Colours must be
  `#rrggbb`. In the embedded checkout the branding comes from an API response
  and ends up inside a style, and a page that takes payment details must not
  interpolate whatever a response happens to carry.

And one it decides from whether you set a brand at all: **a row is washed grey
on hover until you pick a colour**, then in yours. The default brand is
Reclack's own, and a page nobody has branded should not be hovering in it.

Tokens are prefixed `--rkw-` because they are set on an element the host also
styles. Without a prefix, `--surface` would silently take over or be taken
over.

## Balances

Amounts are `bigint`, in the asset's smallest unit, and `formatUnits` places
the decimal point with string arithmetic. Money does not survive a float.

Where a balance is read from changes what it costs. Through an endpoint,
several chains can be read at once and no wallet is dragged onto another
network. Through the connected wallet's own provider, the wallet must already
be on that chain. So an endpoint is the default, and the provider is for the
one case that needs it: the pre-flight immediately before signing, where the
question is what this exact wallet can spend right now.

The pinned public endpoints are used unless a host passes its own in
`rpcUrls`, which is worth doing for anything heavier than a balance or two.

Solana is endpoint-only. Solana wallets sign; they do not answer questions
about the chain.

## Artwork

Wallet logos ship in `assets/` as `.webp` files. Copy them into whatever your
app serves static files from, then say where that is:

```ts
createWalletKit({ assetBase: '/wallets/' })   // the kit
```

```html
<reclack-connect asset-base="/wallets/"></reclack-connect>
```

The default is `/images/`. Served by you rather than fetched from us, so a
checkout still makes no third-party image request, and a wallet's own EIP-6963
icon wins over these anyway: that is the artwork of the provider actually
present. Getting the path wrong costs the logos of wallets that are not
installed, not the ability to connect.

## WalletConnect

Safe, Kraken, BitPay, Bitcoin.com and Blockchain.com inject nothing into the
page, so they are reached over a relay. Nothing to install and nothing to
configure: the relay provider ships with the kit, behind a dynamic import, so
only somebody who picks one of those wallets ever downloads it.

Pass `walletConnect: { projectId, metadata }` to pair under your own project.

## Build

```sh
pnpm install
pnpm test
pnpm build
```
