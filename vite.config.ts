import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

/**
 * The element build, and only the element.
 *
 * The core entry is emitted by tsc, module by module, so a bundler consuming
 * it can drop what a host does not use. This entry is the opposite: one file
 * with its renderer inside it, because a custom element has to run in a page
 * that uses no framework at all and cannot be asked to install one.
 *
 * Preact rather than React, and bundled rather than peered. It is four
 * kilobytes, which is less than one of the wallet logos, and a dependency a
 * host must install is a dependency a plain HTML page cannot.
 */
export default defineConfig({
	plugins: [preact()],
	resolve: {
		alias: {
			// Resolved to the built core rather than the source, so what the
			// element is compiled against is what a host will load.
			'@reclack/walletkit': new URL('./dist/index.js', import.meta.url)
				.pathname,
			'@reclack/walletkit/element': new URL(
				'./dist/element.js',
				import.meta.url,
			).pathname,
		},
	},
	build: {
		outDir: 'dist',
		// tsc has already written the core here.
		emptyOutDir: false,
		lib: {
			// The element, and two entries that add nothing but a framework's
			// JSX types beside it. Those re-export the element by package
			// name, which is external here, so each emits a line rather than
			// a second copy of the bundle.
			entry: {
				element: 'src/element/index.ts',
			},
			formats: ['es'],
			fileName: (_format, name) => `${name}.js`,
		},
		rollupOptions: {
			external: [
				// The core, which this package also publishes on its own. A
				// bundled copy would mean a host importing both entries ships
				// the wallet layer twice, and connects two sets of listeners
				// to the same window.
				'@reclack/walletkit',
				'@reclack/walletkit/element',
				// An optional peer, imported only when a wallet that injects
				// nothing is chosen. Bundling it would put the relay SDK, the
				// largest thing in reach, into every page that draws a wallet
				// list.
				'@walletconnect/ethereum-provider',
			],
		},
		target: 'es2022',
		cssCodeSplit: false,
	},
})
