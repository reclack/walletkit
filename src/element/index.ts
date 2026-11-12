/**
 * @reclack/walletkit/element
 *
 * The wallet picker as a custom element, with its renderer bundled in. Works
 * in React, Vue, Angular, Svelte and a page with no framework at all, because
 * an element is the only component model all of them already have.
 *
 * Importing this registers `<reclack-connect>`. Import the core entry instead
 * if you want the connection logic and your own markup.
 */
import { defineWalletElement } from './element.js'

export type {
	ReclackConnectAttributes,
	ReclackConnectProps,
} from './attributes.js'
// Shared by every framework wrapper, and by anybody writing their own: the
// prop names a component takes, and how each becomes an attribute or an
// event. Framework-free on purpose, so the wrappers hold no logic worth
// keeping in step.
export { ATTRIBUTES, attributesOf, EVENTS } from './props.js'
export {
	NETWORK_ATTRIBUTES,
	NETWORK_EVENTS,
	networkAttributesOf,
} from './props.js'
export type { ConnectProps, NetworkProps } from './props.js'
export {
	connectWallet,
	defineWalletElement,
	ReclackConnectElement,
	type ConnectWalletOptions,
} from './element.js'
export {
	defineNetworkElement,
	ReclackNetworkElement,
} from './network-element.js'

import { defineNetworkElement as define } from './network-element.js'

defineWalletElement()
define()
