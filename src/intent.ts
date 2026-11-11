import type { Asset, Balance } from './balance.js'
import type { ChainFamily, Eip1193Provider } from './types.js'

/**
 * What the caller wants out of connecting a wallet.
 *
 * A list rather than a mode, because these are not alternatives: a page may
 * want an address and a balance from one connection, and a later one will
 * want an authorization signed in the same breath. Each member says what the
 * result must carry, and the picker itself is identical for all of them.
 *
 * `address` is the by-product of connecting at all, so it is always obtained;
 * asking for it only says the caller wants it handed back.
 *
 * `balance` needs an asset to be a balance of. Asking for it without one is a
 * programming error, not a runtime condition.
 *
 * `authorize` is the embedded checkout's signing step. Reserved here so the
 * shape does not have to change when it arrives.
 */
export type Intent = 'address' | 'balance' | 'authorize'

export interface ConnectRequest {
	intent: Intent[]
	/**
	 * Which family of wallets to offer. Omitted means both, which is right
	 * for a checkout that settles on either and wrong for a form whose
	 * address has to be one format.
	 */
	family?: ChainFamily
	/**
	 * The EVM chain the wallet must end up on.
	 *
	 * Enforced only when given. A page collecting an address should leave it
	 * out: the same address receives on every EVM chain, and asking somebody
	 * to switch networks in their wallet to read an address back is theatre.
	 */
	chainId?: number
	/** What to read a balance of. Required when `intent` includes 'balance'. */
	assets?: Asset[]
	/**
	 * Hold the connection open after the result is handed back, following
	 * account and chain changes.
	 *
	 * True for a checkout, which signs later. False for a form, which wanted
	 * a value and is done.
	 */
	keepAlive?: boolean
}

export interface ConnectResult {
	walletId: string
	name: string
	icon?: string
	family: ChainFamily
	address: string
	/** The chain the wallet was on. EVM only; Solana has nothing to be on. */
	chainId?: number
	/** Present when 'balance' was asked for, in the order the assets were given. */
	balances?: Balance[]
	/** Present only when `keepAlive` was set. */
	provider?: Eip1193Provider
}
