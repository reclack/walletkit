import type { StandardAccount, StandardWallet } from './wallet-standard.js'

/**
 * An EIP-1193 provider: the only interface this app talks to.
 *
 * Deliberately hand-typed rather than pulled from a wallet SDK: every wallet
 * below speaks this, and a checkout page that handles other people's money
 * should ship as little third-party code as possible.
 */
export interface Eip1193Provider {
	request(args: { method: string; params?: unknown[] | object }): Promise<unknown>
	on?(event: string, handler: (...args: unknown[]) => void): void
	removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

/** A wallet Reclack knows how to name and find. */
export interface EvmWalletDefinition {
	id: string
	name: string
	/** EIP-6963 reverse-DNS ids, when the wallet announces any. */
	rdns?: string[]
	/**
	 * Fallback detector for wallets that inject a global but do not yet
	 * announce themselves over EIP-6963.
	 */
	detect?: (win: Window) => Eip1193Provider | undefined
	/** Where to send someone who does not have it installed. */
	installUrl: string
}

/** A wallet actually available in this browser, ready to connect. */
export interface DetectedEvmWallet {
	id: string
	name: string
	/** Data-URI supplied by the wallet itself over EIP-6963, when present. */
	icon?: string
	provider: Eip1193Provider
	/** True when discovered via EIP-6963 rather than a global sniff. */
	announced: boolean
}

export interface ConnectedEvmWallet {
	walletId: string
	name: string
	icon?: string
	address: string
	chainId: number
	provider: Eip1193Provider
}

/**
 * A Solana wallet's injected provider: the only interface this app talks to.
 *
 * Hand-typed, like the EIP-1193 one above it, and for the same reason: a
 * checkout page handling other people's money should ship as little
 * third-party code as it can. No wallet SDK is needed because the transaction
 * arrives already built, so nothing here constructs one.
 *
 * Every field is optional because wallets disagree about which of these they
 * expose. What they must have is `request`; see signAndSendSvm.
 */
export interface SvmProvider {
	// No identity flags. `isPhantom` is set by several wallets that are not
	// Phantom, so believing one names the wrong wallet: a provider is
	// identified by the global it was found at, never by what it claims to
	// be. See svmProvider.
	publicKey?: unknown
	request?(args: { method: string; params?: unknown }): Promise<unknown>
	connect?(options?: { onlyIfTrusted?: boolean }): Promise<unknown>
	disconnect?(): Promise<void>
	on?(event: string, handler: (...args: unknown[]) => void): void
	removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

/**
 * A Solana wallet Reclack knows how to name and find.
 *
 * Separate from EvmWalletDefinition rather than a family field on it. The two
 * share a name and an install link and nothing else: no EIP-6963
 * announcement, no chain to switch to, a different provider interface and a
 * different address format. One definition covering both would be a struct
 * whose fields are half-populated depending on which family you meant.
 */
export interface SvmWalletDefinition {
	id: string
	name: string
	installUrl: string
}

/**
 * A Solana wallet available in this browser, ready to connect.
 *
 * Reached one of two ways, and it matters which. A wallet that registered
 * through the Wallet Standard is driven by its feature objects; one found by
 * sniffing a global is driven by its injected provider. Most wallets that
 * sign Solana announce themselves the first way, including every EVM wallet
 * that has added it, so that is the one to prefer.
 */
export interface DetectedSvmWallet {
	id: string
	name: string
	icon?: string
	/** Set when the wallet registered through the Wallet Standard. */
	standard?: StandardWallet
	/** Set when it was found as an injected global instead. */
	provider?: SvmProvider
}

export interface ConnectedSvmWallet {
	walletId: string
	name: string
	icon?: string
	/** Base58. Never lowercased: the case is part of the key. */
	address: string
	standard?: StandardWallet
	/** The account the standard wallet connected, which signing needs back. */
	account?: StandardAccount
	provider?: SvmProvider
}

/**
 * The least a wallet picker needs to know about a detected wallet.
 *
 * The picker is shared between families, which have different providers and
 * different connect calls but the same job on screen: name a wallet, show its
 * mark, and hand the whole thing back when it is chosen. Typing the UI
 * against this rather than against either family's wallet keeps one picker
 * instead of two that drift apart.
 */
export interface WalletChoice {
	id: string
	name: string
	icon?: string
}

/** The chain families a wallet can sign for. */
export type ChainFamily = 'evm' | 'svm'

/** The least the picker needs about a wallet that may not be installed. */
export interface WalletOption {
	id: string
	name: string
	installUrl: string
	/**
	 * The wallet's mobile app has a browser of its own, which this checkout
	 * can be opened in. Decides how a wallet that injects nothing into an
	 * ordinary page is reached: the hand-off carries the checkout to that
	 * browser, and only a wallet without one needs a WalletConnect session.
	 */
	browser?: boolean
}
