/**
 * Brand logos for wallets the payer does not have installed.
 *
 * Filenames rather than paths, joined to a base the host supplies. The files
 * are served by the host from its own origin so that a checkout still makes
 * no third-party image request, they stay out of the JS payload, and the
 * browser caches and fetches them in parallel instead of blocking the page.
 * The files themselves ship in this package under `assets/`; a host copies
 * them into whatever it serves static files from.
 *
 * An installed wallet's own EIP-6963 icon still wins over these: it is the
 * artwork of the provider actually present, which matters when a payer runs a
 * fork or a wallet that has rebranded since these files were added.
 *
 * Filenames are mapped explicitly rather than derived from the wallet id: the
 * assets do not follow one naming convention (crypto_com vs trust-wallet), and
 * a derived path would break silently the next time one is added.
 */
export const WALLET_LOGOS: Record<string, string> = {
	metamask: 'metamask.webp',
	phantom: 'phantom.webp',
	brave: 'brave.webp',
	binance: 'binance.webp',
	trust: 'trust-wallet.webp',
	okx: 'okx.webp',
	cryptocom: 'crypto_com.webp',
	coinbase: 'coinbase.webp',
	solflare: 'solflare.webp',
	backpack: 'backpack.webp',
	rainbow: 'rainbow.webp',
	rabby: 'rabby.webp',
	ledger: 'ledger.webp',
	bitpay: 'bitpay.webp',
	bitget: 'bitget.webp',
	bitcoincom: 'bitcoincom.webp',
	blockchaincom: 'blockchaincom.webp',
	bybit: 'bybit.webp',
	safe: 'safe.webp',
	exodus: 'exodus.webp',
	kraken: 'kraken.webp',
	berasig: 'berasig.webp',
	bestwallet: 'bestwallet.webp',
	bifrostwallet: 'bifrostwallet.webp',
	bitski: 'bitski.webp',
	bitverse: 'bitverse.webp',
	clv: 'clv.webp',
	coin98: 'coin98.webp',
	compass: 'compass.webp',
	core: 'core.webp',
	ctrl: 'ctrl.webp',
	dawn: 'dawn.webp',
	desig: 'desig.webp',
	enkrypt: 'enkrypt.webp',
	foxwallet: 'foxwallet.webp',
	frame: 'frame.webp',
	frontier: 'frontier.webp',
	gate: 'gate.webp',
	gemini: 'gemini.webp',
	imtoken: 'imtoken.webp',
	iopay: 'iopay.webp',
	kaia: 'kaia.webp',
	kaikas: 'kaikas.webp',
	kresuswallet: 'kresuswallet.webp',
	magiceden: 'magiceden.webp',
	meco: 'meco.webp',
	mew: 'mew.webp',
	nest: 'nest.webp',
	nova: 'nova.webp',
	okto: 'okto.webp',
	oneinch: 'oneinch.webp',
	onekey: 'onekey.webp',
	ramper: 'ramper.webp',
	ready: 'ready.webp',
	ronin: 'ronin.webp',
	safepal: 'safepal.webp',
	subwallet: 'subwallet.webp',
	taho: 'taho.webp',
	talisman: 'talisman.webp',
	tokenpocket: 'tokenpocket.webp',
	tokenary: 'tokenary.webp',
	uniswap: 'uniswap.webp',
	universalprofiles: 'universalprofiles.webp',
	valora: 'valora.webp',
	wigwam: 'wigwam.webp',
	xportal: 'xportal.webp',
	zeal: 'zeal.webp',
	zerion: 'zerion.webp',
}

/** Where a host serves the files in this package's `assets/` directory. */
export const DEFAULT_LOGO_BASE = '/images/'

export function walletLogo (
	id: string,
	base: string = DEFAULT_LOGO_BASE,
): string | undefined {
	const file = WALLET_LOGOS[id]
	if (!file) {
		return undefined
	}
	return `${base.endsWith('/') ? base : `${base}/`}${file}`
}
