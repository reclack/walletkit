import {
	createWalletKit,
	DEFAULT_WALLETCONNECT_PROJECT_ID,
	type WalletEntry,
} from '../src/index.js'
import type { ReclackConnectElement } from '../src/element/element.js'
import '../src/element/index.js'

const catalog: WalletEntry[] = [
	{ id: 'metamask', name: 'MetaMask', installUrl: 'https://metamask.io', engines: [{ id: 'evm', rdns: ['io.metamask'] }] },
	{ id: 'brave', name: 'Brave Wallet', installUrl: 'https://brave.com', engines: [{ id: 'evm', rdns: ['com.brave.wallet'] }] },
	{ id: 'phantom', name: 'Phantom', installUrl: 'https://phantom.app', engines: [{ id: 'evm', rdns: ['app.phantom'] }, { id: 'svm' }] },
	{ id: 'backpack', name: 'Backpack', installUrl: 'https://backpack.app', engines: [{ id: 'svm' }] },
	{ id: 'coinbase', name: 'Coinbase Wallet', installUrl: 'https://coinbase.com/wallet', engines: [{ id: 'evm', rdns: ['com.coinbase.wallet'] }] },
	{ id: 'binance', name: 'Binance Wallet', installUrl: 'https://binance.com', engines: [{ id: 'evm' }] },
	{ id: 'trust', name: 'Trust Wallet', installUrl: 'https://trustwallet.com', engines: [{ id: 'evm' }] },
	{ id: 'okx', name: 'OKX Wallet', installUrl: 'https://okx.com/web3', engines: [{ id: 'evm' }] },
	{ id: 'rainbow', name: 'Rainbow', installUrl: 'https://rainbow.me', engines: [{ id: 'evm' }] },
	{ id: 'safe', name: 'Safe', installUrl: 'https://safe.global', browser: false, engines: [{ id: 'evm' }] },
]

/**
 * Mount, unmount, mount again, all on one shared kit.
 *
 * What a dialog opened, closed and opened again does to the element, which is
 * where the catalogue went missing: the second opening listed only the
 * wallets this browser could see for itself.
 */
const slot = document.querySelector('#slot')
if (slot) {
	// The real case: the catalogue is fetched, not handed over. A stub so the
	// page needs no network, delayed so the first opening happens while it is
	// still in flight, exactly as it does on a real page.
	const rows = [{ name: 'wallets', value: catalog.map((w) => ({
		id: w.id, name: w.name, install_url: w.installUrl, engines: w.engines,
	})) }]
	globalThis.fetch = (async () => {
		await new Promise((resolve) => setTimeout(resolve, 120))
		return { ok: true, json: async () => rows } as unknown as Response
	}) as typeof fetch

	const shared = createWalletKit({ assetBase: './assets/' })
	const log = document.createElement('pre')
	document.body.append(log)

	const open = (round: string, after: () => void) => {
		const element = document.createElement('reclack-connect') as ReclackConnectElement
		element.setAttribute('variant', 'inline')
		slot.append(element)
		// A framework assigns properties after insertion, which is the order
		// that matters: the element has already made a kit of its own by now.
		element.kit = shared
		log.textContent += `${round} at once: shared=${element.kit === shared} shadow=${element.shadowRoot?.innerHTML.length ?? 0}\n`
		const seen = new Set<unknown>([element.kit])
		const watch = window.setInterval(() => {
			if (!seen.has(element.kit)) {
				seen.add(element.kit)
				log.textContent += `${round} SWAPPED KIT (${seen.size} seen)\n`
			}
		}, 20)
		setTimeout(() => {
			window.clearInterval(watch)
			const state = element.kit.getState()
			log.textContent += `${round}: catalog=${state.catalog.length} loaded=${state.catalogLoaded} shared=${element.kit === shared} rows=${element.shadowRoot?.querySelectorAll('.wallet-row,.wallet-more-button').length ?? 0} shadow=${element.shadowRoot?.innerHTML.length ?? 0} evm=${state.evm.available.length}\n`
			element.remove()
			after()
		}, 400)
	}

	open('open 1', () => open('open 2', () => open('open 3', () => undefined)))
}

const report = document.createElement('pre')
report.id = 'report'
report.style.cssText = 'grid-column:1/-1;font:12px ui-monospace;white-space:pre-wrap;color:#b42318'
document.body.append(report)
const say = (line: string) => { report.textContent += `${line}\n` }
window.addEventListener('error', (event) => say(`ERROR ${event.message}`))

try {
	for (const node of document.querySelectorAll('reclack-connect[data-shared]')) {
		const element = node as ReclackConnectElement
		element.useKit(createWalletKit({
			catalog,
			assetBase: './assets/',
			// A page opened from disk has an origin of "null"; the relay is
			// told the origin this is standing in for.
			walletConnect: {
				projectId: DEFAULT_WALLETCONNECT_PROJECT_ID,
				metadata: {
					name: 'Reclack',
					description: 'Pay using stablecoins',
					url: 'http://localhost:5175',
					icons: ['http://localhost:5175/apple-touch-icon.png'],
				},
			},
		}))
	}
	say('kits attached')
} catch (failure) {
	say(`THREW ${(failure as Error).message}\n${(failure as Error).stack}`)
}

// The dashboard sets the rest of its tokens as a theme object, which is what
// a host with more than four values to pass does.
const dashboard = document.querySelector('#dashboard') as ReclackConnectElement | null
if (dashboard) {
	dashboard.theme = {
		mode: 'light',
		brand: '#533afd',
		surface: '#ffffff',
		ground: '#f8f8fa',
		plate: '#f8f8fa',
		ink: '#101014',
		inkMuted: '#6b6b76',
		line: '#e5e5ea',
		ok: '#22c55e',
		danger: '#ef4444',
		fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
	}
}

/**
 * Walks the picker into a view a screenshot could not otherwise reach.
 *
 * The all-wallets grid and the hand-off panel are both two presses in, and
 * both are where a dark theme is most likely to be wrong: one has a
 * scrollbar, the other a two-way switch.
 */
function drive (step: string) {
	const host = document.querySelector('reclack-connect') as ReclackConnectElement | null
	const root = host?.shadowRoot
	if (!root) {
		return
	}
	if (step === '#all') {
		root.querySelector<HTMLButtonElement>('.wallet-search-row')?.click()
	}
	if (step === '#hover') {
		// Hover cannot be screenshotted, so the wash is painted on directly:
		// whatever colour comes out is the colour a pointer would produce.
		for (const row of root.querySelectorAll<HTMLElement>('.wallet-row')) {
			row.style.background = 'var(--rkw-hover)'
		}
	}
	if (step.startsWith('#wallet=')) {
		// What the console said is the test: choosing a relay wallet used to
		// re-enter Preact on a tree it was already committing, which threw
		// "insertBefore ... not a child" over and over and then ran out of
		// stack. None of that reaches the screen; it just stops.
		const failures: string[] = []
		window.addEventListener('error', (e) => failures.push(e.message))
		window.addEventListener('unhandledrejection', (e) => failures.push(String((e as PromiseRejectionEvent).reason)))
		;(globalThis as any).__failures = failures
		// A named wallet rather than the first row: the relay path is only
		// reached by wallets that inject nothing, and those are never first.
		const want = decodeURIComponent(step.slice('#wallet='.length)).toLowerCase()
		const rows = [...root.querySelectorAll<HTMLButtonElement>('.wallet-row')]
		const row = rows.find((r) => (r.textContent ?? '').toLowerCase().includes(want))
		if (row) {
			row.click()
		} else {
			root.querySelector<HTMLButtonElement>('.wallet-search-row')?.click()
			window.setTimeout(() => {
				const tiles = [...root.querySelectorAll<HTMLButtonElement>('.wallet-tile')]
				tiles.find((t) => (t.textContent ?? '').toLowerCase().includes(want))?.click()
			}, 120)
		}
		// What the panel ended up saying, which is the whole question.
		window.setTimeout(() => {
			const panel = root.querySelector('.connect-panel, .wallet-dialog-body')
			const report = document.createElement('pre')
			report.id = 'relay'
			const failures = ((globalThis as any).__failures ?? []) as string[]
			report.textContent = `errors=${failures.length} ${failures.slice(0, 2).join(' | ')} `
				+ `qr=${root.querySelectorAll('.qr svg, .qr-frame svg').length} `
				+ `text=${(panel?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)}`
			document.body.append(report)
		}, 9000)
	}
	if (step === '#panel') {
		root.querySelector<HTMLButtonElement>('.wallet-row')?.click()
	}
}

if (location.hash) {
	setTimeout(() => drive(location.hash), 200)
}

setTimeout(() => {
	for (const node of document.querySelectorAll('reclack-connect')) {
		const element = node as ReclackConnectElement
		const state = element.kit.getState()
		const style = getComputedStyle(element)
		say(`[${element.getAttribute('theme-mode')}] brand=${style.getPropertyValue('--rkw-brand')} hover=${style.getPropertyValue('--rkw-hover')}`)
	}
}, 400)
