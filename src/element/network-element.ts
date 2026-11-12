import { h, render } from 'preact'

import { adoptStyles } from './element.js'
import { AssetProvider } from './ui/assets.js'
import { DEFAULT_LOGO_BASE } from '@reclack/walletkit'
import { NetworkSelect } from './ui/network-select.js'
import { applyTheme, subscribeScheme } from '@reclack/walletkit'
import type { WalletKit, WalletKitTheme } from '@reclack/walletkit'

/**
 * The chain picker, as an element of its own.
 *
 * Separate from `<reclack-connect>` because the two answer different
 * questions and a page often wants one without the other: a checkout asks
 * which chain before it asks which wallet, and a dashboard form asks which
 * chain an address is for without connecting anything at all.
 */
export class ReclackNetworkElement extends HTMLElement {
	static tagName = 'reclack-network'

	static get observedAttributes (): string[] {
		return ['networks', 'value', 'disabled', 'label', 'asset-base', 'theme-mode', 'brand', 'radius', 'font']
	}

	readonly #root: ShadowRoot
	#mounted = false
	#theme?: WalletKitTheme
	#kit?: WalletKit
	#unsubscribe?: () => void
	#stopScheme?: () => void

	constructor () {
		super()
		this.#root = this.attachShadow({ mode: 'open' })
		adoptStyles(this.#root)
	}

	/**
	 * A kit to take the theme from.
	 *
	 * The wallet picker reads its theme from the kit it is given, and a page
	 * showing both should not have to theme them separately: a chain picker
	 * in the system's dark while the wallets beside it are light is the
	 * giveaway that it was never told.
	 */
	set kit (kit: WalletKit | undefined) {
		this.#unsubscribe?.()
		this.#kit = kit
		this.#unsubscribe = kit?.subscribe(() => {
			if (this.#mounted) {
				this.#watchScheme()
				this.#paint()
			}
		})
		if (this.#mounted) {
			this.#watchScheme()
			this.#paint()
		}
	}

	get kit (): WalletKit | undefined {
		return this.#kit
	}

	/** The full theme, for anything an attribute cannot hold. */
	set theme (theme: WalletKitTheme | undefined) {
		this.#theme = theme
		if (this.#mounted) {
			this.#watchScheme()
			this.#paint()
		}
	}

	/** The chain currently chosen, which is also settable. */
	get value (): string {
		return this.getAttribute('value') ?? this.#networks()[0] ?? ''
	}

	set value (network: string) {
		this.setAttribute('value', network)
	}

	connectedCallback () {
		this.#mounted = true
		this.#watchScheme()
		this.#paint()
	}

	disconnectedCallback () {
		this.#mounted = false
		this.#stopScheme?.()
		this.#stopScheme = undefined
		this.#unsubscribe?.()
		this.#unsubscribe = undefined
		render(null, this.#root)
	}

	attributeChangedCallback () {
		if (!this.#mounted) {
			return
		}
		this.#watchScheme()
		this.#paint()
	}

	#networks (): string[] {
		return (this.getAttribute('networks') ?? '')
			.split(',')
			.map((name) => name.trim())
			.filter(Boolean)
	}

	#themeFromAttributes (): WalletKitTheme | undefined {
		if (this.#theme) {
			return this.#theme
		}
		// The page's own, when it has one. A host that themed its kit should
		// not also have to theme every picker in it.
		const shared = this.#kit?.getState().theme
		if (shared) {
			return shared
		}
		const mode = this.getAttribute('theme-mode')
		return {
			mode: mode === 'light' || mode === 'dark' ? mode : 'system',
			brand: this.getAttribute('brand') ?? undefined,
			radius: this.getAttribute('radius') ?? undefined,
			fontFamily: this.getAttribute('font') ?? undefined,
		}
	}

	#watchScheme () {
		this.#stopScheme?.()
		const theme = this.#themeFromAttributes()
		this.#stopScheme = subscribeScheme(theme?.mode, (scheme) => {
			applyTheme(this, theme, scheme)
		})
	}

	#paint () {
		const networks = this.#networks()
		// `h`, not a direct call: invoking a component as a function runs its
		// hooks outside a render and the tree comes back empty.
		render(
			h(AssetProvider, {
				base: this.getAttribute('asset-base') ?? DEFAULT_LOGO_BASE,
				children: h(NetworkSelect, {
					networks,
					value: this.value,
					disabled: this.hasAttribute('disabled'),
					label: this.getAttribute('label') ?? undefined,
					onChange: (network: string) => {
						this.setAttribute('value', network)
						// Composed, so a listener on an ancestor hears it
						// through the shadow boundary, exactly as `connect`
						// is heard from the picker.
						this.dispatchEvent(new CustomEvent('change', {
							detail: { network },
							bubbles: true,
							composed: true,
						}))
					},
				}),
			}),
			this.#root,
		)
	}
}

export function defineNetworkElement (
	tagName: string = ReclackNetworkElement.tagName,
): void {
	if (typeof customElements === 'undefined' || customElements.get(tagName)) {
		return
	}
	customElements.define(tagName, ReclackNetworkElement)
}
