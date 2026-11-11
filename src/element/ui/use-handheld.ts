import { useEffect, useState } from 'preact/hooks'

import { subscribeHandheld } from '@reclack/walletkit'

/**
 * Whether this is a touch-primary device: a phone or a tablet.
 *
 * Matters because the wallet hand-off is the opposite on each. A desktop
 * payer scans a code to carry the page to their phone; a phone payer cannot
 * scan their own screen and needs a link into the wallet instead.
 */
export function useHandheld (): boolean {
	const [handheld, setHandheld] = useState(false)
	useEffect(() => subscribeHandheld(setHandheld), [])
	return handheld
}
