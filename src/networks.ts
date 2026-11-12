/**
 * Chain names and marks.
 *
 * Keyed by network name rather than chain id, for two reasons. A testnet
 * shows its mainnet's mark: the chain is the same brand, and a payer reading
 * "Base Sepolia" is helped by the Base mark rather than confused by it. And
 * chain id is not unique across families, since Solana and its devnet both
 * carry zero.
 *
 * Served from the host's own origin, exactly like the wallet artwork, so a
 * checkout makes no third-party image request. A network with no entry falls
 * back to its initial rather than a broken image, which is the normal state
 * for a chain that is payable before its mark ships.
 */
import { DEFAULT_LOGO_BASE } from './icons.js'

export const NETWORK_LOGOS: Record<string, string> = {
	base: 'base.webp',
	'base-sepolia': 'base.webp',
	ethereum: 'ethereum.webp',
	'ethereum-sepolia': 'ethereum.webp',
	polygon: 'polygon.webp',
	'polygon-amoy': 'polygon.webp',
	solana: 'solana.webp',
	'solana-devnet': 'solana.webp',
}

/** The artwork for a chain, or nothing where this carries none. */
export function networkLogo (
	network: string,
	base: string = DEFAULT_LOGO_BASE,
): string | undefined {
	const file = NETWORK_LOGOS[network]
	if (!file) {
		return undefined
	}
	return `${base.endsWith('/') ? base : `${base}/`}${file}`
}

/** `base-sepolia` reads as `Base Sepolia`. */
export function networkLabel (network: string): string {
	return network
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ')
}
