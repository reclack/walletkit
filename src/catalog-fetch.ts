import type { WalletEngine, WalletEntry } from './catalog.js'

/**
 * The wallets Reclack can name, read from public configuration.
 *
 * Configuration rather than a list in a bundle, because four places kept
 * their own copy and they drifted: the hosted checkout, the dashboard, the
 * marketing site, and a second list inside the checkout itself. This is the
 * one reader they all now share.
 *
 * Never throws, and an empty catalogue is a working page rather than a broken
 * one. Wallets that announce themselves, over EIP-6963 or the Wallet
 * Standard, carry their own name and icon and still connect; what is lost is
 * the install list and the ordering. So this never blocks rendering: somebody
 * with a wallet installed can always get through.
 */
export async function fetchWalletCatalog (url: string): Promise<WalletEntry[]> {
	try {
		const response = await fetch(url, {
			// Public configuration. Sending credentials would make this a
			// cross-origin request that needs them back, for a row that is
			// the same for everybody.
			credentials: 'omit',
			headers: { Accept: 'application/json' },
		})
		if (!response.ok) {
			return []
		}
		const rows = (await response.json()) as { name: string; value: unknown }[]
		const row = Array.isArray(rows)
			? rows.find((entry) => entry.name === 'wallets')
			: undefined
		if (!Array.isArray(row?.value)) {
			return []
		}
		return row.value
			.map(toWalletEntry)
			.filter((entry): entry is WalletEntry => entry !== undefined)
	} catch {
		return []
	}
}

/** The configuration endpoint the catalogue is a row of. */
export function walletCatalogUrl (apiUrl: string): string {
	return `${apiUrl.replace(/\/$/, '')}/v1/configurations?name=wallets`
}

/**
 * rdns as a list, whatever the configuration row holds.
 *
 * It was a single string until the catalogue learned that one wallet
 * announces itself under several ids, and a row written before that is still
 * a string until the migration reaches it. The declared type says list, so
 * nothing downstream would think to check.
 */
function withRdnsList (engine: WalletEngine): WalletEngine {
	const rdns: unknown = engine.rdns
	if (rdns === undefined || Array.isArray(rdns)) {
		return engine
	}
	return { ...engine, rdns: typeof rdns === 'string' ? [rdns] : undefined }
}

/**
 * One catalogue row, read rather than cast.
 *
 * The API sends install_url; this package reads installUrl. A cast renames
 * nothing at runtime, so the install link was an anchor with no href and
 * clicking it did nothing. Engine fields keep their wire names, so they pass
 * through as they came, bar the one shape that changed under them.
 */
function toWalletEntry (value: unknown): WalletEntry | undefined {
	const row = value as Record<string, unknown> | null
	if (typeof row?.id !== 'string' || typeof row.name !== 'string') {
		return undefined
	}
	return {
		id: row.id,
		name: row.name,
		// Empty when the catalogue has none: the panel offers no install link
		// rather than one that goes nowhere.
		installUrl: typeof row.install_url === 'string' ? row.install_url : '',
		browser: row.browser === true,
		engines: (Array.isArray(row.engines) ? (row.engines as WalletEngine[]) : [])
			.map(withRdnsList),
	}
}
