/**
 * Everything about EVM wallets: finding them, connecting to one, and getting
 * it onto the right chain.
 *
 * The family's own half of the wallet layer, beside svm.ts, and laid out the
 * same way: which wallets exist, how to detect them, how to connect, and what
 * can be asked of one afterwards. Named for the family rather than for what
 * it does, because what it does has no meaning without it: switchEvmChain is
 * an EVM idea, and Solana has nothing to switch to.
 *
 * One file rather than three. The registry and the discovery were their own
 * modules back when there was only one family and "the wallet layer" needed
 * no qualifier; with two, a reader looking for how EVM works should find it
 * in one place, exactly as they do for Solana.
 */
import { detect, engineOf, walletsFor, type WalletEntry } from './catalog.js'
import { chainMetadata } from './chains.js'
import { WalletError, type ProviderRpcError } from './errors.js'
import type {
	ConnectedEvmWallet,
	DetectedEvmWallet,
	Eip1193Provider,
} from './types.js'

// ---------------------------------------------------------------------------
// Which wallets exist, and finding the ones installed here.
// ---------------------------------------------------------------------------

/**
 * The wallets Reclack recognises.
 *
 * Adding one is a single entry here: nothing else in the app hard-codes a
 * wallet. `rdns` is the preferred match because EIP-6963 lets a wallet identify
 * itself; `detect` is only a fallback for wallets that still just inject a
 * global, and is checked in registry order so a more specific flag wins before
 * the generic `window.ethereum`.
 */





/**
 * EIP-6963 announcement payload. Wallets broadcast themselves in response to a
 * request event, which is how multiple wallets coexist without fighting over
 * `window.ethereum`.
 */
interface Eip6963Detail {
	info: { uuid: string; name: string; icon: string; rdns: string }
	provider: Eip1193Provider
}

/**
 * Finds the wallets available in this browser.
 *
 * EIP-6963 first: it is the standard, it survives several wallets being
 * installed together, and the wallet supplies its own name and icon, so no
 * brand assets ship in this bundle. Global sniffing is only a fallback for
 * wallets that have not adopted it, and never overrides an announced provider.
 *
 * Returns a cleanup function; callers must call it to drop the listener.
 */
export function discoverEvmWallets (
	catalog: WalletEntry[],
	onChange: (wallets: DetectedEvmWallet[]) => void,
): () => void {
	const known = walletsFor(catalog, 'evm')
	const announced = new Map<string, DetectedEvmWallet>()

	function emit () {
		const found = new Map<string, DetectedEvmWallet>(announced)

		// The providers already accounted for, by object and not by id.
		//
		// A wallet whose rdns this registry does not know announces under
		// its own rdns, which matches no entry here, and the sniff below
		// would then find the same extension again and list it twice. It is
		// the same provider instance both times, so comparing the object
		// settles it without needing to know the rdns.
		const seen = new Set(
			[...announced.values()].map((wallet) => wallet.provider),
		)

		// Fall back to globals only for wallets that did not announce.
		for (const definition of known) {
			if (found.has(definition.id)) {
				continue
			}
			const provider = detect(window, engineOf(definition, 'evm')) as
				| Eip1193Provider
				| undefined
			if (provider && !seen.has(provider)) {
				found.set(definition.id, {
					id: definition.id,
					name: definition.name,
					provider,
					announced: false,
				})
			}
		}

		// Registry order, so the list is stable rather than dependent on which
		// wallet happened to answer first.
		const ordered = known
			.map((definition) => found.get(definition.id))
			.filter((wallet): wallet is DetectedEvmWallet => Boolean(wallet))
		// Anything that announced itself but is not in the registry still works;
		// it is listed after the known names.
		for (const [id, wallet] of found) {
			if (!known.some((definition) => definition.id === id)) {
				ordered.push(wallet)
			}
		}
		onChange(ordered)
	}

	function handleAnnounce (event: Event) {
		const detail = (event as CustomEvent<Eip6963Detail>).detail
		if (!detail?.info || !detail.provider) {
			return
		}
		// Matched to a catalogued wallet by the id it announces, so a known
		// wallet keeps our name and ordering; anything else is listed under
		// the rdns it gave. Any of a wallet's ids will do: a payment signed
		// in MetaMask's phone browser is a payment signed in MetaMask, and
		// matching its extension id alone recorded one against a wallet
		// nothing downstream could name or draw.
		const match = known.find((wallet) =>
			engineOf(wallet, 'evm')?.rdns?.includes(detail.info.rdns))
		announced.set(match?.id ?? detail.info.rdns, {
			id: match?.id ?? detail.info.rdns,
			name: match?.name ?? detail.info.name,
			icon: detail.info.icon,
			provider: detail.provider,
			announced: true,
		})
		emit()
	}

	// Asked for repeatedly, which EIP-6963 is built for: an extension that
	// injects after the first request never hears it, and in a frame it
	// often does. The announcement listener stays up throughout, so a wallet
	// that answers any of these is picked up.
	function ask () {
		window.dispatchEvent(new Event('eip6963:requestProvider'))
		emit()
	}

	window.addEventListener('eip6963:announceProvider', handleAnnounce)
	// A frame's load can come well after this module runs.
	window.addEventListener('load', ask)
	const retries = [100, 400, 1000, 2000].map(
		(delay) => window.setTimeout(ask, delay),
	)
	ask()

	return () => {
		window.removeEventListener('eip6963:announceProvider', handleAnnounce)
		window.removeEventListener('load', ask)
		for (const retry of retries) {
			window.clearTimeout(retry)
		}
	}
}

// ---------------------------------------------------------------------------
// Connecting, and what can be asked of a wallet once connected.
// ---------------------------------------------------------------------------

function firstAddress (accounts: unknown): string | undefined {
	if (!Array.isArray(accounts) || accounts.length === 0) {
		return undefined
	}
	const address = accounts[0]
	return typeof address === 'string' ? address : undefined
}

async function chainIdOf (provider: Eip1193Provider): Promise<number> {
	const raw = await provider.request({ method: 'eth_chainId' })
	return typeof raw === 'string' ? Number.parseInt(raw, 16) : Number(raw)
}

/** Prompts the wallet for an account. */
export async function connectEvmWallet (
	wallet: DetectedEvmWallet,
): Promise<ConnectedEvmWallet> {
	const accounts = await wallet.provider.request({
		method: 'eth_requestAccounts',
	})
	const address = firstAddress(accounts)
	if (!address) {
		throw new WalletError('No account was shared by the wallet.')
	}
	return {
		walletId: wallet.id,
		name: wallet.name,
		icon: wallet.icon,
		address,
		chainId: await chainIdOf(wallet.provider),
		provider: wallet.provider,
	}
}

/**
 * Some wallets report an unknown chain as 4902; others bury that code inside a
 * -32603 wrapper, and a few only say so in the message. All three mean the same
 * thing: the chain is not in the wallet yet.
 */
function isUnknownChain (error: unknown): boolean {
	const rpc = error as ProviderRpcError & { data?: ProviderRpcError }
	if (rpc?.code === 4902 || rpc?.data?.code === 4902) {
		return true
	}
	return /unrecognized chain|unknown chain|add.*chain/i.test(rpc?.message ?? '')
}

/**
 * Moves the wallet to the chain the payment link settles on.
 *
 * A payer on the wrong network would otherwise sign a transaction that can
 * never settle, so this runs before anything is signed.
 *
 * If the wallet does not know the chain, it is offered rather than reported as
 * a dead end: being told "that network is not added to your wallet" leaves the
 * payer to go and add it by hand, which is exactly what
 * `wallet_addEthereumChain` exists to avoid. The wallet still shows its own
 * confirmation, so the payer approves both the addition and the switch; nothing
 * is added silently.
 *
 * Only chains in the local registry can be offered: see chains.ts for why the
 * RPC endpoints are pinned in the bundle.
 */
export async function switchEvmChain (
	provider: Eip1193Provider,
	chainId: number,
): Promise<void> {
	const hexChainId = `0x${chainId.toString(16)}`

	try {
		await provider.request({
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: hexChainId }],
		})
		return
	} catch (error) {
		if (!isUnknownChain(error)) {
			throw error
		}

		const metadata = chainMetadata(chainId)
		if (!metadata) {
			throw new WalletError(
				'This network is not supported by your wallet yet. Add it manually to continue.',
			)
		}

		await provider.request({
			method: 'wallet_addEthereumChain',
			params: [
				{
					chainId: hexChainId,
					chainName: metadata.chainName,
					nativeCurrency: metadata.nativeCurrency,
					rpcUrls: metadata.rpcUrls,
					blockExplorerUrls: metadata.blockExplorerUrls,
				},
			],
		})

		// Most wallets switch as part of adding, but not all: asking again is
		// cheap and a no-op when the wallet already moved.
		await provider.request({
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: hexChainId }],
		})
	}
}

/** Truncates an address for display: 0x1234…ab34. */
export function shortEvmAddress (address: string): string {
	if (address.length < 12) {
		return address
	}
	return `${address.slice(0, 6)}…${address.slice(-4)}`
}
