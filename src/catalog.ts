import type { ChainFamily, Eip1193Provider, WalletOption } from './types.js'

/**
 * One chain engine a wallet signs for, and how to recognise it there.
 *
 * Every field below `id` is a parameter to a check this file already knows
 * how to run, and all are optional: a wallet that announces itself needs none
 * of them. Nothing here is executable, because reading a path off `window` is
 * not something a configuration row can do.
 *
 * An engine a wallet does not sign for is simply absent, which is why this is
 * a list and there is no separate set of names beside it: the engine's own id
 * says which family it serves, and two facts could disagree.
 */
export interface WalletEngine {
	/** The engine, which is also the chain family it serves. */
	id: ChainFamily
	/**
	 * The reverse-DNS ids a wallet announces itself under, over EIP-6963.
	 *
	 * Several, because one wallet is several builds: MetaMask's extension,
	 * its phone browser and Flask each announce their own.
	 */
	rdns?: string[]
	/** Paths into `window` to try in order, such as ["phantom","ethereum"]. */
	globals?: string[][]
	/** Properties identifying an injected provider; ANY is a match. */
	flags?: string[]
	/** Properties that rule one out: several wallets set another's flag. */
	not_flags?: string[]
}

/** One wallet Reclack can name, as the API describes it. */
export interface WalletEntry extends WalletOption {
	engines: WalletEngine[]
}

/** How to recognise a wallet on one engine, or nothing if it does not sign there. */
export function engineOf (
	wallet: WalletEntry,
	engine: ChainFamily,
): WalletEngine | undefined {
	return wallet.engines?.find((entry) => entry.id === engine)
}

/**
 * The wallets to offer for an engine, in the order the API listed them.
 *
 * Order is the API's so the list is stable rather than dependent on which
 * wallet answered first, which is the same reason it used to be a literal
 * here.
 */
export function walletsFor (
	catalog: WalletEntry[],
	engine: ChainFamily,
): WalletEntry[] {
	return catalog.filter((wallet) => Boolean(engineOf(wallet, engine)))
}

type InjectedFlags = Record<string, unknown> & {
	providers?: Eip1193Provider[]
}

/** Follows a path into the window, returning whatever provider is there. */
function atPath (win: Window, path: string[]): unknown {
	let current: unknown = win
	for (const key of path) {
		if (!current || typeof current !== 'object') {
			return undefined
		}
		current = (current as Record<string, unknown>)[key]
	}
	return current
}

/** Whether a provider carries a flag that rules this wallet out. */
function impostor (provider: unknown, detection: WalletEngine): boolean {
	const flags = provider as Record<string, unknown>
	return Boolean(detection.not_flags?.some((flag) => Boolean(flags[flag])))
}

/**
 * Finds a provider among the several a browser may have injected.
 *
 * Several wallets installed at once expose a `providers` array; the bare
 * object is whichever one won the global.
 */
function matchInjected (
	win: Window,
	detection: WalletEngine,
): unknown {
	if (!detection.flags?.length) {
		return undefined
	}
	const root = (win as unknown as { ethereum?: InjectedFlags }).ethereum
	if (!root) {
		return undefined
	}
	const candidates: InjectedFlags[] = Array.isArray(root.providers)
		? (root.providers as unknown as InjectedFlags[])
		: [root]
	return candidates.find((provider) => {
		// Any flag is a match: a wallet may set more than one across
		// versions. None of the exclusions may be set, because a flag alone
		// names the wrong wallet when another sets it on purpose.
		const claims = detection.flags?.some((flag) => Boolean(provider[flag]))
		return Boolean(claims) && !impostor(provider, detection)
	})
}

/**
 * Runs a wallet's detection against this window.
 *
 * Globals first, each one being that wallet's own namespace, then the flags
 * on whatever claimed `window.ethereum`. Never the generic global by itself:
 * it belongs to whichever extension got there, and trusting it names the
 * wrong wallet.
 *
 * A namespace is checked against the exclusions too, not only the flags. One
 * wallet injects another's namespace as a compatibility shim, so finding
 * window.phantom is not proof that Phantom is installed.
 */
export function detect (
	win: Window,
	detection: WalletEngine | undefined,
): unknown {
	if (!detection) {
		return undefined
	}
	for (const path of detection.globals ?? []) {
		const found = atPath(win, path)
		if (found && typeof found === 'object' && !impostor(found, detection)) {
			return found
		}
	}
	return matchInjected(win, detection)
}
