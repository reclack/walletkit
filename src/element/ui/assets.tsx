import { createContext, type ComponentChildren } from 'preact'
import { useContext, useMemo } from 'preact/hooks'

import { DEFAULT_LOGO_BASE, walletLogo } from '@reclack/walletkit'

/**
 * Where this element's wallet artwork is served from.
 *
 * Context rather than a prop threaded through four components, because every
 * one of them that draws a mark wants it and none of them wants to know why.
 *
 * It is a context at all because the answer differs per host: the hosted
 * checkout serves these files at /images, a dashboard from its own static
 * directory, a partner from wherever it put them. Hard-coding a path would
 * make the element work in exactly one deployment.
 */
const AssetBase = createContext(DEFAULT_LOGO_BASE)

export function AssetProvider ({
	base,
	children,
}: {
	base: string
	children: ComponentChildren
}) {
	return <AssetBase.Provider value={base}>{children}</AssetBase.Provider>
}

/** The artwork for a wallet, or nothing where this package carries none. */
export function useWalletLogo (): (id: string) => string | undefined {
	const base = useContext(AssetBase)
	// Memoized because this hands back a function closing over the base: a
	// fresh one each render is a dependency that never compares equal.
	return useMemo(() => (id: string) => walletLogo(id, base), [base])
}
