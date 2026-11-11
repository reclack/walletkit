/**
 * Chain metadata for `wallet_addEthereumChain`.
 *
 * Deliberately a client-side registry rather than something the API sends.
 * Adding a chain hands the wallet an RPC endpoint that will then see the
 * payer's traffic, so the list of endpoints a payment page can propose is
 * pinned in the bundle where it can be reviewed, not taken from a response
 * body. A chain missing here simply cannot be auto-added.
 */
export interface ChainMetadata {
	chainId: number
	chainName: string
	nativeCurrency: { name: string; symbol: string; decimals: number }
	rpcUrls: string[]
	blockExplorerUrls: string[]
}

const ETH = { name: 'Ether', symbol: 'ETH', decimals: 18 }

export const CHAINS: Record<number, ChainMetadata> = {
	1: {
		chainId: 1,
		chainName: 'Ethereum',
		nativeCurrency: ETH,
		rpcUrls: ['https://ethereum-rpc.publicnode.com'],
		blockExplorerUrls: ['https://etherscan.io'],
	},
	11155111: {
		chainId: 11155111,
		chainName: 'Ethereum Sepolia',
		nativeCurrency: ETH,
		rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
		blockExplorerUrls: ['https://sepolia.etherscan.io'],
	},
	8453: {
		chainId: 8453,
		chainName: 'Base',
		nativeCurrency: ETH,
		rpcUrls: ['https://mainnet.base.org'],
		blockExplorerUrls: ['https://basescan.org'],
	},
	84532: {
		chainId: 84532,
		chainName: 'Base Sepolia',
		nativeCurrency: ETH,
		rpcUrls: ['https://sepolia.base.org'],
		blockExplorerUrls: ['https://sepolia.basescan.org'],
	},
	137: {
		chainId: 137,
		chainName: 'Polygon',
		nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
		rpcUrls: ['https://polygon-bor-rpc.publicnode.com'],
		blockExplorerUrls: ['https://polygonscan.com'],
	},
	80002: {
		chainId: 80002,
		chainName: 'Polygon Amoy',
		nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
		rpcUrls: ['https://polygon-amoy-bor-rpc.publicnode.com'],
		blockExplorerUrls: ['https://amoy.polygonscan.com'],
	},
}

/**
 * A link to one transaction on the chain's own explorer.
 *
 * Derived from the same pinned registry the wallet is offered, so the link
 * always matches the chain actually paid on: a testnet payment opens the
 * testnet explorer. A mainnet link would 404 on a hash that only exists on a
 * testnet, which to a payer looks like the payment vanished.
 *
 * Undefined for a chain with no explorer, so the caller can show the bare hash
 * rather than a dead link.
 */
/**
 * Solana explorers, keyed by network name.
 *
 * By name and not by chain id, because every non-EVM chain carries zero:
 * Solana and its devnet would otherwise be the same key, and a devnet payer
 * would be sent to a mainnet explorer that has never heard of their
 * transaction. The cluster is part of the URL for the same reason.
 */
const SVM_EXPLORERS: Record<string, string> = {
	solana: 'https://solscan.io',
	'solana-devnet': 'https://solscan.io?cluster=devnet',
}

/**
 * The link a payer follows to see their own transaction.
 *
 * Takes the network as well as the chain id so it can answer for either
 * family. Returns nothing for a chain with no explorer configured, and the
 * caller shows no link rather than a broken one.
 */
export function explorerTxUrl (
	chainId: number,
	hash: string,
	network?: string,
): string | undefined {
	const solana = network ? SVM_EXPLORERS[network] : undefined
	if (solana) {
		// The cluster rides in the query string, so the path goes before it.
		const [base, cluster] = solana.split('?')
		return cluster ? `${base}/tx/${hash}?${cluster}` : `${base}/tx/${hash}`
	}
	const base = CHAINS[chainId]?.blockExplorerUrls[0]
	return base ? `${base}/tx/${hash}` : undefined
}

/** "sepolia.basescan.org": names the destination before the payer clicks. */
export function explorerHost (chainId: number, network?: string): string | undefined {
	const base = (network ? SVM_EXPLORERS[network] : undefined)
		?? CHAINS[chainId]?.blockExplorerUrls[0]
	if (!base) {
		return undefined
	}
	try {
		return new URL(base).hostname.replace(/^www\./, '')
	} catch {
		return undefined
	}
}

export function chainMetadata (chainId: number): ChainMetadata | undefined {
	return CHAINS[chainId]
}
