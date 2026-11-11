/**
 * The smallest ABI encoder that can authorize a subscription.
 *
 * No wallet SDK and no keccak implementation ship in this bundle. Every call
 * this page makes has a fixed signature, so the four-byte selectors are
 * constants: computed once with `cast sig` and pinned below, and every
 * argument is a static 32-byte word. That makes the encoder a few lines of
 * string work instead of a dependency on a checkout page that handles money.
 *
 * Regenerate a selector with:
 *   cast sig "approve(address,uint256)"
 * The unit test in abi.test.ts asserts these against the same signatures.
 */

/** Left-pads a hex value to one 32-byte ABI word. */
export function word (value: bigint | string): string {
	let hex: string
	if (typeof value === 'bigint') {
		if (value < 0n) {
			throw new Error('negative values are not encodable here')
		}
		hex = value.toString(16)
	} else {
		hex = value.toLowerCase().replace(/^0x/, '')
	}
	if (hex.length > 64) {
		throw new Error('value does not fit in a 32-byte word')
	}
	return hex.padStart(64, '0')
}

/** Encodes an address as a left-padded word, rejecting anything malformed. */
export function addressWord (address: string): string {
	if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
		throw new Error('invalid address')
	}
	return word(address)
}

/** A bytes32 value, right-padded: the one argument that is not left-aligned. */
export function bytes32 (hex: string): string {
	const raw = hex.toLowerCase().replace(/^0x/, '')
	if (raw.length > 64 || /[^0-9a-f]/.test(raw)) {
		throw new Error('invalid bytes32')
	}
	return raw.padEnd(64, '0')
}

/** Concatenates a selector and its already-encoded words into calldata. */
export function calldata (selector: string, words: string[]): string {
	return selector + words.join('')
}
