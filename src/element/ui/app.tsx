import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { AssetProvider } from './assets.js'
import { useHandheld } from './use-handheld.js'
import { WalletDialog } from './wallet-dialog.js'
import { WalletList } from './wallet-list.js'
import {
	walletDeepLink,
	walletsFor,
	walletScans,
	type ChainFamily,
	type ConnectRequest,
	type ConnectResult,
	type DetectedEvmWallet,
	type DetectedSvmWallet,
	type WalletKit,
	type WalletKitState,
	type WalletOption,
} from '@reclack/walletkit'

/**
 * One wallet in the picker, whichever family it signs for.
 *
 * The two families have different providers and different connect calls but
 * the same job on screen, so the list is typed against this and the family
 * travels with the row rather than with the list. That is what lets a picker
 * given no family offer both at once, which is what "connect a wallet" means
 * to somebody who has not been told there are two kinds.
 */
/**
 * The chain a pairing proposes when the caller named none.
 *
 * Relay wallets need one to open a session with. Mainnet is the one every
 * wallet has, and nothing is switched to it: a request without a `chainId`
 * is a request that does not want a chain enforced at all.
 */
const PAIRING_CHAIN = 1

interface Entry {
	id: string
	name: string
	icon?: string
	family: ChainFamily
	evm?: DetectedEvmWallet
	svm?: DetectedSvmWallet
}

function useKit (kit: WalletKit): WalletKitState {
	const [state, setState] = useState(kit.getState)
	useEffect(() => {
		// Read once up front, not only on the next notification. A kit
		// handed over after mount has a state already, and subscribing alone
		// does not deliver it: the picker went on showing the empty state of
		// the kit it had a moment ago, until something unrelated happened to
		// notify. Opened, closed and opened again, nothing did, and the list
		// stayed empty until the page was reloaded.
		setState(kit.getState())
		return kit.subscribe(() => setState(kit.getState()))
	}, [kit])
	return state
}

/**
 * Where the picker sits.
 *
 * `inline` is the short list a checkout puts on the page, with the full
 * catalogue folded behind one row. `modal` is the whole picker over the page,
 * which is what a button marked "Connect wallet" opens.
 *
 * A modal here rather than a host wrapping the inline list in one: the dialog
 * is a native `<dialog>`, so focus trapping, Esc, an inert background and a
 * backdrop come from the platform rather than from a focus-trap library
 * shipped on a page that takes payments.
 */
export type Variant = 'inline' | 'modal'

export function ConnectApp ({
	kit,
	request,
	variant,
	onResult,
	onError,
	onClose,
}: {
	kit: WalletKit
	request: ConnectRequest
	variant: Variant
	onResult: (result: ConnectResult) => void
	onError: (message: string) => void
	onClose: () => void
}) {
	const state = useKit(kit)
	const handheld = useHandheld()
	/**
	 * A connection has happened and a result is on its way.
	 *
	 * The dialog closes itself once a wallet is connected, which is correct:
	 * its job is done. But a close is also how somebody dismisses it, and the
	 * two arrive through the same callback. Reported as a cancellation, the
	 * first one tore the picker down before the address it had just read
	 * could be handed back, and the field stayed empty.
	 */
	const settling = useRef(false)
	// Which family was last picked, so the result is resolved against the one
	// that actually connected rather than the one the caller guessed at.
	const [picked, setPicked] = useState<ChainFamily | undefined>()

	// Both families unless the caller named one. A form collecting a
	// settlement address has to name one, because the address formats differ;
	// a checkout offering either should not.
	const families: ChainFamily[] = request.family
		? [request.family]
		: ['evm', 'svm']

	const wallets = useMemo<Entry[]>(() => {
		const entries: Entry[] = []
		// By name as well as by id. One wallet announces itself under more
		// than one reverse-DNS id, and a browser build may announce under one
		// this catalogue has never heard of; both arrive as separate entries
		// with the same name on them. Listing a wallet twice makes somebody
		// wonder which of the two is theirs.
		const taken = new Set<string>()
		const add = (entry: Entry) => {
			const key = entry.name.trim().toLowerCase()
			if (taken.has(entry.id) || taken.has(key)) {
				return
			}
			taken.add(entry.id)
			taken.add(key)
			entries.push(entry)
		}
		if (families.includes('evm')) {
			for (const wallet of state.evm.available) {
				add({ ...wallet, family: 'evm', evm: wallet })
			}
		}
		if (families.includes('svm')) {
			// A wallet that signs for both announces itself twice, and the
			// first listing wins: it keeps whichever family the caller put
			// first.
			for (const wallet of state.svm.available) {
				add({ ...wallet, family: 'svm', svm: wallet })
			}
		}
		return entries
	}, [state.evm.available, state.svm.available, request.family])

	const registry = useMemo<WalletOption[]>(() => {
		const seen = new Set<string>()
		const options: WalletOption[] = []
		for (const family of families) {
			for (const wallet of walletsFor(state.catalog, family)) {
				if (!seen.has(wallet.id)) {
					seen.add(wallet.id)
					options.push(wallet)
				}
			}
		}

		// A catalogue row for a wallet that is sitting right there, detected
		// under an id this catalogue does not list, is the same wallet twice:
		// once as "installed" and once as something to go and get. The row
		// that matched keeps its place; the one that did not is dropped.
		const detectedIds = new Set(wallets.map((wallet) => wallet.id))
		const detectedNames = new Set(
			wallets.map((wallet) => wallet.name.trim().toLowerCase()),
		)
		return options.filter((option) =>
			detectedIds.has(option.id)
			|| !detectedNames.has(option.name.trim().toLowerCase()))
	}, [state.catalog, request.family, wallets])

	const connecting = state.evm.connecting || state.svm.connecting
	const error = picked === 'svm' ? state.svm.error : state.evm.error

	const onSelect = useCallback((entry: Entry) => {
		setPicked(entry.family)
		if (entry.evm) {
			void kit.connectEvm(entry.evm)
			return
		}
		if (entry.svm) {
			void kit.connectSvm(entry.svm)
		}
	}, [kit])

	/**
	 * Pairs with a wallet that puts nothing in the page, over a relay.
	 *
	 * Second choice, not first. A wallet we hold a link into is sent the page
	 * itself, by a code or a link, and signs there like any other: that is
	 * the flow somebody already knows, it needs no relay, and it keeps the
	 * payment on this page rather than in a session.
	 *
	 * So the question is one question on both devices: do we hold a link that
	 * lands this page inside the wallet? On a phone that link is pressed; on
	 * a desktop it is what the code carries to the phone.
	 *
	 * What the wallet injects is not part of it. That question belongs to the
	 * browser the payer is standing in and has already been answered there:
	 * the extension is not in this page, or they would be connected by now.
	 * Asking it again sent every wallet with an extension and an app on the
	 * payer's phone, which is most of the list, to a code for a browser that
	 * cannot see it.
	 *
	 * One difference between the devices, and it is about the code rather
	 * than the wallet: on a desktop a pairing code can only be scanned, so a
	 * wallet with no phone application to scan it is offered nothing. On a
	 * phone the same code can be pasted, which is worth offering even then.
	 *
	 * Asked per wallet rather than given as a list, because only the picker
	 * knows which family is on screen and which chain a pairing is for.
	 */
	const remotePairing = useCallback((walletId: string) => {
		if (!kit.canPairRemotely()) {
			return undefined
		}
		// Solana has no relay path here: WalletConnect's provider is an
		// EIP-1193 one, and a Solana wallet does not speak it.
		if (families.length === 1 && families[0] === 'svm') {
			return undefined
		}
		const definition = registry.find((wallet) => wallet.id === walletId)
		if (!definition) {
			return undefined
		}
		if (walletDeepLink(definition.id, window.location.href)) {
			return undefined
		}
		if (!handheld && !walletScans(definition.id)) {
			return undefined
		}
		return (onUri: (uri: string) => void) => {
			setPicked('evm')
			// A session has to propose a chain, but the caller may not have
			// named one: a form collecting a settlement address does not
			// care, because the address is the same on all of them. Ethereum
			// stands in there, and nothing is ever switched to it, since
			// `chainId` being absent is also what skips the switch.
			void kit.connectRemote(definition, request.chainId ?? PAIRING_CHAIN, onUri)
		}
	}, [kit, handheld, registry, request.chainId, request.family])

	// The connection is done; now shape it into whatever the caller asked for.
	// Run as an effect rather than from the click, because a wallet connects
	// whenever the payer approves it, which may be long after and may be from
	// a session restored on another device.
	const connected = picked === 'svm' ? state.svm.connected : state.evm.connected

	// Worked out while rendering, not in an effect, and that is the point.
	// The dialog is a child, so its effects run before this component's: by
	// the time an effect here could raise the flag, the dialog has already
	// reported its own close and the picker has been torn down. The render
	// that first sees a connection is the one that must already know.
	if (picked && connected) {
		settling.current = true
	}

	useEffect(() => {
		if (!picked || !connected) {
			return
		}
		let live = true
		void (async () => {
			try {
				// The chain is enforced only when the caller named one. A form
				// collecting an address should not: the same address receives
				// on every EVM chain.
				if (picked === 'evm' && request.chainId !== undefined) {
					if (!(await kit.ensureChain(request.chainId))) {
						// Declined, or the wallet refused. The dialog has
						// already closed itself on the connection, so saying
						// nothing here would leave the caller waiting on a
						// picker it can no longer see.
						settling.current = false
						if (live) {
							onError(
								kit.getState().evm.error
								|| 'The wallet stayed on another network.',
							)
						}
						return
					}
				}
				const result = await kit.resolveIntent(picked, request)
				if (!live) {
					return
				}
				// Nothing is held open unless the caller said to. A form that
				// wanted a value is done, and a session left live would have
				// the wallet showing this page as connected afterwards.
				if (!request.keepAlive) {
					kit.disconnect(picked)
				}
				onResult(result)
			} catch (failure) {
				if (live) {
					onError(
						failure instanceof Error
							? failure.message
							: 'Could not read the wallet.',
					)
				}
			}
		})()
		return () => {
			live = false
		}
	}, [picked, connected?.address, connected?.walletId])

	if (variant === 'modal') {
		return (
			<AssetProvider base={state.assetBase}>
			<WalletDialog
				open
				wallets={wallets}
				registry={registry}
				connecting={connecting}
				connected={Boolean(connected)}
				error={error}
				remotePairing={remotePairing}
				onSelect={onSelect}
				// Not every close is a dismissal: see `settling`.
				onClose={() => {
					if (!settling.current) {
						onClose()
					}
				}}
			/>
			</AssetProvider>
		)
	}

	return (
		<AssetProvider base={state.assetBase}>
		<WalletList
			wallets={wallets}
			registry={registry}
			connecting={connecting}
			connected={Boolean(connected)}
			error={error}
			remotePairing={remotePairing}
			onSelect={onSelect}
		/>
		</AssetProvider>
	)
}
