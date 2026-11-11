/**
 * @reclack/walletkit
 *
 * Connecting a wallet, reading an address, reading a balance, and nothing
 * else. No React, no Vue, no renderer of any kind: a store with `getState`
 * and `subscribe`, which is the one shape every framework can consume and
 * plain JavaScript can call directly.
 *
 * No wallet SDK either, and no dependencies. Every wallet here speaks
 * EIP-1193 or the Wallet Standard, both of which are small enough to talk to
 * by hand, and a page that handles other people's money should ship as little
 * code it did not write as it can.
 */

// The kit. Start here.
export { createWalletKit } from './kit.js'
export type {
	EvmState,
	SvmState,
	WalletKit,
	WalletKitOptions,
	WalletKitState,
} from './kit.js'

// What a caller wants out of connecting, and what it gets back.
export type { ConnectRequest, ConnectResult, Intent } from './intent.js'

// Colours, corner radius, type, and light or dark.
export {
	applyTheme,
	DARK_TOKENS,
	LIGHT_TOKENS,
	readableInk,
	resolveScheme,
	safeColor,
	subscribeScheme,
	themeCss,
	themeVariables,
} from './theme.js'
export type {
	ColorScheme,
	ThemeMode,
	ThemeTokens,
	WalletKitTheme,
} from './theme.js'

// Balances.
export { formatUnits, readEvmBalance, readSvmBalance } from './balance.js'
export type { Asset, Balance, BalanceSource } from './balance.js'

// The catalogue: which wallets exist, and how to recognise them.
export { engineOf, walletsFor } from './catalog.js'
export type { WalletEngine, WalletEntry } from './catalog.js'
export { fetchWalletCatalog, walletCatalogUrl } from './catalog-fetch.js'

// The two families, for a host that drives them itself rather than through
// the kit.
export {
	connectEvmWallet,
	discoverEvmWallets,
	shortEvmAddress,
	switchEvmChain,
} from './evm.js'
export {
	connectSvmWallet,
	disconnectSvmWallet,
	discoverSvmWallets,
	shortSvmAddress,
	signAndSendSvm,
} from './svm.js'

// Wallets that inject nothing, reached over a relay.
export {
	defaultMetadata,
	openWalletConnectSession,
	walletConnectReady,
} from './walletconnect.js'
export type {
	RemoteSession,
	SessionMetadata,
	WalletConnectOptions,
} from './walletconnect.js'

// Getting from a desktop to a phone, and from a phone into a wallet.
export { walletDeepLink, walletPairingLink, walletScans } from './deep-links.js'
export { isHandheld, mobileOS, subscribeHandheld } from './device.js'
export type { MobileOS } from './device.js'

// The defaults every option above overrides.
export {
	DEFAULT_API_URL,
	DEFAULT_SVM_RPC_URL,
	DEFAULT_WALLETCONNECT_PROJECT_ID,
	defaultRpcUrl,
} from './config.js'

// Chains this kit can propose to a wallet, and where to look a payment up.
export { CHAINS, chainMetadata, explorerHost, explorerTxUrl } from './chains.js'
export type { ChainMetadata } from './chains.js'

// Names and marks.
export { DEFAULT_LOGO_BASE, WALLET_LOGOS, walletLogo } from './icons.js'
export { shortAddress } from './address.js'

// Failures, in words somebody can act on.
export { WalletError, walletErrorMessage } from './errors.js'
export type { ProviderRpcError } from './errors.js'

// Encoding, for a caller building its own calls.
export { addressWord, bytes32, calldata, word } from './abi.js'

// The interfaces everything above is typed against.
export type {
	ChainFamily,
	ConnectedEvmWallet,
	ConnectedSvmWallet,
	DetectedEvmWallet,
	DetectedSvmWallet,
	Eip1193Provider,
	SvmProvider,
	WalletChoice,
	WalletOption,
} from './types.js'
