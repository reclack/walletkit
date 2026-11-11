import { renderSVG } from 'uqr'

/**
 * QR rendering for the wallet hand-off.
 *
 * The encoder is a dependency on purpose. QR generation is not something to
 * hand-roll. Reed-Solomon over GF(256), mask selection and format bits are
 * easy to get subtly wrong, and a code that looks right but does not scan is
 * worse than none on a payment page.
 *
 * It is also NOT rendered through a remote service: the checkout URL is the
 * credential for this payment, and handing it to an image API would leak every
 * link a payer opens to a third party. uqr runs entirely in the page.
 *
 * Callers still handle `undefined`, so a failure to encode degrades to the
 * copyable link rather than an empty frame.
 */
export function qrSvg (text: string): string | undefined {
	if (!text) {
		return undefined
	}
	try {
		return renderSVG(text, {
			// The whole quiet zone, now that the frame adds no padding of
			// its own. Two modules rather than the specified four: four is
			// the belt-and-braces figure for print, and on a screen held
			// still in front of a camera two reads reliably while leaving
			// the code noticeably larger.
			border: 2,
			// Higher correction so the wallet mark sitting over the centre
			// does not stop the code scanning.
			ecc: 'H',
		})
	} catch {
		return undefined
	}
}
