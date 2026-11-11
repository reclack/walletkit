import { readEvmBalance, readSvmBalance, type Asset, type Balance } from './balance.js'
import { fetchWalletCatalog, walletCatalogUrl } from './catalog-fetch.js'
import {
	DEFAULT_API_URL,
	DEFAULT_SVM_RPC_URL,
	DEFAULT_WALLETCONNECT_PROJECT_ID,
	defaultRpcUrl,
} from './config.js'
import type { WalletEntry } from './catalog.js'
import { subscribeHandheld } from './device.js'
import { DEFAULT_LOGO_BASE } from './icons.js'
import {
	resolveScheme,
	subscribeScheme,
	themeVariables,
	type ColorScheme,
	type WalletKitTheme,
} from './theme.js'
import {
	connectEvmWallet,
	discoverEvmWallets,
	switchEvmChain,
} from './evm.js'
import { walletErrorMessage } from './errors.js'
import { connectSvmWallet, disconnectSvmWallet, discoverSvmWallets } from './svm.js'
import type { ConnectRequest, ConnectResult } from './intent.js'
import type {
	ChainFamily,
	ConnectedEvmWallet,
	ConnectedSvmWallet,
	DetectedEvmWallet,
	DetectedSvmWallet,
} from './types.js'
import {
	openWalletConnectSession,
	walletConnectReady,
	type WalletConnectOptions,
} from './walletconnect.js'

export interface EvmState {
	available: DetectedEvmWallet[]
	connected?: ConnectedEvmWallet
	connecting: boolean
	switchingChain: boolean
	error: string
}

export interface SvmState {
	available: DetectedSvmWallet[]
	connected?: ConnectedSvmWallet
	connecting: boolean
	error: string
}

export interface WalletKitState {
	catalog: WalletEntry[]
	/** False until the catalogue has been asked for and answered, or failed. */
	catalogLoaded: boolean
	handheld: boolean
	/** Where the wallet artwork is served from. */
	assetBase: string
	/**
	 * The theme as the host set it, not as it resolved.
	 *
	 * Carried so a picker that was given no theme of its own can wear the
	 * one the page is wearing. A branded checkout sets it once, on the kit,
	 * and every picker on the page follows.
	 */
	theme?: WalletKitTheme
	/** What the theme's mode resolved to, following the system when it says so. */
	scheme: ColorScheme
	/** The theme as custom properties, ready to set on an element. */
	variables: Record<string, string>
	evm: EvmState
	svm: SvmState
}

/**
 * Every option is an override, and a kit created with none of them works.
 *
 * What the kit needs to run is Reclack's own infrastructure, so it ships with
 * it rather than asking each host to supply what it could not know. See
 * config.ts. These exist for a sandbox, a private endpoint, or a partner
 * running the kit under its own name.
 */
export interface WalletKitOptions {
	/** A different Reclack to talk to, such as a sandbox. */
	apiUrl?: string
	/**
	 * The catalogue outright, skipping the round trip. What a host that
	 * renders on a server passes, having already fetched it there.
	 */
	catalog?: WalletEntry[]
	/** A different relay project, or different metadata on the approval screen. */
	walletConnect?: WalletConnectOptions
	/**
	 * Where the host serves this package's `assets/` directory from.
	 *
	 * Served by the host rather than fetched from ours, so a page taking a
	 * payment still makes no third-party image request. A wallet's own
	 * EIP-6963 icon wins over these anyway, so getting it wrong costs the
	 * artwork of wallets that are not installed, not the ability to pay.
	 */
	assetBase?: string
	/**
	 * Colours, corner radius, type and light or dark.
	 *
	 * Held here rather than passed to a renderer so that the resolved mode is
	 * part of the state every framework is already subscribed to: when the
	 * reader's system flips to dark, the picker follows without the host
	 * wiring up a second listener.
	 */
	theme?: WalletKitTheme
	/**
	 * Read endpoints per EVM chain id, and one for Solana, for balances.
	 *
	 * The pinned public endpoints are used for any chain not named here.
	 * Worth overriding for anything heavier than a balance or two: they are
	 * shared and rate-limited.
	 */
	rpcUrls?: Record<number, string>
	svmRpcUrl?: string
}

export interface WalletKit {
	getState(): WalletKitState
	/** Calls back on every change. Returns the unsubscribe. */
	subscribe(listener: () => void): () => void
	connectEvm(wallet: DetectedEvmWallet): Promise<void>
	connectSvm(wallet: DetectedSvmWallet): Promise<void>
	/** Pairs with a wallet that injects nothing. `onUri` fires before approval. */
	connectRemote(
		wallet: { id: string; name: string },
		chainId: number,
		onUri: (uri: string) => void,
	): Promise<void>
	disconnect(family?: ChainFamily): void
	ensureChain(chainId: number): Promise<boolean>
	/** Changes the theme after the fact, such as when a merchant's branding lands. */
	setTheme(theme: WalletKitTheme | undefined): void
	/** Whether this kit can offer WalletConnect at all. */
	canPairRemotely(): boolean
	/** Reads balances for an already-connected wallet. */
	readBalances(family: ChainFamily, assets: Asset[]): Promise<Balance[]>
	/** Shapes a connected wallet into what a caller's intent asked for. */
	resolveIntent(family: ChainFamily, request: ConnectRequest): Promise<ConnectResult>
	destroy(): void
}

/**
 * Everything a page needs to connect a wallet, with nothing on screen.
 *
 * A store with `getState` and `subscribe` rather than a hook, because this
 * package renders nothing and belongs to no framework. That pair is the one
 * shape every framework can consume: React reads it with useSyncExternalStore,
 * Vue with a shallowRef, Svelte with a store contract, and plain JavaScript by
 * calling it. A hook would have picked React for everybody.
 *
 * Nothing touches the window until the first subscriber arrives, so importing
 * this on a server is safe and a host that renders on one does not have to
 * guard every call site.
 */
export function createWalletKit (options: WalletKitOptions = {}): WalletKit {
	const initialScheme = resolveScheme(options.theme?.mode)

	let state: WalletKitState = {
		catalog: options.catalog ?? [],
		catalogLoaded: Boolean(options.catalog),
		handheld: false,
		assetBase: options.assetBase ?? DEFAULT_LOGO_BASE,
		// Resolved up front rather than deferred to the first subscriber. An
		// explicit mode needs no window to resolve, and a kit read before
		// anything subscribes, which is every server render, would otherwise
		// report light while the host had asked for dark. `system` still
		// falls back to light where there is no window to ask.
		theme: options.theme,
		scheme: initialScheme,
		variables: themeVariables(options.theme, initialScheme),
		evm: {
			available: [],
			connecting: false,
			switchingChain: false,
			error: '',
		},
		svm: { available: [], connecting: false, error: '' },
	}

	const listeners = new Set<() => void>()
	const cleanups: Array<() => void> = []
	let theme = options.theme
	let stopScheme: (() => void) | undefined
	let started = false
	let destroyed = false
	// How to end a WalletConnect session, when the connection is one.
	let closeRemote: (() => Promise<void>) | undefined

	// One object replaced wholesale rather than mutated. Callers compare the
	// reference to decide whether to re-render, and a mutated object is the
	// same reference, so the render never happens.
	function set (patch: Partial<WalletKitState>) {
		if (destroyed) {
			return
		}
		state = { ...state, ...patch }
		for (const listener of listeners) {
			listener()
		}
	}

	function setEvm (patch: Partial<EvmState>) {
		set({ evm: { ...state.evm, ...patch } })
	}

	function setSvm (patch: Partial<SvmState>) {
		set({ svm: { ...state.svm, ...patch } })
	}

	/**
	 * Begins discovery, once, when somebody is listening.
	 *
	 * Discovery is re-run when the catalogue lands: a wallet that announces
	 * itself is found without it, but one that only injects a global is found
	 * by a rule the catalogue carries, so the list is incomplete until then.
	 */
	function start () {
		if (started || typeof window === 'undefined') {
			return
		}
		started = true

		cleanups.push(subscribeHandheld((handheld) => set({ handheld })))
		watchScheme()
		restartDiscovery()

		if (!state.catalogLoaded) {
			const url = walletCatalogUrl(options.apiUrl ?? DEFAULT_API_URL)
			void fetchWalletCatalog(url).then((catalog) => {
				if (destroyed) {
					return
				}
				set({ catalog, catalogLoaded: true })
				restartDiscovery()
			})
		}
	}

	function watchScheme () {
		stopScheme?.()
		stopScheme = subscribeScheme(theme?.mode, (scheme) => {
			set({ theme, scheme, variables: themeVariables(theme, scheme) })
		})
	}

	let stopDiscovery: Array<() => void> = []

	function restartDiscovery () {
		for (const stop of stopDiscovery) {
			stop()
		}
		stopDiscovery = [
			discoverEvmWallets(state.catalog, (available) => setEvm({ available })),
			discoverSvmWallets(state.catalog, (available) => setSvm({ available })),
		]
	}

	// The payer can switch account or network in the wallet at any time, and
	// the page has to follow: showing one address while asking somebody to
	// sign from another is how money goes to the wrong place.
	let unwatch: (() => void) | undefined

	function watchEvm (connected: ConnectedEvmWallet | undefined) {
		unwatch?.()
		unwatch = undefined
		const provider = connected?.provider
		if (!provider?.on || !provider.removeListener) {
			return
		}
		const onAccounts = (...args: unknown[]) => {
			const accounts = args[0]
			const next = Array.isArray(accounts) ? accounts[0] : undefined
			if (typeof next !== 'string') {
				setEvm({ connected: undefined })
				return
			}
			setEvm({
				connected: state.evm.connected
					? { ...state.evm.connected, address: next }
					: undefined,
			})
		}
		const onChain = (...args: unknown[]) => {
			const raw = args[0]
			const chainId =
				typeof raw === 'string' ? Number.parseInt(raw, 16) : Number(raw)
			setEvm({
				connected: state.evm.connected
					? { ...state.evm.connected, chainId }
					: undefined,
			})
		}
		provider.on('accountsChanged', onAccounts)
		provider.on('chainChanged', onChain)
		unwatch = () => {
			provider.removeListener?.('accountsChanged', onAccounts)
			provider.removeListener?.('chainChanged', onChain)
		}
	}

	/** The host's endpoint for a chain, or the pinned public one. */
	function rpcFor (chainId: number): string | undefined {
		return options.rpcUrls?.[chainId] ?? defaultRpcUrl(chainId)
	}

	function walletConnectOptions (): WalletConnectOptions {
		return (
			options.walletConnect
			?? { projectId: DEFAULT_WALLETCONNECT_PROJECT_ID }
		)
	}

	const kit: WalletKit = {
		getState: () => state,

		subscribe (listener) {
			listeners.add(listener)
			start()
			return () => {
				listeners.delete(listener)
			}
		},

		async connectEvm (wallet) {
			setEvm({ connecting: true, error: '' })
			try {
				const connected = await connectEvmWallet(wallet)
				setEvm({ connected })
				watchEvm(connected)
			} catch (error) {
				setEvm({
					error: walletErrorMessage(error, 'Could not connect to your wallet.'),
				})
			} finally {
				setEvm({ connecting: false })
			}
		},

		async connectSvm (wallet) {
			setSvm({ connecting: true, error: '' })
			try {
				const { address, account } = await connectSvmWallet(wallet)
				setSvm({
					connected: {
						walletId: wallet.id,
						name: wallet.name,
						icon: wallet.icon,
						address,
						account,
						standard: wallet.standard,
						provider: wallet.provider,
					},
				})
			} catch (error) {
				setSvm({
					error: walletErrorMessage(error, 'Could not connect to your wallet.'),
				})
			} finally {
				setSvm({ connecting: false })
			}
		},

		async connectRemote (wallet, chainId, onUri) {
			setEvm({ connecting: true, error: '' })
			try {
				const session = await openWalletConnectSession(
					walletConnectOptions(),
					chainId,
					onUri,
				)
				closeRemote = session.close
				const connected: ConnectedEvmWallet = {
					walletId: wallet.id,
					name: wallet.name,
					address: session.address,
					chainId: session.chainId,
					provider: session.provider,
				}
				setEvm({ connected })
				watchEvm(connected)
			} catch (error) {
				setEvm({
					error: walletErrorMessage(error, 'Could not connect to your wallet.'),
				})
			} finally {
				setEvm({ connecting: false })
			}
		},

		disconnect (family) {
			if (family !== 'svm') {
				// A page cannot revoke an extension's permission; that only
				// clears this side. A WalletConnect session is ours to end,
				// though, and leaving it open would have the wallet showing
				// this page as connected long after everyone has gone.
				void closeRemote?.()
				closeRemote = undefined
				unwatch?.()
				unwatch = undefined
				setEvm({ connected: undefined, error: '' })
			}
			if (family !== 'evm') {
				// Asked of the wallet as well, unlike the EVM side, because
				// Solana wallets do expose it. Best effort: this side has let
				// go either way.
				if (state.svm.connected) {
					void disconnectSvmWallet(state.svm.connected).catch(() => undefined)
				}
				setSvm({ connected: undefined, error: '' })
			}
		},

		async ensureChain (chainId) {
			const connected = state.evm.connected
			if (!connected) {
				return false
			}
			if (connected.chainId === chainId) {
				return true
			}
			setEvm({ error: '', switchingChain: true })
			try {
				// May prompt twice: once to add the network, once to select
				// it, so the caller stays pending throughout.
				await switchEvmChain(connected.provider, chainId)
				return true
			} catch (error) {
				setEvm({ error: walletErrorMessage(error, 'Could not switch network.') })
				return false
			} finally {
				setEvm({ switchingChain: false })
			}
		},

		setTheme (next) {
			theme = next
			if (started) {
				// Re-subscribed rather than recomputed: the mode may have
				// moved to or from `system`, which changes whether the
				// reader's own setting is being followed at all.
				watchScheme()
				return
			}
			// Nobody is listening yet, so there is nothing to follow; the
			// mode still has to be resolved again, because it may have
			// changed.
			const scheme = resolveScheme(theme?.mode)
			set({ theme, scheme, variables: themeVariables(theme, scheme) })
		},

		canPairRemotely: () => walletConnectReady(walletConnectOptions()),

		async readBalances (family, assets) {
			const connected =
				family === 'evm' ? state.evm.connected : state.svm.connected
			if (!connected) {
				throw new Error('No wallet is connected.')
			}
			return Promise.all(
				assets.map(async (asset) => {
					if (asset.family === 'svm') {
						return readSvmBalance(
							options.svmRpcUrl ?? DEFAULT_SVM_RPC_URL,
							asset,
							connected.address,
						)
					}
					// The endpoint when there is one, so reading a balance
					// never drags a wallet onto another network. The wallet's
					// own provider otherwise, which is the pre-flight case and
					// does require it to be on that chain already.
					const url = rpcFor(asset.chainId)
					const source = url
						? { rpcUrl: url }
						: { provider: (connected as ConnectedEvmWallet).provider }
					return readEvmBalance(source, asset, connected.address)
				}),
			)
		},

		async resolveIntent (family, request) {
			// The request is checked before the connection, because an
			// intent that asks for a balance of nothing is a mistake in the
			// caller rather than a state somebody can get out of by
			// connecting a wallet, and it should fail the same way either
			// way.
			if (request.intent.includes('balance') && !request.assets?.length) {
				throw new Error("intent 'balance' needs at least one asset.")
			}
			const connected =
				family === 'evm' ? state.evm.connected : state.svm.connected
			if (!connected) {
				throw new Error('No wallet is connected.')
			}

			const evm = family === 'evm' ? (connected as ConnectedEvmWallet) : undefined
			const result: ConnectResult = {
				walletId: connected.walletId,
				name: connected.name,
				icon: connected.icon,
				family,
				address: connected.address,
				chainId: evm?.chainId,
			}
			if (request.intent.includes('balance')) {
				result.balances = await kit.readBalances(family, request.assets ?? [])
			}
			if (request.keepAlive && evm) {
				result.provider = evm.provider
			}
			return result
		},

		destroy () {
			destroyed = true
			for (const stop of [...stopDiscovery, ...cleanups]) {
				stop()
			}
			stopDiscovery = []
			stopScheme?.()
			unwatch?.()
			void closeRemote?.()
			listeners.clear()
		},
	}

	return kit
}
