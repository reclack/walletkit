import { useWalletLogo } from './assets.js'

/**
 * A wallet's logo.
 *
 * Preference order matters: an installed wallet's own EIP-6963 icon is always
 * the truest artwork, so it wins. The bundled mark covers wallets the payer has
 * not installed, where there is no provider to ask. The monogram is the last
 * resort: a wallet that announced itself but is not in the registry, so we
 * have a name and nothing else.
 */
export function WalletMark ({
	id,
	name,
	icon,
	size = 'sm',
}: {
	id: string
	name: string
	icon?: string
	size?: 'sm' | 'lg'
}) {
	// The wallet's own icon when it is installed, otherwise the bundled brand
	// asset; the monogram only covers a wallet that announced itself but is
	// not in the registry, where a name is all we have.
	const logo = useWalletLogo()
	const src = icon ?? logo(id)
	const px = size === 'lg' ? 32 : 20

	return (
		<span
			class={size === 'lg' ? 'wallet-mark wallet-mark-lg' : 'wallet-mark'}
			aria-hidden="true"
		>
			{src ? (
				<img
					src={src}
					alt=""
					width={px}
					height={px}
					loading="lazy"
					decoding="async"
				/>
			) : (
				name.charAt(0)
			)}
		</span>
	)
}
