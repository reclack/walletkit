const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * Base58, encode only.
 *
 * Here for one reason: a wallet reached through the Wallet Standard returns a
 * transaction signature as raw bytes, and every other part of this system
 * names a Solana transaction by its base58 string. Nothing else in this
 * bundle encodes anything; the transaction itself arrives already built.
 *
 * Big-integer division by repeated subtraction over the byte array, because
 * 64 bytes exceeds what a JavaScript number can hold and a checkout page
 * should not ship a bignum library to convert one signature.
 */
export function base58Encode(bytes: Uint8Array): string {
	if (bytes.length === 0) {
		return ''
	}

	// Leading zero bytes are not part of the number and would be lost in the
	// division, so they are counted off first and written back as '1's.
	let zeros = 0
	while (zeros < bytes.length && bytes[zeros] === 0) {
		zeros++
	}

	const digits: number[] = []
	for (let i = zeros; i < bytes.length; i++) {
		let carry = bytes[i]
		for (let j = 0; j < digits.length; j++) {
			carry += digits[j] << 8
			digits[j] = carry % 58
			carry = (carry / 58) | 0
		}
		while (carry > 0) {
			digits.push(carry % 58)
			carry = (carry / 58) | 0
		}
	}

	let out = '1'.repeat(zeros)
	for (let i = digits.length - 1; i >= 0; i--) {
		out += ALPHABET[digits[i]]
	}
	return out
}

/** Decodes the base64 the API sends raw bytes in. */
export function fromBase64(value: string): Uint8Array {
	const binary = atob(value)
	const out = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		out[i] = binary.charCodeAt(i)
	}
	return out
}
