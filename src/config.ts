import { chainMetadata } from './chains.js'

/**
 * Where this kit talks to Reclack, and with what.
 *
 * Defaults rather than required options. None of this is a decision a page
 * embedding a wallet picker should have to make: it is Reclack's own
 * infrastructure, and a host that had to supply it would be configuring our
 * deployment on our behalf. Every value here can still be overridden, for a
 * sandbox, a private endpoint, or a partner running the kit under its own
 * name.
 */

/** The API the wallet catalogue is a configuration row of. */
export const DEFAULT_API_URL = 'https://api.reclack.com'

/**
 * Reclack's Reown project id, used only to pair with a wallet that injects
 * nothing into the page: Safe, Kraken, BitPay, Bitcoin.com and Blockchain.com
 * reach an app over WalletConnect and cannot be seen any other way.
 *
 * Public by design. It identifies the page to the relay and carries no
 * authority, which is why it ships here rather than being asked of every
 * host. It is already in the bundle every Reclack checkout serves.
 */
export const DEFAULT_WALLETCONNECT_PROJECT_ID = '9bb122bca7ef21f2c2110494ad9ad559'

/**
 * Where Solana balances are read from.
 *
 * Solana wallets sign; they do not answer questions about the chain, so there
 * is no provider to fall back on the way there is on EVM. The public endpoint
 * is rate-limited and fine for one balance on a page; anything heavier should
 * pass its own.
 */
export const DEFAULT_SVM_RPC_URL = 'https://api.mainnet-beta.solana.com'

/**
 * The read endpoint for an EVM chain, from the registry already pinned in
 * this package.
 *
 * The same endpoints the kit would propose to a wallet when adding a chain,
 * reused rather than listed twice: the reason they are pinned in the bundle
 * at all is that they are reviewed, and a second list would not be.
 */
export function defaultRpcUrl (chainId: number): string | undefined {
	return chainMetadata(chainId)?.rpcUrls[0]
}
