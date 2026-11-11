import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'

import { ReclackConnect } from '../../walletkit-react/src/index.js'
import { createWalletKit, type WalletEntry } from '../src/index.js'

/**
 * The whole path a host sees, with a wallet that is not really there.
 *
 * Pick a wallet, approve, and the address comes back through `onConnect`.
 * That last step is the one that silently failed: the dialog closes itself
 * once a wallet is connected, the host read that close as a dismissal and
 * tore the picker down before the address could be handed over.
 */
const ADDRESS = '0x1111111111111111111111111111111111111111'

const provider = {
	request: async ({ method }: { method: string }) =>
		method === 'eth_requestAccounts' ? [ADDRESS] : '0x2105',
	on: () => undefined,
	removeListener: () => undefined,
}
;(window as unknown as Record<string, unknown>).testwallet = provider

/**
 * Brave, as a browser actually presents it: announced under an id this
 * catalogue has never heard of, and announced more than once. The catalogue
 * still carries a row called "Brave Wallet", so the same wallet arrived three
 * times, twice as installed and once as something to go and install.
 */
for (const rdns of ['com.brave.wallet', 'com.brave.wallet.legacy']) {
	window.addEventListener('eip6963:requestProvider', () => {
		window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
			detail: {
				info: { uuid: rdns, name: 'Brave Wallet', icon: '', rdns },
				provider: { ...provider },
			},
		}))
	})
}

// Found by the sniff path rather than an announcement, which needs no timing.
const catalog: WalletEntry[] = [
	{
		id: 'testwallet',
		name: 'Test Wallet',
		installUrl: '',
		engines: [{ id: 'evm', globals: [['testwallet']] }],
	},
	// No rdns, so nothing it announces will ever match this row.
	{ id: 'brave', name: 'Brave Wallet', installUrl: '', engines: [{ id: 'evm' }] },
	{ id: 'safe', name: 'Safe', installUrl: '', engines: [{ id: 'evm' }] },
]

const kit = createWalletKit({ catalog, assetBase: './assets/' })

const log = document.createElement('pre')
document.body.append(log)
const say = (line: string) => { log.textContent += `${line}\n` }

function Field () {
	const [open, setOpen] = useState(false)
	const [address, setAddress] = useState('')

	useEffect(() => { window.setTimeout(() => setOpen(true), 200) }, [])

	useEffect(() => {
		if (!open) {
			return
		}
		const id = window.setTimeout(() => {
			const root = document.querySelector('reclack-connect')?.shadowRoot
			const rows = [...(root?.querySelectorAll<HTMLButtonElement>('.wallet-row') ?? [])]
			const names = rows.map((r) => (r.textContent ?? '').replace(/Detected|Installed|\s+/gi, ' ').trim())
			say(`detected=${kit.getState().evm.available.length} rows=${rows.length}`)
			say(`listed: ${names.join(' | ')}`)
			rows.find((r) => (r.textContent ?? '').includes('Test Wallet'))?.click()
		}, 400)
		return () => window.clearTimeout(id)
	}, [open])

	useEffect(() => {
		window.setTimeout(() => say(`field=${address || '(still empty)'}`), 2500)
	}, [address])

	return open ? (
		<ReclackConnect
			kit={kit}
			variant="modal"
			family="evm"
			intent={['address']}
			onConnect={(result) => {
				say(`onConnect ${result.address}`)
				setAddress(result.address)
				setOpen(false)
			}}
			onCancel={() => { say('onCancel (read as a dismissal)'); setOpen(false) }}
			onError={(message) => { say(`onError ${message}`); setOpen(false) }}
		/>
	) : null
}

render(<Field />, document.querySelector('#app') as HTMLElement)
