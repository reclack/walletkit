import { h, render } from 'preact'

import styles from './styles.css?inline'
import { ConnectApp, type Variant } from './ui/app.js'
import {
	applyTheme,
	createWalletKit,
	subscribeScheme,
	type ColorScheme,
	type ChainFamily,
	type ConnectRequest,
	type ConnectResult,
	type Intent,
	type WalletKit,
	type WalletKitOptions,
	type WalletKitTheme,
} from '@reclack/walletkit'

/**
 * `<reclack-connect>`: the wallet picker as an element.
 *
 * A custom element rather than a component, because the pages that need it
 * are not all React. A merchant's dashboard, a partner's checkout and a plain
 * HTML page all create elements; only one of them has a framework in common
 * with us. Everything here is the platform: an element, attributes, events
 * and a shadow root.
 *
 * The renderer inside is Preact, bundled. That is an implementation detail no
 * host installs, imports or can collide with.
 */
export class ReclackConnectElement extends HTMLElement {
	static readonly tagName = 'reclack-connect'

	static get observedAttributes (): string[] {
		return [
			'family',
			'chain-id',
			'intent',
			'keep-alive',
			'variant',
			'theme-mode',
			'asset-base',
			'api-url',
			'brand',
			'radius',
			'font',
		]
	}

	#kit: WalletKit | undefined
	/** Set when the element made its own kit, so it can also destroy it. */
	#owned = true

	/**
	 * The kit this element drives.
	 *
	 * Made on first use rather than in the constructor, so the attributes
	 * that configure it have been parsed by the time it is built: an element
	 * written in HTML has its attributes set after construction, and a kit
	 * made too early would have read none of them.
	 *
	 * A host with several pickers on a page, or one that already holds a
	 * connection, passes its own through `useKit`: discovery is a window
	 * listener and a catalogue fetch, and a second kit runs both again to
	 * answer the same question.
	 */
	/**
	 * Hands this element a kit to share, as a property.
	 *
	 * A property rather than only `useKit`, because that is what a framework
	 * can set: React and Preact both create the element, set properties, and
	 * only then insert it, so a kit assigned this way is in place before the
	 * element mounts and no throwaway kit is ever built.
	 */
	set kit (kit: WalletKit) {
		this.useKit(kit)
	}

	get kit (): WalletKit {
		if (!this.#kit) {
			this.#kit = createWalletKit({
				assetBase: this.getAttribute('asset-base') ?? undefined,
				apiUrl: this.getAttribute('api-url') ?? undefined,
			})
		}
		return this.#kit
	}

	#request: ConnectRequest = { intent: ['address'] }
	#theme: WalletKitTheme | undefined

	/**
	 * What the caller wants out of connecting.
	 *
	 * A property rather than only attributes, because an intent carries a
	 * list and an asset, and an attribute carries a string. Attributes cover
	 * the simple case; this covers the rest.
	 */
	set request (request: ConnectRequest) {
		this.#request = request
		if (this.#mounted) {
			this.#render()
		}
	}

	get request (): ConnectRequest {
		return this.#request
	}

	/**
	 * Colours, corner radius, type and light or dark.
	 *
	 * An accessor rather than a field, and that is load-bearing. A framework
	 * can only assign a property once it holds the element, which is after it
	 * has been inserted and `connectedCallback` has run. A plain field would
	 * be set too late for anything to notice, and the picker would keep
	 * whatever the attributes said: absent a `theme-mode`, that is `system`,
	 * so a theme pinned to light rendered dark on anyone's dark machine.
	 */
	set theme (theme: WalletKitTheme | undefined) {
		this.#theme = theme
		if (this.#mounted) {
			// Re-subscribed rather than recomputed: the mode may have moved
			// to or from `system`, which changes whether the reader's own
			// setting is being followed at all.
			this.#watchScheme()
			this.#render()
		}
	}

	get theme (): WalletKitTheme | undefined {
		return this.#theme
	}

	#root: ShadowRoot
	#mounted = false
	#unsubscribe: (() => void) | undefined
	/**
	 * Light or dark, resolved from this element's own theme rather than from
	 * the kit's.
	 *
	 * The kit carries a theme too, for a host that renders its own markup
	 * from the kit's state. An element must not read it: several pickers can
	 * share one kit, a dashboard may show a light one in a panel and a dark
	 * one in a drawer, and a scheme taken from the kit would give them both
	 * whichever theme the kit happened to hold.
	 */
	#scheme: ColorScheme = 'light'
	#stopScheme: (() => void) | undefined
	/** A paint is already scheduled, so further requests can be dropped. */
	#painting = false

	/** What this element's mode resolved to, for a host that wants to match it. */
	get scheme (): ColorScheme {
		return this.#scheme
	}

	constructor () {
		super()
		this.#root = this.attachShadow({ mode: 'open' })
		adoptStyles(this.#root)
		keepScrollInside(this.#root)
	}

	connectedCallback () {
		this.#mounted = true
		// Deferred by a microtask rather than run now, so that a framework
		// assigning `kit` during the same commit gets there first. Reading
		// `this.kit` here would build one of our own every single time the
		// element mounts, and each one opens a catalogue request that is
		// thrown away a moment later.
		queueMicrotask(() => {
			if (!this.#mounted || this.#unsubscribe) {
				return
			}
			this.#start()
		})
	}

	#start () {
		this.#unsubscribe = this.kit.subscribe(() => this.#onKitChange())
		// The theme is set on the element itself rather than inside the
		// shadow root, so a host can override any single token from its own
		// stylesheet without reaching into our markup.
		this.#watchScheme()
		this.#render()
	}

	disconnectedCallback () {
		this.#mounted = false
		this.#unsubscribe?.()
		this.#unsubscribe = undefined
		this.#stopScheme?.()
		this.#stopScheme = undefined
		render(null, this.#root)
		// Not when the caller asked to keep the connection: destroying the
		// kit would drop the provider they are about to sign with.
		if (this.#owned && !this.#currentRequest().keepAlive) {
			this.kit.destroy()
		}
	}

	attributeChangedCallback () {
		if (!this.#mounted) {
			return
		}
		// Re-subscribed rather than recomputed: the mode may have moved to or
		// from `system`, which changes whether the reader's own setting is
		// being followed at all.
		this.#watchScheme()
		this.#render()
	}

	/** Hands this element a kit to share instead of the one it would make. */
	useKit (kit: WalletKit): void {
		if (this.#owned) {
			this.#kit?.destroy()
		}
		this.#kit = kit
		this.#owned = false
		if (this.#mounted) {
			this.#unsubscribe?.()
			this.#unsubscribe = undefined
			this.#start()
		}
	}

	/** The theme this element last drew with, to notice when the kit's moves. */
	#drawnTheme: WalletKitTheme | undefined

	#onKitChange () {
		// A picker with no theme of its own wears the kit's, so a branded
		// checkout sets it once and every picker follows. Compared by
		// identity: a theme is replaced, not edited.
		const current = this.#theme ?? this.kit.getState().theme
		if (current !== this.#drawnTheme) {
			this.#watchScheme()
		}
		this.#render()
	}

	#watchScheme () {
		this.#stopScheme?.()
		const theme = this.#themeFromAttributes()
		// The source, not the derived object: a theme built from attributes
		// is a fresh object every call, so comparing that would rebuild the
		// subscription and rewrite every token on every kit notification.
		this.#drawnTheme = this.#theme ?? this.#kit?.getState().theme
		this.#stopScheme = subscribeScheme(theme?.mode, (scheme) => {
			this.#scheme = scheme
			// The tokens are set on the element, not inside the shadow root,
			// so a host can still override any single one of them from its
			// own stylesheet without reaching into our markup.
			applyTheme(this, theme, scheme)
		})
	}

	/**
	 * The theme, from the property when a host set one and from attributes
	 * otherwise.
	 *
	 * Attributes carry the four values a plain HTML page is likely to want.
	 * Anything more detailed is a property, because an attribute cannot hold
	 * a per-mode override.
	 */
	#themeFromAttributes (): WalletKitTheme | undefined {
		if (this.#theme) {
			return this.#theme
		}
		// The page's own, when it has one. A checkout that themes its kit
		// should not also have to theme every picker in it.
		const shared = this.#kit?.getState().theme
		if (shared) {
			return shared
		}
		const mode = this.getAttribute('theme-mode')
		const theme: WalletKitTheme = {
			mode: mode === 'light' || mode === 'dark' ? mode : 'system',
			brand: this.getAttribute('brand') ?? undefined,
			radius: this.getAttribute('radius') ?? undefined,
			fontFamily: this.getAttribute('font') ?? undefined,
		}
		return theme
	}

	#currentRequest (): ConnectRequest {
		const attribute = this.getAttribute('intent')
		const intent = attribute
			? (attribute
				.split(',')
				.map((part) => part.trim())
				.filter((part) => part === 'address' || part === 'balance') as Intent[])
			: this.#request.intent
		const family = this.getAttribute('family')
		const chainId = this.getAttribute('chain-id')
		return {
			...this.#request,
			intent: intent.length > 0 ? intent : ['address'],
			family:
				family === 'evm' || family === 'svm'
					? (family as ChainFamily)
					: this.#request.family,
			chainId: chainId ? Number(chainId) : this.#request.chainId,
			keepAlive: this.hasAttribute('keep-alive') || this.#request.keepAlive,
		}
	}

	#variant (): Variant {
		return this.getAttribute('variant') === 'modal' ? 'modal' : 'inline'
	}

	/**
	 * Asks for a paint, which happens at the end of the task.
	 *
	 * Never synchronously, and that is the whole point. The kit notifies its
	 * listeners the moment anything changes, and some of those changes are
	 * made from inside this tree's own effects: choosing a relay wallet calls
	 * connectRemote, which sets `connecting` before it awaits anything. A
	 * synchronous render here re-entered Preact on a tree it was already
	 * committing, which threw "the node before which the new node is to be
	 * inserted is not a child of this node" a hundred times over and then ran
	 * out of stack. On screen that was a spinner that never resolved.
	 *
	 * Coalesced as well as deferred: a burst of changes is one paint.
	 */
	#render () {
		if (this.#painting) {
			return
		}
		this.#painting = true
		queueMicrotask(() => {
			this.#painting = false
			// The element may have been taken out of the document between the
			// request and the paint, and its tree is already gone.
			if (this.#mounted) {
				this.#paint()
			}
		})
	}

	#paint () {
		render(
			h(ConnectApp, {
				kit: this.kit,
				request: this.#currentRequest(),
				variant: this.#variant(),
				onResult: (result: ConnectResult) => this.#emit('connect', result),
				onError: (message: string) => this.#emit('connect-error', { message }),
				onClose: () => this.#emit('cancel', undefined),
			}),
			this.#root,
		)
	}

	// Composed, so a listener on an ancestor hears it: an element inside a
	// shadow root is usually inside somebody else's component too.
	#emit (name: string, detail: unknown) {
		this.dispatchEvent(
			new CustomEvent(name, { detail, bubbles: true, composed: true }),
		)
	}
}

let sheet: CSSStyleSheet | undefined

/**
 * Puts the stylesheet in the shadow root.
 *
 * One constructed sheet shared by every instance, so a page with several
 * pickers parses the CSS once. A `<style>` element where that is not
 * supported, which costs a parse per element and is correct everywhere.
 */
function adoptStyles (root: ShadowRoot) {
	if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in root) {
		if (!sheet) {
			sheet = new CSSStyleSheet()
			sheet.replaceSync(styles)
		}
		root.adoptedStyleSheets = [sheet]
		return
	}
	const style = document.createElement('style')
	style.textContent = styles
	root.append(style)
}

/** Registers the element, once, under its own name. */
export function defineWalletElement (
	tagName: string = ReclackConnectElement.tagName,
): void {
	if (typeof customElements === 'undefined' || customElements.get(tagName)) {
		return
	}
	customElements.define(tagName, ReclackConnectElement)
}

export interface ConnectWalletOptions extends ConnectRequest {
	/** A kit to share rather than one made for this prompt. */
	kit?: WalletKit
	/** Options for the kit this prompt makes, when it is making one. */
	kitOptions?: WalletKitOptions
	theme?: WalletKitTheme
	/** Where to mount. A detached element on `document.body` by default. */
	container?: HTMLElement
}

/**
 * Opens the picker and resolves with what the caller asked for.
 *
 * The whole point of the element for a host that only wants a value: filling
 * a settlement address should be one call, not an element, two listeners and
 * a piece of state.
 *
 * Rejects when the person closes it. That is a refusal, not a failure, and a
 * caller that wants to ignore it can.
 */
export function connectWallet (
	options: ConnectWalletOptions = { intent: ['address'] },
): Promise<ConnectResult> {
	defineWalletElement()
	const { kit, kitOptions, theme, container, ...request } = options
	if (request.keepAlive && !kit && !kitOptions) {
		// The prompt tears its element down once it has an answer, and with
		// it the kit it made. A connection meant to outlive the prompt has to
		// belong to something that outlives it too.
		throw new Error(
			'connectWallet with keepAlive needs a kit of your own to keep the connection on.',
		)
	}
	const element = document.createElement(
		ReclackConnectElement.tagName,
	) as ReclackConnectElement

	if (kit) {
		element.useKit(kit)
	} else if (kitOptions) {
		element.useKit(createWalletKit(kitOptions))
	}
	element.request = request
	element.theme = theme
	element.setAttribute('variant', 'modal')

	const host = container ?? document.body
	host.append(element)

	return new Promise<ConnectResult>((resolve, reject) => {
		const done = (settle: () => void) => {
			element.remove()
			settle()
		}
		element.addEventListener('connect', (event) => {
			done(() => resolve((event as CustomEvent<ConnectResult>).detail))
		})
		element.addEventListener('cancel', () => {
			done(() => reject(new Error('The wallet prompt was closed.')))
		})
		element.addEventListener('connect-error', (event) => {
			const detail = (event as CustomEvent<{ message: string }>).detail
			done(() => reject(new Error(detail?.message ?? 'Could not connect.')))
		})
	})
}

/**
 * Keeps a scroll gesture over our own list from reaching the host page.
 *
 * A page that locks scrolling while a modal is open does it with a wheel
 * listener on the document that cancels anything not over a box it knows to
 * be scrollable. React modal libraries all do this. An event raised inside a
 * shadow root retargets to this element on its way out, so all that listener
 * ever sees is `<reclack-connect>`, which scrolls nothing, and it cancels the
 * gesture: the wallet list refuses to scroll inside somebody else's dialog.
 *
 * Stopped here, it never reaches them, and the browser scrolls the list the
 * way it would anywhere else. Nothing is cancelled, so a gesture that is not
 * over a scroller is left entirely alone.
 */
function keepScrollInside (root: ShadowRoot): void {
	const stop = (event: Event) => {
		if (scrollerIn(event)) {
			event.stopPropagation()
		}
	}
	root.addEventListener('wheel', stop)
	root.addEventListener('touchmove', stop)
}

/** The first element under the gesture that has somewhere left to scroll. */
function scrollerIn (event: Event): boolean {
	for (const node of event.composedPath()) {
		if (!(node instanceof Element)) {
			return false
		}
		if (node.scrollHeight <= node.clientHeight) {
			continue
		}
		const overflow = getComputedStyle(node).overflowY
		if (overflow === 'auto' || overflow === 'scroll') {
			return true
		}
	}
	return false
}
