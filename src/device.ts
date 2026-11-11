/**
 * Whether this is a touch-primary device: a phone or a tablet.
 *
 * `hover: none` and `pointer: coarse` together, not either alone. A laptop
 * with a touchscreen reports a coarse pointer the moment somebody touches it
 * but still hovers, and treating that as a phone would take the QR away from
 * a payer who needs it. Screen width is deliberately not part of this: a
 * narrow desktop window is still a desktop.
 *
 * Matters because the wallet hand-off is the opposite on each. A desktop
 * payer scans a code to carry the checkout to their phone; a phone payer
 * cannot scan their own screen and needs a link into the wallet instead.
 */
const HANDHELD = '(hover: none) and (pointer: coarse)'

export function isHandheld (): boolean {
	return typeof window !== 'undefined'
		&& typeof window.matchMedia === 'function'
		&& window.matchMedia(HANDHELD).matches
}

/**
 * isHandheld, kept current: a tablet can be docked to a keyboard mid-session.
 *
 * A subscription rather than a hook, because this package renders nothing.
 * Every UI layer over it has its own way of listening, and all of them can
 * drive this one; the reverse is not true.
 *
 * Returns a cleanup function, and calls back once immediately so a caller
 * never has to read the value separately before subscribing to it.
 */
export function subscribeHandheld (
	onChange: (handheld: boolean) => void,
): () => void {
	if (
		typeof window === 'undefined'
		|| typeof window.matchMedia !== 'function'
	) {
		onChange(false)
		return () => undefined
	}
	const query = window.matchMedia(HANDHELD)
	const update = () => onChange(query.matches)
	update()
	query.addEventListener('change', update)
	return () => query.removeEventListener('change', update)
}

/**
 * Which mobile platform this is, if either.
 *
 * Only for picking between two hand-off links that do the same job: a wallet
 * with no universal link needs a custom scheme on iOS and an intent URL on
 * Android, and neither does anything on the other. Nothing else should read
 * this: the feature queries above say what a device can do, which a
 * user-agent string only guesses at.
 */
export type MobileOS = 'ios' | 'android'

export function mobileOS (): MobileOS | undefined {
	if (typeof navigator === 'undefined') {
		return undefined
	}
	const ua = navigator.userAgent
	if (/android/i.test(ua)) {
		return 'android'
	}
	if (/iphone|ipad|ipod/i.test(ua)) {
		return 'ios'
	}
	// An iPad reports itself as a Mac. A desktop Mac has no touch points.
	if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) {
		return 'ios'
	}
	return undefined
}
