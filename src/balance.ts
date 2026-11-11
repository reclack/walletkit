import { addressWord, calldata } from './abi.js'
import { chainMetadata } from './chains.js'
import type { Eip1193Provider } from './types.js'

/**
 * What a balance is a balance of.
 *
 * Omitting the contract means the chain's own coin, which is a real question
 * and not an edge case: the authorization path is relayed and needs no gas,
 * but the approve and transfer paths do, and "no ETH" is the failure a token
 * balance does not catch.
 */
export type Asset =
	| {
		family: 'evm'
		chainId: number
		/** ERC-20 contract. Absent for the chain's native coin. */
		token?: string
		decimals?: number
		symbol?: string
	}
	| {
		family: 'svm'
		/** SPL mint. Absent for SOL itself. */
		mint?: string
		decimals?: number
		symbol?: string
	}

/**
 * An amount, in the asset's smallest unit.
 *
 * A bigint, never a number. Money does not survive a float: 0.1 + 0.2 is not
 * 0.3 in binary, and a balance compared against a charge decides whether
 * somebody is asked to sign something that cannot settle.
 */
export interface Balance {
	asset: Asset
	amount: bigint
	decimals: number
	symbol?: string
}

/**
 * Where a balance is read from, and the choice matters more than it looks.
 *
 * Through the connected wallet's own provider, the wallet has to be on that
 * chain, so asking for a balance forces a network switch. Through an RPC
 * endpoint it does not, and several chains can be read at once. So the RPC is
 * the default for anything informational, and the provider is for the one
 * case that needs it: the pre-flight immediately before signing, where the
 * question is what this exact wallet can spend right now.
 */
export type BalanceSource =
	| { provider: Eip1193Provider }
	| { rpcUrl: string }

// cast sig "balanceOf(address)"
const BALANCE_OF_SELECTOR = '0x70a08231'
// cast sig "decimals()"
const DECIMALS_SELECTOR = '0x313ce567'

/** Lamports per SOL, and the decimals every SOL balance is quoted in. */
const SOL_DECIMALS = 9

function hexToBigInt (raw: unknown): bigint {
	return typeof raw === 'string' && raw !== '0x' ? BigInt(raw) : 0n
}

/**
 * One JSON-RPC call over HTTP.
 *
 * Hand-rolled rather than pulled from a client library, for the same reason
 * the ABI encoder is: this package runs on pages that handle other people's
 * money, and every dependency is code somebody else can change under us.
 */
async function rpc (
	url: string,
	method: string,
	params: unknown[],
): Promise<unknown> {
	const response = await fetch(url, {
		method: 'POST',
		credentials: 'omit',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
	})
	if (!response.ok) {
		throw new Error(`RPC ${method} failed: ${response.status}`)
	}
	const body = (await response.json()) as {
		result?: unknown
		error?: { message?: string }
	}
	if (body.error) {
		throw new Error(body.error.message ?? `RPC ${method} failed`)
	}
	return body.result
}

/** An eth_call, through whichever source was given. */
async function call (
	source: BalanceSource,
	to: string,
	data: string,
): Promise<unknown> {
	const params = [{ to, data }, 'latest']
	return 'provider' in source
		? source.provider.request({ method: 'eth_call', params })
		: rpc(source.rpcUrl, 'eth_call', params)
}

/**
 * How many decimals the token quotes, asked of the token itself.
 *
 * Only when the caller did not say. A caller that knows should pass it: USDC
 * is six everywhere it matters, and a round trip to find that out again is a
 * round trip.
 */
async function evmDecimals (
	source: BalanceSource,
	token: string,
	given: number | undefined,
): Promise<number> {
	if (typeof given === 'number') {
		return given
	}
	const raw = await call(source, token, calldata(DECIMALS_SELECTOR, []))
	const value = Number(hexToBigInt(raw))
	// A token that answers something absurd is a token this is not going to
	// get right by guessing. Eighteen is the ERC-20 default.
	return Number.isInteger(value) && value >= 0 && value <= 36 ? value : 18
}

/** The payer's balance of one EVM asset. */
export async function readEvmBalance (
	source: BalanceSource,
	asset: Extract<Asset, { family: 'evm' }>,
	owner: string,
): Promise<Balance> {
	if (!asset.token) {
		const params = [owner, 'latest']
		const raw = 'provider' in source
			? await source.provider.request({ method: 'eth_getBalance', params })
			: await rpc(source.rpcUrl, 'eth_getBalance', params)
		const native = chainMetadata(asset.chainId)?.nativeCurrency
		return {
			asset,
			amount: hexToBigInt(raw),
			decimals: asset.decimals ?? native?.decimals ?? 18,
			symbol: asset.symbol ?? native?.symbol,
		}
	}

	const data = calldata(BALANCE_OF_SELECTOR, [addressWord(owner)])
	const [raw, decimals] = await Promise.all([
		call(source, asset.token, data),
		evmDecimals(source, asset.token, asset.decimals),
	])
	return {
		asset,
		amount: hexToBigInt(raw),
		decimals,
		symbol: asset.symbol,
	}
}

/**
 * The payer's balance of one Solana asset.
 *
 * RPC only. Solana wallets sign; they do not answer questions about the
 * chain, so there is no provider path here the way there is on EVM.
 *
 * Token accounts are listed by mint rather than deriving the associated
 * account address, which would mean shipping a program-derived-address
 * implementation to answer a question the node can answer directly. An owner
 * may hold several accounts for one mint, so they are summed.
 */
export async function readSvmBalance (
	rpcUrl: string,
	asset: Extract<Asset, { family: 'svm' }>,
	owner: string,
): Promise<Balance> {
	if (!asset.mint) {
		const lamports = await rpc(rpcUrl, 'getBalance', [owner])
		const value = (lamports as { value?: number } | null)?.value ?? 0
		return {
			asset,
			amount: BigInt(value),
			decimals: asset.decimals ?? SOL_DECIMALS,
			symbol: asset.symbol ?? 'SOL',
		}
	}

	const result = await rpc(rpcUrl, 'getTokenAccountsByOwner', [
		owner,
		{ mint: asset.mint },
		{ encoding: 'jsonParsed' },
	])
	const accounts = (result as { value?: unknown[] } | null)?.value ?? []
	let amount = 0n
	let decimals = asset.decimals ?? 0
	for (const entry of accounts) {
		const info = (entry as Record<string, any>)?.account?.data?.parsed?.info
		const token = info?.tokenAmount
		if (typeof token?.amount === 'string') {
			amount += BigInt(token.amount)
		}
		if (asset.decimals === undefined && typeof token?.decimals === 'number') {
			decimals = token.decimals
		}
	}
	return { asset, amount, decimals, symbol: asset.symbol }
}

/**
 * Formats an amount for display, without ever making it a float.
 *
 * String arithmetic on the integer, not a division: the whole reason the
 * amount is a bigint is that the moment it becomes a Number it stops being
 * exact, and a balance is shown next to a charge the payer is about to
 * approve.
 */
export function formatUnits (amount: bigint, decimals: number): string {
	const negative = amount < 0n
	const digits = (negative ? -amount : amount).toString().padStart(decimals + 1, '0')
	const whole = digits.slice(0, digits.length - decimals)
	const fraction = decimals > 0
		? digits.slice(digits.length - decimals).replace(/0+$/, '')
		: ''
	const sign = negative ? '-' : ''
	return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`
}
