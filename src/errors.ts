/**
 * Wallet errors, and turning one into something a person can read.
 *
 * Family-neutral and so in its own file, beside evm.ts and svm.ts rather than
 * inside either: a payer who rejects a request in their wallet has done the
 * same thing whichever chain they were paying on, and the message they see
 * must not depend on which module happened to own the type.
 */

/** Errors a payer can actually act on, separated from raw RPC noise. */
export class WalletError extends Error {
	// Declared and assigned rather than a constructor parameter property:
	// the build runs with erasableSyntaxOnly, which forbids the shorthand.
	code?: number

	/**
	 * Marks a message this app wrote, so walletErrorMessage shows it verbatim.
	 *
	 * Without it every deliberate message ("your wallet holds 0 USDC…") was
	 * replaced by the generic fallback, which told the payer nothing and hid
	 * the actual reason the payment stopped.
	 */
	readonly payerFacing = true

	constructor (message: string, code?: number) {
		super(message)
		this.name = 'WalletError'
		this.code = code
	}
}

export interface ProviderRpcError {
	code?: number
	message?: string
}

/**
 * True for an error this app authored, so its text is safe to show.
 *
 * Checked structurally rather than with instanceof so the wallet layer needs
 * no import from the API client: anything that marks itself payerFacing
 * qualifies.
 */
function isPayerFacing (error: unknown): error is Error {
	return (
		error instanceof Error &&
		(error as { payerFacing?: boolean }).payerFacing === true
	)
}

/**
 * Turns a provider rejection into something a person can read.
 *
 * Raw RPC errors leak internals and frighten payers; the codes that matter
 * are standardised (EIP-1193 / EIP-1474) and Solana wallets reuse the same
 * numbers, so they are mapped explicitly for both and anything unrecognised
 * falls back to a plain sentence.
 */
export function walletErrorMessage (error: unknown, fallback: string): string {
	const rpc = error as ProviderRpcError
	switch (rpc?.code) {
		case 4001:
			return 'Request rejected in your wallet.'
		case 4100:
			return 'Your wallet has not authorized this account.'
		case -32002:
			return 'Your wallet already has a pending request. Open it to continue.'
		case -32603:
			return 'Your wallet could not complete the request.'
		default:
			// Our own messages pass through; anything else is raw RPC noise and
			// is replaced, so internals never reach a payer.
			return isPayerFacing(error) ? error.message : fallback
	}
}
