/**
 * How a host dresses the wallet picker.
 *
 * Tokens rather than class names or a stylesheet to override. A wallet picker
 * appears inside a merchant's checkout, a dashboard form and a partner's own
 * page, and the only thing those three agree on is that it should not look
 * like somebody else's component. Twelve values is the whole contract.
 *
 * Every value is validated rather than trusted, even though a host is usually
 * passing its own constants. In the embedded checkout the branding comes from
 * an API response, and a colour ends up inside a style: a page that takes
 * payment details must not interpolate whatever a response happens to carry.
 * An unreadable value is dropped and the default stands, which is a picker
 * that looks generic rather than one that does not render.
 */

/**
 * Light, dark, or whatever the reader's system says.
 *
 * `system` is the default. A picker that ignores the setting is a white
 * rectangle in a dark checkout.
 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** The resolved mode: what `system` turned out to mean. */
export type ColorScheme = 'light' | 'dark'

export interface ThemeTokens {
	/** The panel itself. */
	surface?: string
	/** Behind the panel. */
	ground?: string
	/** Rows and plates inside it, such as the square a wallet mark sits on. */
	plate?: string
	/** Primary text. */
	ink?: string
	/** Secondary text: captions, addresses, the word "Detected". */
	inkMuted?: string
	/** Hairlines and borders. */
	line?: string
	/** The host's own colour, worn by the primary action and the focus ring. */
	brand?: string
	/** Text on `brand`. Computed for contrast when not given. */
	brandInk?: string
	/** A refusal. */
	danger?: string
	/** A success. */
	ok?: string
	/** Corner radius, as a CSS length. */
	radius?: string
	/** The host's type, so the picker does not arrive in a different face. */
	fontFamily?: string
}

export interface WalletKitTheme extends ThemeTokens {
	mode?: ThemeMode
	/** Applied on top of the shared tokens when the resolved mode is dark. */
	dark?: ThemeTokens
	/** Applied on top of the shared tokens when the resolved mode is light. */
	light?: ThemeTokens
}

/**
 * The defaults, which are the hosted checkout's own.
 *
 * Dark is chosen rather than derived. Inverting a light palette gives muddy
 * greys and a brand colour that has stopped contrasting with anything; every
 * step here was picked against the surface it sits on.
 */
export const LIGHT_TOKENS: Required<Omit<ThemeTokens, 'brandInk' | 'fontFamily'>> = {
	surface: '#ffffff',
	ground: '#f6f7f9',
	plate: '#f6f7f9',
	ink: '#101014',
	inkMuted: '#6b6b76',
	line: '#e5e5ea',
	brand: '#533afd',
	danger: '#b42318',
	ok: '#12a150',
	radius: '10px',
}

export const DARK_TOKENS: Required<Omit<ThemeTokens, 'brandInk' | 'fontFamily'>> = {
	surface: '#16161a',
	ground: '#0e0e11',
	plate: '#1f1f26',
	ink: '#f4f4f6',
	inkMuted: '#9a9aa6',
	line: '#2b2b33',
	// Lifted off the light value, which goes nearly black against a dark
	// panel. A host that sets its own brand keeps it in both modes: it is
	// their colour, and second-guessing it is how a brand ends up wrong.
	brand: '#8b74ff',
	danger: '#f97066',
	ok: '#3ccb7f',
	radius: '10px',
}

/**
 * The stylesheet's name for each token.
 *
 * Prefixed, because these are set on an element a host also styles, and an
 * unprefixed `--surface` would silently take over or be taken over.
 */
const VARIABLE: Record<keyof ThemeTokens, string> = {
	surface: '--rkw-surface',
	ground: '--rkw-ground',
	plate: '--rkw-plate',
	ink: '--rkw-ink',
	inkMuted: '--rkw-ink-muted',
	line: '--rkw-line',
	brand: '--rkw-brand',
	brandInk: '--rkw-brand-ink',
	danger: '--rkw-danger',
	ok: '--rkw-ok',
	radius: '--rkw-radius',
	fontFamily: '--rkw-font',
}

/**
 * The wash under whatever is being pointed at.
 *
 * Grey until the host picks a colour, and that distinction is deliberate. The
 * default brand is Reclack's own, so a page nobody has branded would
 * otherwise hover in our indigo: somebody else's product, quietly wearing our
 * colour. The moment a host sets a brand it is theirs to hover in.
 *
 * Written as a reference to a token, never with the colour folded in, so
 * nothing a host or an API response supplied is interpolated into a value. A
 * twelfth reads as a hover on both a white panel and a dark one, which a
 * fixed grey does not.
 */
function hoverWash (branded: boolean): string {
	const token = branded ? '--rkw-brand' : '--rkw-ink-muted'
	return `color-mix(in srgb, var(${token}) 12%, transparent)`
}

const HEX = /^#[0-9a-f]{6}$/i
const LENGTH = /^\d+(\.\d+)?(px|rem|em|%)$/
// Letters, digits, spaces, quotes, commas and hyphens: everything a font
// stack is made of, and nothing that closes a declaration.
const FONT = /^[\w\s'",.-]{1,200}$/

/** A colour, or nothing where it is not one. */
export function safeColor (value: string | undefined): string | undefined {
	const trimmed = value?.trim().toLowerCase()
	return trimmed && HEX.test(trimmed) ? trimmed : undefined
}

function safeRadius (value: string | number | undefined): string | undefined {
	if (typeof value === 'number') {
		return Number.isFinite(value) && value >= 0 ? `${value}px` : undefined
	}
	const trimmed = value?.trim()
	return trimmed && LENGTH.test(trimmed) ? trimmed : undefined
}

function safeFont (value: string | undefined): string | undefined {
	const trimmed = value?.trim()
	return trimmed && FONT.test(trimmed) ? trimmed : undefined
}

/**
 * Black or white, whichever can actually be read on this colour.
 *
 * Relative luminance per WCAG, so a pale brand gets dark text instead of the
 * white that would leave the primary button unreadable. Computed rather than
 * configured: a host choosing this by eye gets it wrong, and the one place it
 * matters is the button somebody has to find.
 */
export function readableInk (hex: string): string {
	const channel = (from: number) => {
		const raw = Number.parseInt(hex.slice(from, from + 2), 16) / 255
		return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4
	}
	const luminance =
		0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
	return luminance > 0.45 ? '#101014' : '#ffffff'
}

/**
 * Every token for one mode, as the custom properties a stylesheet reads.
 *
 * Shared tokens first, then the mode's own overrides on top, so a host can
 * set one brand colour for both and a different surface for each.
 */
export function themeVariables (
	theme: WalletKitTheme | undefined,
	scheme: ColorScheme,
): Record<string, string> {
	const base = scheme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS
	const given: ThemeTokens = {
		...theme,
		...(scheme === 'dark' ? theme?.dark : theme?.light),
	}

	const variables: Record<string, string> = {}
	const colors = ['surface', 'ground', 'plate', 'ink', 'inkMuted', 'line', 'brand', 'danger', 'ok'] as const
	for (const token of colors) {
		variables[VARIABLE[token]] = safeColor(given[token]) ?? base[token]
	}
	variables[VARIABLE.radius] = safeRadius(given.radius) ?? base.radius

	// Only when the host has type of its own. Absent, the element inherits
	// whatever the page is already set in, which is almost always right.
	const font = safeFont(given.fontFamily)
	if (font) {
		variables[VARIABLE.fontFamily] = font
	}

	// Taken when given, computed when not: a host that sets a brand colour
	// should not also have to work out what reads on it.
	variables[VARIABLE.brandInk] =
		safeColor(given.brandInk) ?? readableInk(variables[VARIABLE.brand] as string)
	// Branded means the host said so, not that a brand token has a value:
	// every token always has one, and the default is ours.
	variables['--rkw-hover'] = hoverWash(Boolean(safeColor(given.brand)))
	// Not a colour of ours: what the browser draws its own controls in.
	variables['--rkw-color-scheme'] = scheme
	// The "installed" badge, which is not the same green as a success
	// message and never was: it is a quieter, deeper one, chosen against a
	// white row. Derived rather than exposed as a token, like the hover
	// wash: a host theming the picker is not choosing this.
	const installed = scheme === 'dark'
		? { mark: '#4ade80', ink: '#86efac' }
		: { mark: '#16a34a', ink: '#15803d' }
	variables['--rkw-installed'] = installed.mark
	variables['--rkw-installed-ink'] = installed.ink

	return variables
}

/** The same thing as a declaration block, for a stylesheet rather than an element. */
export function themeCss (
	theme: WalletKitTheme | undefined,
	scheme: ColorScheme,
	selector = ':host',
): string {
	const variables = themeVariables(theme, scheme)
	const body = Object.entries(variables)
		.map(([name, value]) => `\t${name}: ${value};`)
		.join('\n')
	return `${selector} {\n${body}\n}`
}

/** Sets the tokens on one element, which is what a renderer actually does. */
export function applyTheme (
	target: { style: { setProperty(name: string, value: string): void } },
	theme: WalletKitTheme | undefined,
	scheme: ColorScheme,
): void {
	for (const [name, value] of Object.entries(themeVariables(theme, scheme))) {
		// setProperty rather than a built style string: the value is written
		// as a value, so nothing in it can close the declaration and start
		// another.
		target.style.setProperty(name, value)
	}
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** What `system` means right now, or the mode itself when it is not system. */
export function resolveScheme (mode: ThemeMode | undefined): ColorScheme {
	if (mode === 'light' || mode === 'dark') {
		return mode
	}
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return 'light'
	}
	return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/**
 * Follows the resolved mode, which only moves when the mode is `system`.
 *
 * Calls back once immediately, so a caller never has to read the value
 * separately before subscribing to it. Returns the cleanup.
 */
export function subscribeScheme (
	mode: ThemeMode | undefined,
	onChange: (scheme: ColorScheme) => void,
): () => void {
	if (mode === 'light' || mode === 'dark') {
		onChange(mode)
		return () => undefined
	}
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		onChange('light')
		return () => undefined
	}
	const query = window.matchMedia(DARK_QUERY)
	const update = () => onChange(query.matches ? 'dark' : 'light')
	update()
	query.addEventListener('change', update)
	return () => query.removeEventListener('change', update)
}
