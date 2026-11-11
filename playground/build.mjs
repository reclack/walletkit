/**
 * Builds the playground into one page that opens from disk.
 *
 * A browser will not fetch a module by src over file://, so the bundle is
 * inlined. The wallet artwork is copied beside it instead: an <img> is not a
 * module, and file:// serves it happily.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'dist')

await build({ configFile: join(here, 'vite.config.ts') })

mkdirSync(join(out, 'assets'), { recursive: true })
cpSync(join(here, '..', 'assets'), join(out, 'assets'), { recursive: true })

// A `</script` anywhere in the bundle, even inside a string, closes the tag
// it is inlined into and spills the rest of the file onto the page as text.
const js = readFileSync(join(out, 'demo.js'), 'utf8').replaceAll(
	'</script',
	'<\\/script',
)
for (const page of ['index.html', 'modal.html', 'dark.html', 'remount.html']) {
	// A replacer function, never a replacement string: `$&` and `$1` inside a
	// replacement are substitution syntax, and a bundle this size contains
	// both. One of them spliced the matched <script> tag back into the middle
	// of the code, which closed the tag and spilled the rest onto the page.
	const html = readFileSync(join(here, page), 'utf8').replace(
		'<script type="module" src="./demo.ts"></script>',
		() => `<script>\n${js}\n</script>`,
	)
	writeFileSync(join(out, page.replace('.html', '.standalone.html')), html)
}
console.log('playground built')
