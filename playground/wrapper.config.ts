import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

// The React wrapper, running in Preact through preact/compat: the same path
// the hosted checkout takes, and close enough to the dashboard's React to
// exercise the wrapper rather than the bare element.
export default defineConfig({
	root: __dirname,
	plugins: [preact()],
	resolve: {
		alias: {
			// The source, not the installed copy. Resolving the package name
			// here tested whatever was last synced into walletkit-react's own
			// node_modules, which is how a fixed bug went on reproducing.
			'@reclack/walletkit/element': new URL('../src/element/index.ts', import.meta.url).pathname,
			'@reclack/walletkit': new URL('../src/index.ts', import.meta.url).pathname,
			react: 'preact/compat',
			'react-dom': 'preact/compat',
			'react/jsx-runtime': 'preact/jsx-runtime',
		},
		dedupe: ['preact'],
	},
	build: {
		outDir: 'dist',
		emptyOutDir: false,
		lib: { entry: 'wrapper-demo.tsx', formats: ['iife'], name: 'wd', fileName: () => 'wrapper-demo.js' },
		rollupOptions: { output: { inlineDynamicImports: true } },
	},
})
