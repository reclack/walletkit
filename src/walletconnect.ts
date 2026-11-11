import { WalletError } from "./errors.js"
import type { Eip1193Provider } from "./types.js"

/**
 * Connecting a wallet that puts nothing into the page.
 *
 * Safe, Kraken, BitPay, Bitcoin.com and Blockchain.com inject no provider and
 * have no dapp browser to open this page in. They reach an app over
 * WalletConnect instead: the page and the wallet pass messages through a
 * relay, paired by a code the payer scans or a link their phone opens, and
 * the payment is approved in the wallet.
 *
 * The SDK is loaded only when one of those is chosen. It is far larger than
 * the rest of this checkout put together, and a payer using an extension
 * should never pay for bytes they do not use.
 *
 * What comes back is an ordinary EIP-1193 provider, so everything after the
 * connection, signing, switching network, watching for an account change,
 * is the same code that serves an injected wallet.
 */

/**
 * What the wallet prints on its approval screen.
 *
 * Reclack's own by default, branded checkout or not: this names who the
 * session is with, and the session is with Reclack. A host that is not
 * Reclack, a partner embedding this kit, passes its own.
 *
 * The icon was once the USDC mark, which is why a payer approving in Binance
 * was shown a dollar coin above our name: the wallet draws exactly what it is
 * sent. A PNG comes first and the SVG behind it, because wallets take the
 * first icon they can decode and a wallet application draws these with the
 * platform's own image loader rather than a browser, which is not always told
 * about SVG.
 */
export interface SessionMetadata {
	name: string
	description: string
	url: string
	icons: string[]
}

/**
 * Where the pairing is made, and what the wallet is told about who is asking.
 *
 * The project id is public by design: it identifies the page to the relay and
 * carries no authority. It is an option rather than an environment variable
 * because this package is built once and run by several hosts, each with its
 * own. Without one, WalletConnect is simply not offered.
 */
export interface WalletConnectOptions {
	projectId: string
	metadata?: SessionMetadata
}

/** Reclack's own session metadata, derived from wherever this is served. */
export function defaultMetadata(): SessionMetadata {
	// The frame's origin, not the page's, when this runs embedded. That is
	// correct: the icons have to be fetchable, and only this origin is known
	// to serve them.
	const origin = typeof window === "undefined" ? "" : window.location.origin
	return {
		name: "Reclack",
		description: "Pay using stablecoins",
		url: origin,
		icons: [`${origin}/apple-touch-icon.png`, `${origin}/favicon.svg`],
	}
}

/**
 * How long to wait for the relay before giving up on it.
 *
 * Neither of the two waits below is the payer's. Reaching the relay and being
 * handed a pairing code happen before anybody is asked to do anything, so a
 * relay that never answers is a failure, not somebody taking their time.
 * Approving in the wallet is the payer's wait and is never timed.
 *
 * Unbounded, this was a spinner that never stopped: a project id the relay
 * refuses, or a blocked WebSocket, and the panel sat on "Preparing a
 * connection..." with nothing to press.
 */
const RELAY_TIMEOUT = 12_000

/** Rejects if `work` has not settled in time, leaving `work` to its fate. */
function within<T> (work: Promise<T>, ms: number, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const limit = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new WalletError(message)), ms)
	})
	return Promise.race([work, limit]).finally(() => clearTimeout(timer))
}

/** Whether a host has given this kit what a session needs. */
export function walletConnectReady(options: WalletConnectOptions | undefined): boolean {
	return Boolean(options?.projectId?.trim())
}

export interface RemoteSession {
	provider: Eip1193Provider
	address: string
	chainId: number
	/** Ends the session. A pairing the payer walked away from must not linger. */
	close: () => Promise<void>
}

/**
 * Pairs with a wallet and waits for the payer to approve.
 *
 * `onUri` is called once with the pairing string, which is what the code and
 * the link are made of. It arrives before the payer has done anything, so the
 * caller can show it while this promise is still pending.
 *
 * The chain is optional rather than required. A wallet that does not have it
 * would otherwise refuse the pairing outright, which reads as "this wallet is
 * broken"; connecting first and asking it to switch afterwards is the same
 * path an injected wallet on the wrong network already takes.
 */
export async function openWalletConnectSession(
	options: WalletConnectOptions,
	chainId: number,
	onUri: (uri: string) => void,
): Promise<RemoteSession> {
	if (!walletConnectReady(options)) {
		throw new Error("WalletConnect is not configured for this checkout.")
	}

	const { EthereumProvider } = await import("@walletconnect/ethereum-provider")
	// Bounded: init opens the relay socket, and a socket that cannot be
	// opened leaves this pending rather than throwing.
	const provider = await within(
		EthereumProvider.init({
		projectId: options.projectId.trim(),
		optionalChains: [chainId],
		// Our own code and our own panel. The bundled modal would be a second
		// design to keep in step with this one, and it is most of the weight.
		showQrModal: false,
		// What the wallet prints on the approval screen. See SessionMetadata.
			metadata: options.metadata ?? defaultMetadata(),
		}),
		RELAY_TIMEOUT,
		"Could not reach the connection service. Check your network and try again.",
	)

	const close = async () => {
		try {
			await provider.disconnect()
		} catch {
			// Already gone, or the relay is unreachable. Nothing to undo.
		}
	}

	// A session the browser still holds from a previous visit. Reusing it
	// saves the payer scanning anything, which is the whole point of the
	// wallet having remembered it.
	if (provider.session && provider.accounts.length > 0) {
		return {
			provider: provider as unknown as Eip1193Provider,
			address: provider.accounts[0],
			chainId: provider.chainId,
			close,
		}
	}

	// Two waits, and only the first is bounded. The code has to arrive before
	// anybody can scan it; what happens after is the payer deciding, and a
	// wallet may sit on that for as long as they like.
	let issued = false
	const handleUri = (uri: string) => {
		issued = true
		onUri(uri)
	}
	provider.on("display_uri", handleUri)

	const approved = provider.connect()
	// Nothing rethrows this on its own: it is raced below, and an unhandled
	// rejection here would be reported before the race reports it.
	approved.catch(() => undefined)

	let watchdog: ReturnType<typeof setTimeout> | undefined
	try {
		await Promise.race([
			approved,
			new Promise<never>((_, reject) => {
				watchdog = setTimeout(() => {
					if (!issued) {
						reject(new WalletError(
							"The connection code did not arrive. Try again.",
						))
					}
				}, RELAY_TIMEOUT)
			}),
		])
	} catch (failure) {
		await close()
		throw failure
	} finally {
		clearTimeout(watchdog)
		provider.removeListener("display_uri", handleUri)
	}

	const address = provider.accounts[0]
	if (!address) {
		await close()
		throw new Error("No account was shared by the wallet.")
	}
	return {
		provider: provider as unknown as Eip1193Provider,
		address,
		chainId: provider.chainId,
		close,
	}
}
