/**
 * An address, shortened the way addresses are shortened.
 *
 * Head and tail, not a card-style mask: an address is not a secret to be
 * redacted, it is a public identifier that is merely too long for the place
 * it has to fit. Both ends carry meaning: the prefix says which chain family
 * it belongs to, and the tail is what somebody quotes when asking about a
 * payment.
 *
 * One function for every surface, because the same wallet should read the
 * same wherever it appears. This used to be written out separately in the
 * checkout and in the dashboard, each with a comment saying it matched the
 * other.
 */
export function shortAddress (address: string | undefined): string | undefined {
	const value = address?.trim()
	if (!value) {
		return undefined
	}
	if (value.length < 12) {
		return value
	}
	return `${value.slice(0, 6)}…${value.slice(-4)}`
}
