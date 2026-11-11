import { useEffect, useState } from 'preact/hooks'

import { WalletMark } from './wallet-mark.js'
import { qrSvg } from './qr.js'
import { useHandheld } from './use-handheld.js'
import { walletDeepLink, walletPairingLink } from '@reclack/walletkit'
import type { WalletChoice } from '@reclack/walletkit'

/**
 * The hand-off screen for one wallet.
 *
 * The way forward depends on the device. On a desktop the wallet is either in
 * this browser or in the payer's pocket, so the panel offers a code to carry
 * the checkout across. On a phone there is nothing to scan: the wallet is on
 * this device, and the way in is a link that opens it.
 */
export function WalletConnectPanel<T extends WalletChoice> ({
	id,
	name,
	icon,
	detected,
	installUrl,
	connecting,
	error,
	onRemote,
	onConnect,
}: {
	id: string
	name: string
	icon?: string
	detected?: T
	installUrl?: string
	connecting: boolean
	/** What the wallet said when it refused, empty when it has not. */
	error?: string
	/**
	 * Pairs with a wallet that puts nothing in the page, over WalletConnect.
	 * Absent when this wallet can be found some other way, or when the
	 * checkout has no project id to pair with.
	 */
	onRemote?: (onUri: (uri: string) => void) => void
	onConnect: (wallet: T) => void
}) {
	const [copied, setCopied] = useState(false)
	const handheld = useHandheld()
	// The pairing string, once the relay has issued one. Empty until then,
	// which is a second or two of a caption rather than a dead frame.
	const [pairing, setPairing] = useState('')
	// Bumped to ask for a fresh pairing. A code that was refused, or sat
	// unscanned until the relay dropped it, cannot be retried as it is.
	const [attempt, setAttempt] = useState(0)

	// Pairing starts when the wallet is chosen rather than on a further
	// press: there is nothing else to decide on this panel, and a code that
	// appears only after another click is a click that asks nothing.
	useEffect(() => {
		if (!onRemote) {
			return
		}
		let live = true
		setPairing('')
		onRemote((uri) => {
			if (live) {
				setPairing(uri)
			}
		})
		return () => {
			live = false
		}
		// Keyed on the wallet and the attempt, not on the callback: a parent
		// that rebuilds the callback each render would otherwise start a
		// second pairing on every keystroke elsewhere on the page.
	}, [id, attempt])

	// The link is what moves the payer to their phone: the whole checkout
	// travels, not just a wallet session.
	const url = window.location.href
	const appUrl = walletDeepLink(id, url)

	// Which scanner the payer is being asked to use. Two codes, because the
	// two accept different things: a wallet's own scanner expects a link into
	// itself, or a session to join, and rejects a plain URL, which is the
	// error this panel used to hand people when the code was branded with
	// the wallet's logo.
	const [tab, setTab] = useState<'wallet' | 'camera'>(
		appUrl || onRemote ? 'wallet' : 'camera',
	)
	const target = tab === 'wallet' && appUrl ? appUrl : url
	// Nobody scans their own screen, so a phone gets no code at all.
	const svg = handheld ? '' : qrSvg(target)
	// The pairing code, which is a different thing from the two above: it
	// carries a session for this wallet to join, not a page to open.
	//
	// The code itself goes in the QR, because a wallet's scanner is already
	// inside the wallet and needs no help finding it. The link is for the
	// phone, where the raw string would reach whichever application claimed
	// the wc: scheme rather than the one the payer chose.
	const pairingSvg = handheld || !pairing ? '' : qrSvg(pairing)
	const pairingLink = pairing ? walletPairingLink(id, pairing) : undefined

	// The pairing string. Unlike a wallet's trigger link this is worth
	// copying: a wallet that cannot reach a camera takes it pasted.
	async function copyPairing () {
		try {
			await navigator.clipboard.writeText(pairing)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 1600)
		} catch {
			window.prompt('Copy this connection code', pairing)
		}
	}

	// Always the checkout, never `target`: on the wallet tab that is a link
	// into the wallet application, which does nothing pasted anywhere.
	async function copy () {
		try {
			await navigator.clipboard.writeText(url)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 1600)
		} catch {
			window.prompt('Copy this payment link', url)
		}
	}

	// An installed wallet is connected to the moment it is picked, so this
	// panel is a status rather than a choice: the request is already sitting
	// in the wallet and the only thing left to offer is another go.
	if (detected) {
		return (
			<div class="connect-panel connect-status">
				<span class="connect-status-mark">
					<WalletMark id={id} name={name} icon={icon} size="lg" />
					{/* An arc around the mark while the wallet has the request.
					    The mark alone said nothing about whether anything was
					    happening, which on a prompt that opens behind the
					    window is the whole question. */}
					{connecting ? (
						<svg
							class="connect-spinner"
							viewBox="0 0 100 100"
							aria-hidden="true"
						>
							<circle
								cx="50"
								cy="50"
								r="46"
								fill="none"
								stroke="currentColor"
								stroke-width="4"
								stroke-linecap="round"
								stroke-dasharray="72 217"
							/>
						</svg>
					) : null}
				</span>
				<p class={`connect-status-title${error ? ' is-error' : ''}`}>
					{error ? 'Connection declined' : `Continue in ${name}`}
				</p>
				<p class="connect-status-note">
					{error
						|| `Accept the connection request in ${name}.`}
				</p>
				<button
					type="button"
					class="secondary connect-retry"
					onClick={() => onConnect(detected)}
				>
					<svg
						class="connect-retry-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M21 12a9 9 0 1 1-2.64-6.36" />
						<path d="M21 3v6h-6" />
					</svg>
					Try again
				</button>
			</div>
		)
	}

	// A wallet this page cannot reach is paired with instead of handed to.
	// The code on the wallet tab is then a session for the wallet to join
	// rather than a page to open, and only the wallet's own scanner can read
	// it: a phone's camera pointed at it opens nothing.
	if (onRemote) {
		return (
			<div class={`connect-panel${handheld ? ' connect-handoff' : ''}`}>
				{handheld ? (
					<>
						{error ? (
							<button
								type="button"
								class="secondary connect-retry"
								onClick={() => setAttempt((count) => count + 1)}
							>
								Try again
							</button>
						) : pairingLink ? (
							<a class="primary connect-open" href={pairingLink}>
								Open in {name}
							</a>
						) : pairing ? (
							// No link to this wallet, so the code is pasted
							// rather than followed. Still offered: a payer who
							// has the wallet open can finish, and the button
							// that would have been here opens somebody else's
							// wallet, which is worse than asking.
							<button
								type="button"
								class="secondary connect-copy"
								onClick={copyPairing}
							>
								{copied ? 'Copied' : 'Copy connection code'}
							</button>
						) : null}
						<p class="qr-caption">
							{error
								|| (!pairing
									? 'Preparing a connection…'
									: pairingLink
										? `Approve the connection in ${name}, then come back here.`
										: `Copy this code and paste it into ${name} to connect.`)}
						</p>
					</>
				) : (
					<>
						{/* Both ways to the phone, the wallet's own scanner first.
						    That one joins the session this page is already holding,
						    and the payment is approved where the payer is sitting;
						    the camera can only carry the checkout to the phone's
						    browser, where the payer starts the choice again. Still
						    offered, because paying on the phone is a thing a payer
						    is entitled to prefer. */}
						<div class="portal-tabs qr-tabs" role="tablist">
							<button
								type="button"
								role="tab"
								aria-selected={tab === 'wallet'}
								class={`portal-tab${tab === 'wallet' ? ' is-active' : ''}`}
								onClick={() => setTab('wallet')}
							>
								Wallet app
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={tab === 'camera'}
								class={`portal-tab${tab === 'camera' ? ' is-active' : ''}`}
								onClick={() => setTab('camera')}
							>
								Phone camera
							</button>
						</div>

						<div class="qr-frame">
							{tab === 'camera' ? (
								svg ? (
									<div
										class="qr"
										dangerouslySetInnerHTML={{ __html: svg }}
									/>
								) : (
									<div class="qr qr-fallback">
										<code>{url}</code>
									</div>
								)
							) : pairingSvg ? (
								<div
									class="qr"
									dangerouslySetInnerHTML={{ __html: pairingSvg }}
								/>
							) : error ? (
								<div class="qr qr-fallback">
									<code>Connection failed</code>
								</div>
							) : (
								// The frame keeps the code's height while the
								// relay is still issuing one, so nothing moves
								// when it arrives. Empty but for the spinner:
								// a dashed box with a wallet's mark stamped on
								// it reads as a code that failed rather than
								// one on its way, and the caption below says
								// what is happening.
								<div class="qr">
									<svg
										class="qr-spinner"
										viewBox="0 0 100 100"
										aria-hidden="true"
									>
										<circle
											cx="50"
											cy="50"
											r="46"
											fill="none"
											stroke="currentColor"
											stroke-width="4"
											stroke-linecap="round"
											stroke-dasharray="72 217"
										/>
									</svg>
								</div>
							)}
							{/* The mark goes on the session code alone. On the
							    camera code it is what used to send a payer to
							    the wrong scanner. */}
							{tab === 'wallet' && (pairingSvg || error) ? (
								<span class="qr-badge">
									<WalletMark id={id} name={name} icon={icon} size="lg" />
								</span>
							) : null}
						</div>
						<p class="qr-caption">
							{tab === 'camera'
								? 'Scan with your phone’s camera to open this checkout on your phone'
								: error
									|| (pairing
										? `Scan this from inside ${name} to connect`
										: 'Preparing a connection…')}
						</p>
						{tab === 'camera' ? (
							<button type="button" class="link-button qr-copy" onClick={copy}>
								{copied ? 'Copied' : 'Copy link'}
							</button>
						) : error ? (
							<button
								type="button"
								class="link-button qr-copy"
								onClick={() => setAttempt((count) => count + 1)}
							>
								Try again
							</button>
						) : pairing ? (
							<button
								type="button"
								class="link-button qr-copy"
								onClick={copyPairing}
							>
								{copied ? 'Copied' : 'Copy to clipboard'}
							</button>
						) : null}
					</>
				)}

				<div class="install-row">
					<span>Don’t have {name}?</span>
					{installUrl ? (
						<a
							class="secondary"
							href={installUrl}
							target="_blank"
							rel="noreferrer noopener"
						>
							Get
						</a>
					) : null}
				</div>
			</div>
		)
	}

	return (
		<div class={`connect-panel${handheld ? ' connect-handoff' : ''}`}>
			{handheld ? (
				<>
					{appUrl ? (
						<a class="primary connect-open" href={appUrl}>
							Open in {name}
						</a>
					) : null}
					<p class="qr-caption">
						{appUrl
							? `${name} opens with this checkout loaded.`
							: `Open ${name} and browse to this page to pay.`}
					</p>
				</>
			) : (
				<>
					{appUrl ? (
						<div class="portal-tabs qr-tabs" role="tablist">
							<button
								type="button"
								role="tab"
								aria-selected={tab === 'wallet'}
								class={`portal-tab${tab === 'wallet' ? ' is-active' : ''}`}
								onClick={() => setTab('wallet')}
							>
								Wallet app
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={tab === 'camera'}
								class={`portal-tab${tab === 'camera' ? ' is-active' : ''}`}
								onClick={() => setTab('camera')}
							>
								Phone camera
							</button>
						</div>
					) : null}

					<div class="qr-frame">
						{svg ? (
							<div class="qr" dangerouslySetInnerHTML={{ __html: svg }} />
						) : (
							<div class="qr qr-fallback">
								<code>{url}</code>
							</div>
						)}
						{/* The wallet's mark belongs on the wallet code alone. On
						    the camera code it is what told a payer to reach for
						    the wrong scanner. */}
						{tab === 'wallet' && appUrl ? (
							<span class="qr-badge">
								<WalletMark id={id} name={name} icon={icon} size="lg" />
							</span>
						) : null}
					</div>

					<p class="qr-caption">
						{!svg
							? 'Open this link on your phone to pay from a mobile wallet'
							: tab === 'wallet'
								? `Scan from inside the ${name} app to pay there`
								: 'Scan with your phone’s camera to open this checkout on your phone'}
					</p>

					{/* Offered on the camera tab alone. There the code is the
					    checkout, so a copy is something a payer can send
					    themselves; on the wallet tab it would hand them a
					    trigger link with nowhere to go. */}
					{tab === 'camera' ? (
						<button type="button" class="link-button qr-copy" onClick={copy}>
							{copied ? 'Copied' : 'Copy link'}
						</button>
					) : null}
				</>
			)}

			<div class="install-row">
				<span>Don’t have {name}?</span>
				{installUrl ? (
					<a
						class="secondary"
						href={installUrl}
						target="_blank"
						rel="noreferrer noopener"
					>
						Get
					</a>
				) : null}
			</div>
		</div>
	)
}
