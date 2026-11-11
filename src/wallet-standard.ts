/**
 * Solana wallet discovery through the Wallet Standard.
 *
 * The Solana equivalent of EIP-6963, and here for the same reason: sniffing
 * globals finds only the wallets that claim one. MetaMask, Brave, Coinbase
 * Wallet and others all sign Solana now, and they announce it this way rather
 * than by injecting `window.solana`, so a list built from globals is a list
 * of three wallets that is wrong about every other.
 *
 * Hand-typed against the protocol rather than pulled from @wallet-standard:
 * the handshake is two events and one method, and a checkout page handling
 * other people's money should ship as little third-party code as it can.
 *
 * The protocol: a wallet already loaded listens for `app-ready` and registers
 * itself with the API it carries; a wallet that loads later dispatches
 * `register-wallet` with a callback for the app to hand that API to. An app
 * must do both or it misses one group or the other.
 */

/** One account a wallet has connected. */
export interface StandardAccount {
	/** Base58, which is what this app wants. */
	address: string
	chains: readonly string[]
	features: readonly string[]
}

interface ConnectFeature {
	connect(input?: { silent?: boolean }): Promise<{
		accounts: readonly StandardAccount[]
	}>
}

interface SignAndSendFeature {
	signAndSendTransaction(
		...inputs: {
			account: StandardAccount
			chain: string
			transaction: Uint8Array
		}[]
	): Promise<readonly { signature: Uint8Array }[]>
}

/** A wallet as the standard describes it. */
export interface StandardWallet {
	name: string
	icon?: string
	version: string
	chains: readonly string[]
	accounts: readonly StandardAccount[]
	features: Record<string, unknown>
}

export const CONNECT = 'standard:connect'
export const SIGN_AND_SEND = 'solana:signAndSendTransaction'
const DISCONNECT = 'standard:disconnect'
const EVENTS = 'standard:events'

/**
 * Whether this wallet can do what a checkout needs: connect, and sign and
 * send a Solana transaction.
 *
 * Both are required. A wallet that can sign but not send would leave this
 * page needing an RPC endpoint and a submission path of its own, which is
 * exactly what the plan was built to avoid.
 */
export function usable(wallet: StandardWallet): boolean {
	return (
		Boolean(wallet.features?.[CONNECT])
		&& Boolean(wallet.features?.[SIGN_AND_SEND])
		&& wallet.chains.some((chain) => chain.startsWith('solana:'))
	)
}

export function connectFeature(wallet: StandardWallet): ConnectFeature {
	return wallet.features[CONNECT] as ConnectFeature
}

export function signFeature(wallet: StandardWallet): SignAndSendFeature {
	return wallet.features[SIGN_AND_SEND] as SignAndSendFeature
}

export function disconnectFeature(
	wallet: StandardWallet,
): { disconnect(): Promise<void> } | undefined {
	return wallet.features[DISCONNECT] as { disconnect(): Promise<void> } | undefined
}

export function eventsFeature(
	wallet: StandardWallet,
): { on(event: string, listener: () => void): () => void } | undefined {
	return wallet.features[EVENTS] as
		| { on(event: string, listener: () => void): () => void }
		| undefined
}

/**
 * Collects the wallets registered in this page, now and as they arrive.
 *
 * Returns a cleanup function; callers must call it to drop the listener. The
 * same contract as the EIP-6963 discovery beside it.
 */
export function discoverStandardWallets(
	onChange: (wallets: StandardWallet[]) => void,
): () => void {
	const found = new Map<string, StandardWallet>()

	function register(...wallets: StandardWallet[]): () => void {
		let added = false
		for (const wallet of wallets) {
			// Keyed by name: the standard has no stable id, and a wallet
			// registering twice is a duplicate row rather than two wallets.
			if (wallet?.name && !found.has(wallet.name)) {
				found.set(wallet.name, wallet)
				added = true
			}
		}
		if (added) {
			onChange([...found.values()])
		}
		// The standard's register returns an unregister function. Nothing
		// here unregisters anyone, so this is a no-op rather than a lie
		// about what it does.
		return () => undefined
	}

	const api = Object.freeze({ register })

	function onRegister(event: Event) {
		const callback = (event as CustomEvent<(api: unknown) => void>).detail
		if (typeof callback === 'function') {
			callback(api)
		}
	}

	window.addEventListener('wallet-standard:register-wallet', onRegister)
	// Wakes the wallets that were already loaded when this page was: they
	// listen for this and register themselves in response.
	window.dispatchEvent(
		new CustomEvent('wallet-standard:app-ready', { detail: api }),
	)

	return () => {
		window.removeEventListener('wallet-standard:register-wallet', onRegister)
	}
}
