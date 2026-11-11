import type { ConnectRequest, WalletKit, WalletKitTheme } from '@reclack/walletkit'

/**
 * The attributes `<reclack-connect>` understands.
 *
 * Exported so a typed host does not have to guess them, and so the JSX
 * declarations for each framework are written against one list rather than
 * three that drift.
 *
 * Everything here is a string, because attributes are. The richer settings,
 * an intent carrying assets or a theme carrying per-mode overrides, are
 * properties on the element instead: an attribute cannot hold either.
 */
export interface ReclackConnectAttributes {
	/** `inline` for a list on the page, `modal` for the whole picker over it. */
	variant?: 'inline' | 'modal'
	/** Restricts the list to one chain family. Both when absent. */
	family?: 'evm' | 'svm'
	/** The EVM chain the wallet must end up on. No switch is forced without it. */
	'chain-id'?: string | number
	/** Comma separated: `address`, `balance`. */
	intent?: string
	/** Hold the connection open after the result, for a page that signs later. */
	'keep-alive'?: boolean | ''
	'theme-mode'?: 'light' | 'dark' | 'system'
	/** `#rrggbb`. Anything else is ignored and the default stands. */
	brand?: string
	radius?: string
	font?: string
	/** Where the host serves this package's `assets/` directory from. */
	'asset-base'?: string
	/** A different Reclack to read the wallet catalogue from, such as a sandbox. */
	'api-url'?: string
}

/**
 * Everything a framework can pass in JSX: the attributes above, plus the
 * properties that carry more than a string.
 *
 * A framework sets a property when the element has one of that name and an
 * attribute otherwise, which is why these can sit in one list.
 */
export interface ReclackConnectProps extends ReclackConnectAttributes {
	/** A kit to share rather than one this element would make for itself. */
	kit?: WalletKit
	/** The full request, for an intent carrying assets. */
	request?: ConnectRequest
	/** The full theme, for per-mode overrides. */
	theme?: WalletKitTheme
}
