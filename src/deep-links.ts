import { mobileOS, type MobileOS } from './device.js'

/**
 * How to open this checkout inside a wallet's own browser.
 *
 * A phone's camera opens a link in the phone's default browser, where no
 * wallet is injected, so the payer lands back on "wallet not detected". These
 * links open the same URL inside the wallet application instead, where its
 * provider is present and the payment can be signed. Mostly universal links,
 * which fall back to a web page when the wallet is not installed, but not
 * always: a wallet that publishes none takes what it has.
 *
 * Built explicitly per wallet rather than from one template: each vendor
 * chose a different shape, some percent-encode the whole URL and some take it
 * bare, and a derived link would fail silently in the one place a payer
 * cannot recover from.
 *
 * A wallet with no entry here simply has no wallet tab. That is deliberate: a
 * link that resolves to the wrong place is worse than an option that is not
 * offered, because the payer has already left the desktop by then.
 */
type DeepLink = (
	url: string,
	/** The platform the link has to satisfy, or undefined on a desktop. */
	platform: MobileOS | undefined,
) => string | undefined

const DEEP_LINKS: Record<string, DeepLink> = {
	// https://go.cb-w.com/dapp?cb_url=<percent-encoded>, per Coinbase's own
	// mobile dapp documentation.
	coinbase: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,

	// MetaMask takes the URL bare, with the scheme stripped.
	metamask: (url) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`,

	// coin_id 60 is Ethereum, which is what selects the dapp browser.
	trust: (url) =>
		`https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,

	// Phantom wants a referrer as well as the target.
	phantom: (url) =>
		`https://phantom.app/ul/browse/${encodeURIComponent(url)}` +
		`?ref=${encodeURIComponent(new URL(url).origin)}`,

	// Brave Wallet is part of the Brave browser rather than an app of its own,
	// so the hand-off is to open this page in Brave, where the wallet is
	// injected like any extension.
	//
	// There is no universal link for it, so each platform gets its own form
	// and a desktop gets nothing. The Android intent carries a fallback URL,
	// so a phone without Brave stays on the checkout rather than landing on an
	// unknown-scheme error; iOS has no equivalent, and an uninstalled Brave
	// means the link does nothing, which is why the install row stays below.
	brave: (url, platform) => {
		if (platform === 'android') {
			const target = new URL(url)
			return `intent://${target.host}${target.pathname}${target.search}`
				+ '#Intent;scheme=https;package=com.brave.browser;'
				+ `S.browser_fallback_url=${encodeURIComponent(url)};end`
		}
		if (platform === 'ios') {
			return `brave://open-url?url=${encodeURIComponent(url)}`
		}
		return undefined
	},

	// https://imtoken.gitbook.io/developers/products/universal-links. A real
	// universal link, so it falls back to a web page when imToken is absent.
	imtoken: (url) =>
		'https://connect.token.im/link/navigate/DappView'
		+ `?url=${encodeURIComponent(url)}`,

	// https://docs.iopay.me/developer-guides/deep-linking. A custom scheme is
	// all ioPay publishes: nothing to fall back to, and nothing a desktop
	// scanner could usefully encode, so a desktop gets none.
	iopay: (url, platform) =>
		platform
			? `iopay://io.iotex.iopay/open?action=web&url=${encodeURIComponent(url)}`
			: undefined,

	// https://web3.okx.com/build/docs/waas/app-universal-link. OKX wraps this
	// scheme in a download page for the web, but publishes the wrapper's
	// address nowhere this could be checked against, so the scheme goes bare
	// and a desktop gets none.
	okx: (url, platform) =>
		platform
			? `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`
			: undefined,

	// https://web3.bitget.com/en/docs/configuration/deeplink. bkcode.vip is
	// the https form, which Bitget's own documentation says is the only one
	// Android honours, so it is the only one used here.
	bitget: (url) => `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}`,

	// https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse
	// and https://docs.backpack.app/deeplinks/other-methods/browse. Both took
	// Phantom's shape: the target in the path, the caller in ref.
	solflare: (url) =>
		`https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}` +
		`?ref=${encodeURIComponent(new URL(url).origin)}`,

	backpack: (url) =>
		`https://backpack.app/ul/v1/browse/${encodeURIComponent(url)}` +
		`?ref=${encodeURIComponent(new URL(url).origin)}`,

	// https://help.tokenpocket.pro/developer-en/wallet/pull-up-wallet-with-deeplink.
	// The parameters arrive as a JSON object, encoded whole. Another custom
	// scheme, so a desktop gets none.
	//
	// ETH rather than the chain being paid on: the field picks which of
	// TokenPocket's wallets opens the page, and every chain this checkout
	// settles on is reached by the EVM one, which the page then asks to
	// switch like any other provider.
	tokenpocket: (url, platform) =>
		platform
			? 'tpdapp://open?params='
				+ encodeURIComponent(JSON.stringify({ url, chain: 'ETH' }))
			: undefined,
}

/**
 * Where to send a pairing string so that one wallet receives it.
 *
 * A bare `wc:` URI is a scheme, not an address. Whichever application claimed
 * the scheme answers it, which on a phone with MetaMask installed is MetaMask,
 * whatever wallet the payer picked. These carry the same string to one named
 * application instead.
 *
 * The links are each wallet's own entry in the WalletConnect registry, the
 * list the wallets themselves maintain, taken as published rather than
 * guessed at. A universal link where one exists, since it falls back to a web
 * page when the wallet is absent, and the custom scheme where the universal
 * is a redirect through an install tracker or already carries its own query.
 *
 * A wallet with no entry here is one the registry gives no mobile link for,
 * which generally means it has no phone application at all. That is why this
 * table doubles as the answer to walletScans below: on a phone the panel can
 * still offer the code to copy, but a desktop payer has nothing to paste into
 * and a wallet that lives only in a browser cannot scan.
 */
const PAIRING_LINKS: Record<string, string> = {
	binance: 'https://app.binance.com/cedefi',
	cryptocom: 'https://wallet.crypto.com/deeplink',
	rainbow: 'https://rnbwapp.com',
	rabby: 'rabby://',
	exodus: 'https://exodus.com/m',
	bybit: 'bybitapp://open/route?targetUrl=by://web3/walletconnect/',
	ledger: 'ledgerlive://',
	safe: 'https://app.safe.global/',
	kraken: 'krakenwallet://',
	bitpay: 'https://link.bitpay.com',
	bitcoincom: 'https://wallet.bitcoin.com/',
	blockchaincom: 'https://login.blockchain.com/app',
	// An extension and an iOS application, and it was the extension that hid
	// the application: a wallet that injects used to be taken as reachable.
	berasig: 'berasig://',
	bestwallet: 'https://best-wallet-prod.web.app/connect',
	bifrostwallet: 'https://app.bifrostwallet.com/',
	bitski: 'bitski://',
	bitverse: 'bitverseapp://open/wallet',
	coin98: 'coin98://',
	compass: 'leapcompass://',
	core: 'https://core.app',
	foxwallet: 'https://link.foxwallet.com',
	frontier: 'frontier://',
	gate: 'gtweb3wallet://',
	// This one, okx and tokenpocket have a browser of their own as well, and
	// are reached through it on a phone. They are here for the desktop, where
	// the link into that browser needs a platform nothing has named yet, and
	// the wallet's own scanner is what is left.
	iopay: 'iopay://',
	kaia: 'https://app.kaiawallet.io',
	kresuswallet: 'com.kresus.superapp://',
	magiceden: 'magiceden://',
	meco: 'mecowallet://',
	mew: 'https://mewwallet.com',
	nest: 'nestwallet://',
	nova: 'novawallet://',
	okto: 'okto://',
	// The exchange application's scheme, not the standalone wallet's
	// (okxwallet://main) and not the universal link, which is a download page
	// carrying a query of its own.
	okx: 'okex://main',
	oneinch: 'https://wallet.1inch.io/app/nobodywilleveruseit',
	onekey: 'https://app.onekey.so/wc/connect',
	ready: 'readywallet://',
	ronin: 'https://wallet.roninchain.com',
	safepal: 'https://link.safepal.io',
	subwallet: 'https://mobile.subwallet.app/',
	talisman: 'talisman://',
	// Not the tpdapp:// above: that one opens a page in TokenPocket, this one
	// hands it a session.
	tokenpocket: 'tpoutside://',
	uniswap: 'https://uniswap.org/app',
	universalprofiles: 'io.universaleverything.universalprofiles://wallet-connect',
	valora: 'https://valoraapp.com',
	wigwam: 'https://wigwam.app/',
	xportal: 'https://xportal.app.link',
	zeal: 'zeal://walletconnect/',
	zerion: 'zerion://',
}

/**
 * Whether this wallet has a phone application that can read a pairing code.
 *
 * Read off the table above rather than kept as a second list of its own. Every
 * entry there is a mobile link the wallet published to the WalletConnect
 * registry, and a wallet with no phone application publishes none.
 *
 * Asked by a desktop checkout, where a code can only be scanned. On a phone it
 * can be pasted instead, so one is offered there whatever this says.
 */
export function walletScans (id: string): boolean {
	return id in PAIRING_LINKS
}

/**
 * The link that hands this pairing string to one named wallet, or nothing
 * where that wallet publishes no way to be reached.
 */
export function walletPairingLink (id: string, uri: string): string | undefined {
	const base = PAIRING_LINKS[id]
	if (!base) {
		return undefined
	}
	// `<link>/wc?uri=<encoded>` is the shape WalletConnect settled on and every
	// link above is published to be used that way, trailing slash included or
	// not, so the only thing to normalise is the slash.
	const prefix = base.endsWith('/') ? base : `${base}/`
	return `${prefix}wc?uri=${encodeURIComponent(uri)}`
}

/**
 * The link that opens this checkout in one wallet, or nothing if that wallet
 * has no known one.
 */
export function walletDeepLink (
	id: string,
	url: string,
	platform: MobileOS | undefined = mobileOS(),
): string | undefined {
	const build = DEEP_LINKS[id]
	if (!build) {
		return undefined
	}
	try {
		return build(url, platform)
	} catch {
		// new URL() on something that is not a URL. Nothing to offer.
		return undefined
	}
}
