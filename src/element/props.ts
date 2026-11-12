import type { ConnectRequest, ConnectResult, WalletKit, WalletKitTheme } from '@reclack/walletkit'

/**
 * What a framework component takes, as that framework's users expect it.
 *
 * The element underneath is `<reclack-connect>`, because a custom element's
 * tag must be lowercase and contain a hyphen; that is the HTML spec, not a
 * style choice. Nobody writing React or Preact should have to know it, so
 * these wrappers exist: camelCase props, callbacks instead of
 * `addEventListener`, and a component name that reads like every other
 * component on the page.
 */
export interface ConnectProps {
	/** A kit to share rather than one the element would make for itself. */
	kit?: WalletKit
	/** The whole request, for an intent carrying assets. */
	request?: ConnectRequest
	/** The whole theme, for per-mode overrides. */
	theme?: WalletKitTheme

	/** `inline` for a list on the page, `modal` for the picker over it. */
	variant?: 'inline' | 'modal'
	/** Restricts the list to one chain family. Both when absent. */
	family?: 'evm' | 'svm'
	/** The EVM chain the wallet must end up on. No switch is forced without it. */
	chainId?: number
	/** Shorthand for `request.intent`. */
	intent?: Array<'address' | 'balance'>
	/** Hold the connection open afterwards, for a page that signs later. */
	keepAlive?: boolean
	themeMode?: 'light' | 'dark' | 'system'
	/** `#rrggbb`. Anything else is ignored and the default stands. */
	brand?: string
	radius?: string
	fontFamily?: string
	/** Where the host serves this package's `assets/` directory from. */
	assetBase?: string
	/** A different Reclack to read the wallet catalogue from, such as a sandbox. */
	apiUrl?: string

	onConnect?: (result: ConnectResult) => void
	onCancel?: () => void
	onError?: (message: string) => void
}

/** The props that are plain attributes, and what each is called in the DOM. */
export const ATTRIBUTES = {
	variant: 'variant',
	family: 'family',
	chainId: 'chain-id',
	themeMode: 'theme-mode',
	brand: 'brand',
	radius: 'radius',
	fontFamily: 'font',
	assetBase: 'asset-base',
	apiUrl: 'api-url',
} as const

/**
 * Props to attributes, for whichever framework is rendering.
 *
 * Shared so the two wrappers cannot drift. Values are strings because
 * attributes are; `undefined` is left out so the element falls back to its
 * own default rather than parsing the word "undefined".
 */
export function attributesOf (props: ConnectProps): Record<string, string> {
	const attributes: Record<string, string> = {}
	for (const [prop, name] of Object.entries(ATTRIBUTES)) {
		const value = props[prop as keyof typeof ATTRIBUTES]
		if (value !== undefined) {
			attributes[name] = String(value)
		}
	}
	if (props.intent?.length) {
		attributes.intent = props.intent.join(',')
	}
	if (props.keepAlive) {
		attributes['keep-alive'] = ''
	}
	return attributes
}

/** The events the element dispatches, and the callback each one answers. */
export const EVENTS = {
	connect: 'onConnect',
	cancel: 'onCancel',
	'connect-error': 'onError',
} as const

/**
 * The chain picker's props, and how each becomes an attribute.
 *
 * Shared for the same reason the picker's are: two wrappers writing their own
 * mapping is two mappings to keep in step with the element.
 */
export interface NetworkProps {
	/** The chains to choose between, in the order they are offered. */
	networks?: string[] | string
	/** The chain chosen. The first is used when this names none of them. */
	value?: string
	/** Empty renders no label at all. */
	label?: string
	disabled?: boolean
	themeMode?: 'light' | 'dark' | 'system'
	brand?: string
	radius?: string
	fontFamily?: string
	assetBase?: string
	onChange?: (network: string) => void
}

/** The network props that are plain attributes, and their DOM names. */
export const NETWORK_ATTRIBUTES = {
	value: 'value',
	label: 'label',
	themeMode: 'theme-mode',
	brand: 'brand',
	radius: 'radius',
	fontFamily: 'font',
	assetBase: 'asset-base',
} as const

export function networkAttributesOf (props: NetworkProps): Record<string, string> {
	const attributes: Record<string, string> = {}
	for (const [prop, name] of Object.entries(NETWORK_ATTRIBUTES)) {
		const value = props[prop as keyof typeof NETWORK_ATTRIBUTES]
		if (value !== undefined) {
			attributes[name] = String(value)
		}
	}
	if (props.networks !== undefined) {
		attributes.networks = Array.isArray(props.networks)
			? props.networks.join(',')
			: props.networks
	}
	if (props.disabled) {
		attributes.disabled = ''
	}
	return attributes
}

/** The one event the chain picker dispatches. */
export const NETWORK_EVENTS = { change: 'onChange' } as const
