import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

/**
 * The playground is built into one file, not served.
 *
 * A single IIFE, because the page is opened from disk: a browser will not
 * fetch a module by src over file://, and the point of this is being able to
 * look at the picker without a server running anywhere.
 */
export default defineConfig({
	root: __dirname,
	plugins: [preact()],
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		lib: { entry: 'demo.ts', formats: ['iife'], name: 'demo', fileName: () => 'demo.js' },
		rollupOptions: { output: { inlineDynamicImports: true } },
	},
})
