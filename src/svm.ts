import { base58Encode, fromBase64 } from './base58.js'
import { detect, engineOf, walletsFor, type WalletEntry } from './catalog.js'
import { WalletError } from './errors.js'
import {
	connectFeature,
	disconnectFeature,
	discoverStandardWallets,
	signFeature,
	usable,
	type StandardAccount,
	type StandardWallet,
} from './wallet-standard.js'
import type {
	ConnectedSvmWallet,
	DetectedSvmWallet,
	SvmProvider,
} from './types.js'

/** Reads whatever shape a wallet returns its public key in. */
function addressOf (value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value
	}
	// Wallets that ship a web3.js PublicKey return an object. toBase58 is the
	// documented accessor; toString gives the same thing, and both are tried
	// rather than assuming which one a given wallet exposes.
	const key = value as { toBase58?: () => string; toString?: () => string }
	if (typeof key?.toBase58 === 'function') {
		return key.toBase58()
	}
	if (typeof key?.toString === 'function') {
		const text = key.toString()
		return text === '[object Object]' ? undefined : text
	}
	return undefined
}

/**
 * Prompts the wallet for an account.
 *
 * Two routes because there are two kinds of wallet here. A registered one is
 * asked through its connect feature and hands back accounts; an injected one
 * is asked through its provider. The account object from the first is kept,
 * because signing needs it back.
 */
export async function connectSvmWallet(
	wallet: DetectedSvmWallet,
): Promise<{ address: string; account?: StandardAccount }> {
	if (wallet.standard) {
		const { accounts } = await connectFeature(wallet.standard).connect()
		const account = accounts.find((entry) =>
			entry.chains.some((chain) => chain.startsWith('solana:')),
		) ?? accounts[0]
		if (!account?.address) {
			throw new WalletError('No account was shared by the wallet.')
		}
		return { address: account.address, account }
	}

	const provider = wallet.provider
	if (!provider) {
		throw new WalletError('This wallet cannot be connected.')
	}
	const response = provider.connect
		? await provider.connect()
		: await provider.request?.({ method: 'connect' })

	const fromResponse = addressOf(
		(response as { publicKey?: unknown } | undefined)?.publicKey,
	)
	const address = fromResponse ?? addressOf(provider.publicKey)
	if (!address) {
		throw new WalletError('No account was shared by the wallet.')
	}
	return { address }
}

/** Ends the session where the wallet offers a way to. */
export async function disconnectSvmWallet(
	wallet: ConnectedSvmWallet,
): Promise<void> {
	if (wallet.standard) {
		await disconnectFeature(wallet.standard)?.disconnect()
		return
	}
	await wallet.provider?.disconnect?.()
}

/**
 * Signs the prepared transaction and lets the wallet submit it.
 *
 * Nothing here builds or alters a transaction: the plan arrives built, in
 * both the forms a wallet might want, and this picks the one its route takes.
 * The payer still sees the wallet decode and display it before approving.
 *
 * Letting the wallet send it, rather than signing and sending separately,
 * means one prompt and no RPC endpoint in this bundle.
 */
export async function signAndSendSvm(
	wallet: ConnectedSvmWallet,
	plan: { message: string; transaction: string; chain: string },
): Promise<string> {
	if (wallet.standard && wallet.account) {
		const [result] = await signFeature(wallet.standard).signAndSendTransaction({
			account: wallet.account,
			chain: wallet.account.chains.find((chain) => chain === plan.chain)
				?? plan.chain,
			transaction: fromBase64(plan.transaction),
		})
		if (!result?.signature) {
			throw new WalletError('The wallet did not return a transaction signature.')
		}
		// Raw bytes from this route, where every other part of the system
		// names a transaction by its base58 string.
		return base58Encode(result.signature)
	}

	const provider = wallet.provider
	if (typeof provider?.request !== 'function') {
		throw new WalletError(
			'This wallet cannot sign Solana payments. Try another wallet.',
		)
	}

	let response: unknown
	try {
		response = await provider.request({
			method: 'signAndSendTransaction',
			params: { message: plan.message },
		})
	} catch (error) {
		// A wallet that rejected it, or one whose provider does not speak
		// this method. The two are told apart by the code: a rejection is the
		// payer's own choice and must be reported as such rather than as an
		// unsupported wallet.
		const code = (error as { code?: number }).code
		if (code === 4001 || code === -32002 || code === -32603) {
			throw error
		}
		throw new WalletError(
			'This wallet could not sign the payment. Try another wallet.',
		)
	}

	const signature = (response as { signature?: unknown } | undefined)?.signature
	if (typeof signature !== 'string' || signature === '') {
		throw new WalletError('The wallet did not return a transaction signature.')
	}
	return signature
}

/** Truncates a base58 address for display: 5e9y…xAQf. */
export function shortSvmAddress (address: string): string {
	if (address.length < 12) {
		return address
	}
	return `${address.slice(0, 4)}…${address.slice(-4)}`
}

/** Matches a registered wallet to a catalogued id, for its mark. */
/**
 * The catalogue id for a wallet that registered under a name.
 *
 * Exact first, and only then a containing match. The two differ now that the
 * catalogue names dozens of wallets: "Core" is a substring of plenty of other
 * names, and a loose match handed one wallet another's artwork. The loose
 * match is still worth keeping for the wallet that registers as "Phantom
 * Wallet" where the catalogue says "Phantom".
 */
function idFor(name: string, known: WalletEntry[]): string {
	const key = name.toLowerCase()
	const match = known.find((wallet) => wallet.name.toLowerCase() === key)
		?? known.find((wallet) => key.includes(wallet.name.toLowerCase()))
	return match?.id ?? key.replace(/[^a-z0-9]+/g, '-')
}

/**
 * Finds the Solana wallets available in this browser.
 *
 * The Wallet Standard first: it is how wallets announce Solana support, it
 * survives several being installed at once, and the wallet supplies its own
 * name and icon. Sniffing globals is only a fallback for one that has not
 * adopted it, and never overrides a registered wallet.
 *
 * Returns a cleanup function; callers must call it to drop the listener.
 */
export function discoverSvmWallets(
	catalog: WalletEntry[],
	onChange: (wallets: DetectedSvmWallet[]) => void,
): () => void {
	const known = walletsFor(catalog, 'svm')
	let registered: StandardWallet[] = []

	function emit() {
		const found = new Map<string, DetectedSvmWallet>()
		for (const wallet of registered) {
			if (!usable(wallet)) {
				continue
			}
			const id = idFor(wallet.name, known)
			found.set(id, { id, name: wallet.name, icon: wallet.icon, standard: wallet })
		}
		// Only for a wallet that did not register. Every wallet worth naming
		// does now, so in practice this catches the ones that have not
		// caught up.
		for (const definition of known) {
			if (found.has(definition.id)) {
				continue
			}
			const provider = detect(window, engineOf(definition, 'svm')) as SvmProvider | undefined
			if (typeof provider?.request === 'function') {
				found.set(definition.id, {
					id: definition.id,
					name: definition.name,
					provider,
				})
			}
		}
		// Registry order first, so the list is stable rather than dependent
		// on which wallet answered first; anything else follows.
		const ordered = known
			.map((definition) => found.get(definition.id))
			.filter((wallet): wallet is DetectedSvmWallet => Boolean(wallet))
		for (const [id, wallet] of found) {
			if (!known.some((definition) => definition.id === id)) {
				ordered.push(wallet)
			}
		}
		onChange(ordered)
	}

	const stop = discoverStandardWallets((wallets) => {
		registered = wallets
		emit()
	})
	// A wallet that injects a global late would otherwise be missed, the same
	// race the EIP-6963 discovery keeps a retry for.
	const retry = window.setTimeout(emit, 400)
	emit()

	return () => {
		stop()
		window.clearTimeout(retry)
	}
}


