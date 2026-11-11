import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { WalletConnectPanel } from './wallet-connect-panel.js'
import { useHandheld } from './use-handheld.js'
import { WalletMark } from './wallet-mark.js'
import type { WalletChoice, WalletOption } from '@reclack/walletkit'

/** How many wallets the front door lists before the search row. */
const TOP_WALLETS = 5

interface Entry<T extends WalletChoice> {
	id: string
	name: string
	icon?: string
	detected?: T
	installUrl?: string
}

/**
 * The full wallet picker.
 *
 * Built on the native <dialog>: showModal() gives focus trapping, Esc to close,
 * an inert background and a backdrop for free. A checkout should not ship a
 * focus-trap library to reimplement what the platform already does correctly.
 */
export function WalletDialog<T extends WalletChoice> ({
	open,
	wallets,
	registry = [],
	connecting,
	connected,
	error,
	initialWalletId,
	remotePairing,
	onSelect,
	onClose,
}: {
	open: boolean
	wallets: T[]
	/**
	 * The wallets that exist, installed or not, so one that is missing can
	 * still be found and installed. Empty when the catalogue has not loaded,
	 * which leaves the detected wallets listed and nothing to install.
	 */
	registry?: WalletOption[]
	connecting: boolean
	/** True once a wallet is connected, which is what closes the dialog. */
	connected?: boolean
	/** What the wallet said when it refused, empty when it has not. */
	error?: string
	/**
	 * Open straight into this wallet's hand-off rather than the list, for a
	 * payer who already named the wallet they want outside the dialog.
	 */
	initialWalletId?: string
	/**
	 * How to pair with one wallet over WalletConnect, or undefined for a
	 * wallet the page can see for itself. Asked per wallet rather than given
	 * as a list, because only the checkout knows which chain family is on
	 * screen and which chain a pairing is for.
	 */
	remotePairing?: (
		walletId: string,
	) => ((onUri: (uri: string) => void) => void) | undefined
	onSelect: (wallet: T) => void
	onClose: () => void
}) {
	const ref = useRef<HTMLDialogElement>(null)
	const [query, setQuery] = useState('')
	const [selected, setSelected] = useState<Entry<T> | undefined>()
	// The short list is the front door; the full one is behind the search row.
	// Most payers want a wallet that is already in the browser, and a list of
	// everything buries those under names they will never pick.
	const [showAll, setShowAll] = useState(false)

	useEffect(() => {
		const dialog = ref.current
		if (!dialog) {
			return
		}
		if (open && !dialog.open) {
			dialog.showModal()
			setQuery('')
			setSelected(
				initialWalletId
					? entries.find((entry) => entry.id === initialWalletId)
					: undefined,
			)
			// Every opening starts at the front door, including one that was
			// last closed while browsing the full list.
			setShowAll(false)
		} else if (!open && dialog.open) {
			dialog.close()
		}
		// entries is read above but deliberately not a dependency: this runs
		// when the dialog opens, and re-running it on a catalogue update would
		// throw the payer back to the list mid-choice.
	}, [open, initialWalletId])

	// `showModal` makes the page inert but leaves it scrollable, so the list
	// scrolls whatever is behind it. The padding stands in for the scrollbar
	// that hiding the overflow takes away.
	useEffect(() => {
		if (!open) {
			return
		}
		const root = document.documentElement
		const was = { overflow: root.style.overflow, padding: root.style.paddingRight }
		const gap = window.innerWidth - root.clientWidth
		root.style.overflow = 'hidden'
		if (gap > 0) {
			root.style.paddingRight = `${gap}px`
		}
		return () => {
			root.style.overflow = was.overflow
			root.style.paddingRight = was.padding
		}
	}, [open])

	// Esc and the close button both fire the dialog's own close event, so
	// parent state is synced from there rather than from each interaction.
	useEffect(() => {
		const dialog = ref.current
		if (!dialog) {
			return
		}
		const handleClose = () => onClose()
		dialog.addEventListener('close', handleClose)
		return () => dialog.removeEventListener('close', handleClose)
	}, [onClose])

	const entries = useMemo<Entry<T>[]>(() => {
		const detected = new Map(wallets.map((wallet) => [wallet.id, wallet]))
		const known: Entry<T>[] = registry.map((definition: WalletOption) => {
			const found = detected.get(definition.id)
			return {
				id: definition.id,
				name: definition.name,
				icon: found?.icon,
				detected: found,
				installUrl: definition.installUrl,
			}
		})
		// Wallets that announced over EIP-6963 but are not in the registry are
		// still connectable, so they are listed rather than dropped.
		for (const wallet of wallets) {
			if (!known.some((entry) => entry.id === wallet.id)) {
				known.push({
					id: wallet.id,
					name: wallet.name,
					icon: wallet.icon,
					detected: wallet,
				})
			}
		}
		// Installed first: those are the ones the payer can actually use.
		return known.sort(
			(a, b) => Number(Boolean(b.detected)) - Number(Boolean(a.detected)),
		)
	}, [wallets, registry])

	const handheld = useHandheld()

	// A connected wallet is the end of this dialog's job. Closed here rather
	// than on the click, so a refusal leaves the payer on the status panel
	// with a way to try again instead of back on the checkout wondering.
	useEffect(() => {
		if (connected) {
			onClose()
		}
	}, [connected, onClose])

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase()
		if (!needle) {
			return entries
		}
		return entries.filter((entry) =>
			entry.name.toLowerCase().includes(needle),
		)
	}, [entries, query])

	// Five, which is what fits above the search row without the dialog
	// scrolling on a short laptop screen.
	const shown = useMemo(
		() => (showAll ? filtered : entries.slice(0, TOP_WALLETS)),
		[showAll, filtered, entries],
	)

	return (
		<dialog
			ref={ref}
			class="wallet-dialog"
			aria-label="All wallets"
			onClick={(event) => {
				// A native dialog does not close on a backdrop click. The
				// backdrop is part of the dialog's own box, so a click landing
				// on the element itself, rather than on any child: is one.
				if (event.target === ref.current) {
					onClose()
				}
			}}
		>
			{/* Everything visible lives in this wrapper so the dialog element
			    carries no padding of its own. With padding, a click on the
			    modal's inner edge would read as a backdrop click and close it. */}
			<div class="wallet-dialog-body">
				<div class="wallet-dialog-head">
					{selected || showAll ? (
						<button
							type="button"
							class="icon-button"
							aria-label="Back"
							onClick={() => {
								if (selected) {
									setSelected(undefined)
									return
								}
								setShowAll(false)
								setQuery('')
							}}
						>
							‹
						</button>
					) : (
						// Keeps the title centred whether or not a back button
						// is present.
						<span class="icon-button-spacer" />
					)}
					<h2>
						{selected
							? selected.name
							: showAll
								? 'All wallets'
								: 'Connect wallet'}
					</h2>
					<button
						type="button"
						class="icon-button"
						aria-label="Close"
						onClick={onClose}
					>
						×
					</button>
				</div>

				{selected ? (
					<WalletConnectPanel
						id={selected.id}
						name={selected.name}
						icon={selected.icon}
						detected={selected.detected}
						installUrl={selected.installUrl}
						connecting={connecting}
						error={error}
						// Only for a wallet that cannot be seen any other way.
						// An installed one has already been asked by now.
						onRemote={
							selected.detected
								? undefined
								: remotePairing?.(selected.id)
						}
						onConnect={onSelect}
					/>
				) : (
				<>
				{showAll ? (
					<input
						type="search"
						class="wallet-search"
						placeholder="Search wallet"
						aria-label="Search wallet"
						value={query}
						onInput={(event) =>
							setQuery((event.target as HTMLInputElement).value)
						}
					/>
				) : null}

				{/* Nothing here is disabled while a connection is pending. The
				    wallet owns that request and may sit on it indefinitely, so
				    connecting stays true until the payer answers a prompt they
				    have just walked away from: disabling on it left every
				    installed wallet dead after pressing back. */}
				{showAll ? (
					// A grid once the list is long: at twenty wallets a column
					// of rows is a scroll, and the mark is what a payer is
					// actually scanning for by then, not the name.
					<div class="wallet-grid">
						{shown.map((entry) => (
							<button
								key={entry.id}
								type="button"
								class="wallet-tile"
								aria-label={
									entry.detected ? `${entry.name}, installed` : entry.name
								}
								onClick={() => {
									setSelected(entry)
									if (entry.detected) {
										onSelect(entry.detected)
									}
								}}
							>
								<WalletMark
									id={entry.id}
									name={entry.name}
									icon={entry.icon}
									size="lg"
								/>
								<span class="wallet-tile-name">{entry.name}</span>
								{/* Floated rather than stacked: a tag in the flow
								    made the installed tiles taller than the rest
								    and broke the grid's rows. The button's label
								    carries the same fact for a screen reader. */}
								{entry.detected ? (
									<span class="wallet-tile-badge" aria-hidden="true">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
											<path d="m5 13 4 4L19 7" />
										</svg>
									</span>
								) : null}
							</button>
						))}
					</div>
				) : (
					<div class="wallet-list">
						{shown.map((entry) => (
							<button
								key={entry.id}
								type="button"
								class="wallet-row"
								onClick={() => {
									setSelected(entry)
									if (entry.detected) {
										onSelect(entry.detected)
									}
								}}
							>
								<WalletMark
									id={entry.id}
									name={entry.name}
									icon={entry.icon}
									size="lg"
								/>
								<span class="wallet-row-name">{entry.name}</span>
								{/* Only when there is something to say. A wallet
								    that is simply not installed on a desktop is
								    the ordinary case, and badging every one of
								    those leaves the badge meaning nothing. */}
								{entry.detected ? (
									<span class="wallet-row-tag is-installed">Installed</span>
								) : handheld ? (
									<span class="wallet-row-tag is-muted">Get</span>
								) : null}
								<span class="wallet-row-chevron" aria-hidden="true">
									›
								</span>
							</button>
						))}
					</div>
				)}

				{/* The way to the rest, styled as one more row so the list
				    reads as a list rather than as five wallets and a control. */}
				{!showAll && entries.length > TOP_WALLETS ? (
					<button
						type="button"
						class="wallet-row wallet-search-row"
						onClick={() => setShowAll(true)}
					>
						<span class="wallet-search-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
								<circle cx="11" cy="11" r="7" />
								<path d="m20 20-3.5-3.5" />
							</svg>
						</span>
						<span class="wallet-row-name">Search wallet</span>
						<span class="wallet-row-count">{entries.length}</span>
						<span class="wallet-row-chevron" aria-hidden="true">
							›
						</span>
					</button>
				) : null}

				{showAll && shown.length === 0 ? (
					<p class="muted wallet-empty">No wallet matches “{query}”.</p>
				) : null}
				</>
				)}
			</div>
		</dialog>
	)
}

