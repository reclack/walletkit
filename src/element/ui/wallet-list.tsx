import { useState } from 'preact/hooks'

import { WalletDialog } from './wallet-dialog.js'
import { WalletMark } from './wallet-mark.js'
import { useWalletLogo } from './assets.js'
import type { WalletChoice, WalletOption } from '@reclack/walletkit'

/** How many detected wallets to show before folding the rest into the dialog. */
const INLINE_LIMIT = 3

/**
 * What to offer when this browser has no wallet in it.
 *
 * Nothing needs installing to pay: these open on the payer's phone through
 * their own link, or hand the checkout across by code. Telling them to go and
 * install a browser extension was asking for the one thing that is not
 * required, at the moment they were trying to pay.
 */
const SUGGESTED = ['metamask', 'coinbase']

/** How many of those to offer. */
const SUGGESTED_LIMIT = 2

/**
 * The wallets a payer can pick.
 *
 * Icons come from the wallet itself over EIP-6963, so no brand assets ship in
 * this bundle. Only the first few detected wallets are inline: the payer
 * almost always wants one they already have installed, and a full grid of
 * every supported wallet buries that behind scrolling.
 */
export function WalletList<T extends WalletChoice> ({
	wallets,
	registry = [],
	connecting,
	connected,
	error,
	remotePairing,
	onSelect,
}: {
	wallets: T[]
	/**
	 * The wallets that exist for this chain family, from the catalogue. The
	 * overflow stack and the dialog behind it must offer wallets that can
	 * actually sign on the selected chain.
	 */
	registry?: WalletOption[]
	connecting: boolean
	/** True once a wallet is connected; closes the picker. */
	connected?: boolean
	/** What the wallet said when it refused. */
	error?: string
	/** Passed through to the dialog; see WalletDialog. */
	remotePairing?: (
		walletId: string,
	) => ((onUri: (uri: string) => void) => void) | undefined
	onSelect: (wallet: T) => void
}) {
	const logo = useWalletLogo()
	const [dialogOpen, setDialogOpen] = useState(false)
	// Which wallet the dialog should open straight into, if any.
	const [openWith, setOpenWith] = useState<string | undefined>()
	const inline = wallets.slice(0, INLINE_LIMIT)
	const hasMore = wallets.length > inline.length || registry.length > inline.length

	// Shown in place of the "nothing detected" note, and only then: a payer who
	// already has a wallet in the browser does not need to be sold two others.
	//
	// The named ones first, then whatever else this chain family offers: the
	// registry is scoped to the family, so neither is guaranteed to be in it.
	const suggested = wallets.length === 0
		? [
			...SUGGESTED.map((id) => registry.find((wallet) => wallet.id === id)),
			...registry,
		]
			.filter((wallet): wallet is WalletOption => wallet !== undefined)
			.filter((wallet, index, all) =>
				all.findIndex((other) => other.id === wallet.id) === index)
			.slice(0, SUGGESTED_LIMIT)
		: []

	// The wallets actually behind that button, shown as their own marks rather
	// than an ellipsis. A payer scanning for the one they use can see it is in
	// there without opening anything.
	//
	// Drawn from the registry, excluding whatever is already a row above, so the
	// stack never repeats a wallet the payer can already see.
	const shown = new Set(inline.map((wallet) => wallet.id))
	const others = registry.filter((wallet) => !shown.has(wallet.id))
		.map((wallet) => ({ id: wallet.id, src: logo(wallet.id) }))
		.filter((wallet) => wallet.src)
		.slice(0, 3)

	return (
		<div class="wallets">
			{/* Nothing here is disabled while a connection is pending, for the
			    reason the dialog's list is not: the wallet owns that request
			    and may sit on it indefinitely, so connecting stays true until
			    the payer answers a prompt they may have walked away from.
			    Pressing back out of the hand-off left every detected wallet
			    dead with no way to try again. */}
			{inline.map((wallet) => (
				<button
					key={wallet.id}
					type="button"
					class="wallet"
					onClick={() => onSelect(wallet)}
				>
					<WalletMark
						id={wallet.id}
						name={wallet.name}
						icon={wallet.icon}
					/>
					<span class="wallet-name">{wallet.name}</span>
					<span class="wallet-tag">Detected</span>
				</button>
			))}

			{suggested.map((wallet) => (
				<button
					key={wallet.id}
					type="button"
					class="wallet"
					onClick={() => {
						setOpenWith(wallet.id)
						setDialogOpen(true)
					}}
				>
					<WalletMark id={wallet.id} name={wallet.name} />
					<span class="wallet-name">{wallet.name}</span>
				</button>
			))}

			{inline.length === 0 && suggested.length === 0 && !hasMore ? (
				<p class="muted">Loading wallets…</p>
			) : null}

			{hasMore ? (
				<button
					type="button"
					class="wallet wallet-more-button"
					onClick={() => {
						setOpenWith(undefined)
						setDialogOpen(true)
					}}
				>
					{others.length > 0 ? (
						<span class="wallet-stack" aria-hidden="true">
							{others.map((wallet) => (
								<img
									key={wallet.id}
									src={wallet.src}
									alt=""
									width={16}
									height={16}
									loading="lazy"
									decoding="async"
								/>
							))}
						</span>
					) : (
						<span class="wallet-mark" aria-hidden="true">
							···
						</span>
					)}
					<span class="wallet-name">Other wallets</span>
				</button>
			) : null}

			<WalletDialog
				open={dialogOpen}
				wallets={wallets}
				registry={registry}
				connecting={connecting}
				connected={connected}
				error={error}
				initialWalletId={openWith}
				remotePairing={remotePairing}
				onClose={() => setDialogOpen(false)}
				// Not closed here: an installed wallet is asked straight away
				// and the dialog stays up showing the request, closing itself
				// once the wallet answers.
				onSelect={onSelect}
			/>
		</div>
	)
}
