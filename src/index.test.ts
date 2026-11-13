import { describe, expect, it, vi } from 'vitest'

import { addressWord, bytes32, calldata, word } from './abi.js'
import { shortAddress } from './address.js'
import { formatUnits } from './balance.js'
import { fetchWalletCatalog, walletCatalogUrl } from './catalog-fetch.js'
import { engineOf, walletsFor, type WalletEntry } from './catalog.js'
import { createWalletKit } from './kit.js'
import { CHAINS, explorerTxUrl } from './chains.js'
import { walletLogo } from './icons.js'
import { networkLabel, networkLogo } from './networks.js'
import {
	applyTheme,
	readableInk,
	safeColor,
	themeCss,
	themeVariables,
} from './theme.js'

describe('formatUnits', () => {
	// The point of the bigint is that none of these go through a float. The
	// last two are the cases a division would quietly get wrong.
	it('places the point without arithmetic on a Number', () => {
		expect(formatUnits(1234567n, 6)).toBe('1.234567')
		expect(formatUnits(1000000n, 6)).toBe('1')
		expect(formatUnits(1n, 6)).toBe('0.000001')
		expect(formatUnits(0n, 6)).toBe('0')
		expect(formatUnits(100n, 0)).toBe('100')
	})

	it('keeps every digit of an amount no float could hold', () => {
		expect(formatUnits(123456789012345678901234567890n, 18)).toBe(
			'123456789012.34567890123456789',
		)
	})

	it('signs a negative without losing the point', () => {
		expect(formatUnits(-1500000n, 6)).toBe('-1.5')
	})
})

describe('shortAddress', () => {
	it('keeps both ends, because both carry meaning', () => {
		expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(
			'0x1234…5678',
		)
	})

	it('leaves anything too short to shorten alone', () => {
		expect(shortAddress('0x1234')).toBe('0x1234')
		expect(shortAddress('')).toBeUndefined()
		expect(shortAddress(undefined)).toBeUndefined()
	})
})

describe('abi', () => {
	// Pinned selectors, regenerated with `cast sig`. The encoder is a few
	// lines of string work precisely so these can be asserted rather than
	// trusted.
	it('left-pads values to a word', () => {
		expect(word(1n)).toBe(`${'0'.repeat(63)}1`)
		expect(word(0n)).toBe('0'.repeat(64))
	})

	it('refuses an address that is not one', () => {
		expect(() => addressWord('0xnope')).toThrow('invalid address')
		expect(() => addressWord('1234567890abcdef1234567890abcdef12345678')).toThrow()
	})

	it('right-pads bytes32, the one argument that is not left-aligned', () => {
		expect(bytes32('0xab')).toBe(`ab${'0'.repeat(62)}`)
	})

	it('refuses a value too large for a word', () => {
		expect(() => word(2n ** 256n)).toThrow('does not fit')
		expect(() => word(-1n)).toThrow('negative')
	})

	it('joins a selector to its words', () => {
		expect(calldata('0x70a08231', [word(1n)])).toBe(
			`0x70a08231${'0'.repeat(63)}1`,
		)
	})
})

describe('walletLogo', () => {
	it('joins the filename to whatever base the host serves from', () => {
		expect(walletLogo('metamask')).toBe('/images/metamask.webp')
		expect(walletLogo('metamask', '/assets/wallets')).toBe(
			'/assets/wallets/metamask.webp',
		)
		expect(walletLogo('metamask', '/assets/wallets/')).toBe(
			'/assets/wallets/metamask.webp',
		)
	})

	it('has nothing for a wallet it carries no artwork for', () => {
		expect(walletLogo('io.example.unknown')).toBeUndefined()
	})
})

describe('networks', () => {
	it('knows Arc, and a testnet wears its mainnet mark', () => {
		expect(networkLogo('arc')).toBe('/images/arc.webp')
		expect(networkLogo('arc-testnet')).toBe('/images/arc.webp')
		expect(networkLabel('arc-testnet')).toBe('Arc Testnet')
	})

	it('offers a wallet the right chain, gas token and all', () => {
		// Arc charges gas in USDC, so a wallet told it is ETH would price
		// every fee against the wrong unit.
		expect(CHAINS[5042]?.nativeCurrency.symbol).toBe('USDC')
		expect(CHAINS[5042002]?.chainName).toBe('Arc Testnet')
		expect(explorerTxUrl(5042, '0xabc')).toBe('https://explorer.arc.io/tx/0xabc')
	})
})

function respondWith (value: unknown) {
	return vi.fn(async () =>
		({
			ok: true,
			json: async () => [{ name: 'wallets', value }],
		}) as unknown as Response)
}

describe('fetchWalletCatalog', () => {
	it('renames install_url, which a cast never did at runtime', async () => {
		vi.stubGlobal(
			'fetch',
			respondWith([
				{ id: 'metamask', name: 'MetaMask', install_url: 'https://metamask.io', engines: [] },
			]),
		)
		const [entry] = await fetchWalletCatalog('https://api.test/v1/configurations')
		expect(entry?.installUrl).toBe('https://metamask.io')
	})

	it('reads rdns written as a bare string, which rows predating the list still are', async () => {
		vi.stubGlobal(
			'fetch',
			respondWith([
				{
					id: 'metamask',
					name: 'MetaMask',
					engines: [{ id: 'evm', rdns: 'io.metamask' }],
				},
			]),
		)
		const [entry] = await fetchWalletCatalog('https://api.test/v1/configurations')
		expect(engineOf(entry as WalletEntry, 'evm')?.rdns).toEqual(['io.metamask'])
	})

	it('drops a row that is not a wallet rather than carrying a half one', async () => {
		vi.stubGlobal('fetch', respondWith([{ name: 'No id' }, null, 7]))
		expect(await fetchWalletCatalog('https://api.test/x')).toEqual([])
	})

	it('answers with an empty catalogue rather than throwing', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => {
			throw new Error('offline')
		}))
		expect(await fetchWalletCatalog('https://api.test/x')).toEqual([])
	})

	it('builds the configuration url without doubling the slash', () => {
		expect(walletCatalogUrl('https://api.test/')).toBe(
			'https://api.test/v1/configurations?name=wallets',
		)
	})
})

describe('walletsFor', () => {
	const catalog: WalletEntry[] = [
		{ id: 'metamask', name: 'MetaMask', installUrl: '', engines: [{ id: 'evm' }] },
		{ id: 'phantom', name: 'Phantom', installUrl: '', engines: [{ id: 'evm' }, { id: 'svm' }] },
		{ id: 'solflare', name: 'Solflare', installUrl: '', engines: [{ id: 'svm' }] },
	]

	it('keeps the catalogue order rather than whichever answered first', () => {
		expect(walletsFor(catalog, 'svm').map((w) => w.id)).toEqual([
			'phantom',
			'solflare',
		])
	})
})

describe('createWalletKit', () => {
	it('touches no window before anybody subscribes', () => {
		// The guarantee that makes this importable on a server.
		expect(() => createWalletKit()).not.toThrow()
	})

	it('refuses an intent asking for the balance of nothing', async () => {
		const kit = createWalletKit()
		await expect(
			kit.resolveIntent('evm', { intent: ['balance'] }),
		).rejects.toThrow('needs at least one asset')
	})

	it('reports no connection rather than resolving an empty result', async () => {
		const kit = createWalletKit()
		await expect(kit.resolveIntent('evm', { intent: ['address'] })).rejects.toThrow(
			'No wallet is connected',
		)
	})

	it('pairs over the relay without being configured to', () => {
		// The point of the defaults: a kit created with no options is a
		// working one, relay wallets included.
		expect(createWalletKit().canPairRemotely()).toBe(true)
	})

	it('offers no relay pairing when a host overrides the id with nothing', () => {
		expect(
			createWalletKit({ walletConnect: { projectId: ' ' } }).canPairRemotely(),
		).toBe(false)
	})
})

describe('theme', () => {
	it('falls back to the defaults for anything not given', () => {
		const vars = themeVariables(undefined, 'light')
		expect(vars['--rkw-surface']).toBe('#ffffff')
		expect(vars['--rkw-ink']).toBe('#101014')
		expect(vars['--rkw-radius']).toBe('10px')
	})

	it('picks the dark step rather than inverting the light one', () => {
		expect(themeVariables(undefined, 'dark')['--rkw-surface']).toBe('#16161a')
	})

	it('takes a host colour in both modes, because it is their brand', () => {
		const theme = { brand: '#ff6600' }
		expect(themeVariables(theme, 'light')['--rkw-brand']).toBe('#ff6600')
		expect(themeVariables(theme, 'dark')['--rkw-brand']).toBe('#ff6600')
	})

	it('layers a mode override on top of the shared tokens', () => {
		const vars = themeVariables(
			{ brand: '#ff6600', dark: { surface: '#000000' } },
			'dark',
		)
		expect(vars['--rkw-surface']).toBe('#000000')
		expect(vars['--rkw-brand']).toBe('#ff6600')
	})

	it('computes readable text on the brand rather than asking for it', () => {
		// A pale brand needs dark text; the default indigo needs white.
		expect(themeVariables({ brand: '#ffe066' }, 'light')['--rkw-brand-ink'])
			.toBe('#101014')
		expect(themeVariables({ brand: '#533afd' }, 'light')['--rkw-brand-ink'])
			.toBe('#ffffff')
		expect(readableInk('#ffffff')).toBe('#101014')
	})

	it('drops a colour it cannot read rather than writing it into a style', () => {
		// The embedded checkout takes branding from a response. None of these
		// may reach a declaration.
		for (const bad of ['red', 'rgb(1,2,3)', '#fff', '#12345g', 'blue; }', '']) {
			expect(safeColor(bad)).toBeUndefined()
		}
		expect(themeVariables({ surface: 'red; } body { display: none' }, 'light')['--rkw-surface'])
			.toBe('#ffffff')
	})

	it('refuses a radius or a font that is not one', () => {
		expect(themeVariables({ radius: '10' }, 'light')['--rkw-radius']).toBe('10px')
		expect(themeVariables({ radius: 'expression(x)' }, 'light')['--rkw-radius'])
			.toBe('10px')
		expect(themeVariables({ fontFamily: 'a{}b' }, 'light')['--rkw-font'])
			.toBeUndefined()
		expect(themeVariables({ fontFamily: 'Inter, sans-serif' }, 'light')['--rkw-font'])
			.toBe('Inter, sans-serif')
	})

	it('hovers grey until a host picks a colour', () => {
		// The default brand is Reclack's own. A page nobody has branded
		// hovering in it is somebody else's product wearing our colour.
		expect(themeVariables(undefined, 'light')['--rkw-hover'])
			.toBe('color-mix(in srgb, var(--rkw-ink-muted) 12%, transparent)')
		expect(themeVariables({ brand: '#ff6600' }, 'light')['--rkw-hover'])
			.toBe('color-mix(in srgb, var(--rkw-brand) 12%, transparent)')
		// A colour it cannot read is not a brand.
		expect(themeVariables({ brand: 'orange' }, 'light')['--rkw-hover'])
			.toBe('color-mix(in srgb, var(--rkw-ink-muted) 12%, transparent)')
	})

	it('inherits the page type when the host sets none', () => {
		expect(themeVariables(undefined, 'light')['--rkw-font']).toBeUndefined()
	})

	it('writes values through setProperty, never into a built string', () => {
		const written: Record<string, string> = {}
		applyTheme(
			{ style: { setProperty: (n: string, v: string) => { written[n] = v } } },
			{ brand: '#533afd' },
			'light',
		)
		expect(written['--rkw-brand']).toBe('#533afd')
		expect(written['--rkw-brand-ink']).toBe('#ffffff')
	})

	it('renders a declaration block for a stylesheet', () => {
		expect(themeCss({ brand: '#533afd' }, 'light')).toContain(':host {')
		expect(themeCss(undefined, 'dark', '.rkw')).toContain('.rkw {')
	})
})

describe('createWalletKit theme', () => {
	it('resolves an explicit mode before anybody subscribes', () => {
		// A server render reads the state without subscribing. Deferring this
		// to the first subscriber reported light while the host asked for
		// dark, which is a flash of the wrong palette on hydration.
		const kit = createWalletKit({ theme: { mode: 'dark', brand: '#ff6600' } })
		const state = kit.getState()
		expect(state.scheme).toBe('dark')
		expect(state.variables['--rkw-surface']).toBe('#16161a')
		expect(state.variables['--rkw-brand']).toBe('#ff6600')
	})

	it('re-resolves the mode when the theme is replaced', () => {
		const kit = createWalletKit({ theme: { mode: 'dark' } })
		kit.setTheme({ mode: 'light' })
		expect(kit.getState().scheme).toBe('light')
		expect(kit.getState().variables['--rkw-surface']).toBe('#ffffff')
	})

	it('recomputes when the theme is replaced, such as when branding lands', () => {
		const kit = createWalletKit()
		expect(kit.getState().variables['--rkw-brand']).toBe('#533afd')
		kit.setTheme({ brand: '#ff6600' })
		expect(kit.getState().variables['--rkw-brand']).toBe('#ff6600')
	})
})
