import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks'

import { networkLabel, networkLogo } from '@reclack/walletkit'
import { useAssetBase } from './assets.js'

/**
 * The chain something settles on.
 *
 * A closed trigger rather than a stacked list: the number of payable chains
 * grows with every deployment, and a list that grows without bound pushes
 * whatever follows it below the fold.
 *
 * A combobox over a button and a listbox rather than a native `<select>`,
 * which cannot carry a chain mark or a search field.
 */
export function NetworkSelect ({
	networks,
	value,
	disabled,
	label,
	onChange,
}: {
	networks: string[]
	value: string
	disabled?: boolean
	label?: string
	onChange: (network: string) => void
}) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [active, setActive] = useState(0)
	const rootRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const listId = useId()

	const selected = networks.includes(value) ? value : networks[0] ?? ''

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase()
		if (!needle) {
			return networks
		}
		// The label as well as the raw name, so "Base Sepolia" and
		// "base-sepolia" both find the same chain.
		return networks.filter(
			(network) =>
				networkLabel(network).toLowerCase().includes(needle)
				|| network.toLowerCase().includes(needle),
		)
	}, [networks, query])

	// A press anywhere else dismisses it. The path, not the target: this
	// lives in a shadow root, so by the time the event reaches the document
	// its target is the host element and `contains` would be false for every
	// click, including the ones inside this.
	useEffect(() => {
		if (!open) {
			return
		}
		const handle = (event: Event) => {
			const root = rootRef.current
			if (root && !event.composedPath().includes(root)) {
				setOpen(false)
			}
		}
		document.addEventListener('pointerdown', handle)
		return () => document.removeEventListener('pointerdown', handle)
	}, [open])

	useEffect(() => {
		if (open) {
			inputRef.current?.focus()
		}
	}, [open])

	useEffect(() => {
		if (disabled) {
			setOpen(false)
		}
	}, [disabled])

	// Keeps the highlighted row visible when arrowing past the fold.
	useEffect(() => {
		if (!open) {
			return
		}
		rootRef.current
			?.querySelector(`#${CSS.escape(`${listId}-${active}`)}`)
			?.scrollIntoView({ block: 'nearest' })
	}, [open, active, listId])

	function show () {
		setQuery('')
		// Opens on the current choice rather than the top, so Enter straight
		// after opening changes nothing. Indexed against the full list: the
		// query reset above has not applied yet.
		const index = networks.indexOf(selected)
		setActive(index < 0 ? 0 : index)
		setOpen(true)
	}

	function dismiss () {
		setOpen(false)
		triggerRef.current?.focus()
	}

	function choose (network: string) {
		onChange(network)
		setOpen(false)
		triggerRef.current?.focus()
	}

	function onKeyDown (event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault()
			dismiss()
			return
		}
		if (!open) {
			if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
				event.preventDefault()
				show()
			}
			return
		}
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault()
				setActive((index) => Math.min(index + 1, filtered.length - 1))
				break
			case 'ArrowUp':
				event.preventDefault()
				setActive((index) => Math.max(index - 1, 0))
				break
			case 'Home':
				event.preventDefault()
				setActive(0)
				break
			case 'End':
				event.preventDefault()
				setActive(filtered.length - 1)
				break
			case 'Enter': {
				event.preventDefault()
				const entry = filtered[active]
				if (entry) {
					choose(entry)
				}
				break
			}
			case 'Tab':
				// Tabbing away is a dismissal, not a selection.
				setOpen(false)
				break
		}
	}

	return (
		<div class="rkw-field">
			{label === '' ? null : (
				<span class="rkw-field-label" id={`${listId}-label`}>
					{label ?? 'Network'}
				</span>
			)}
			<div class="network-select" ref={rootRef} onKeyDown={onKeyDown}>
				<button
					ref={triggerRef}
					type="button"
					class="network-trigger"
					aria-expanded={open}
					aria-haspopup="listbox"
					aria-labelledby={`${listId}-label`}
					disabled={disabled}
					onClick={() => (open ? setOpen(false) : show())}
				>
					<NetworkMark network={selected} />
					<span class="network-trigger-name">{networkLabel(selected)}</span>
					<span class="network-caret" aria-hidden="true" />
				</button>

				{open ? (
					<div class="network-panel">
						<input
							ref={inputRef}
							type="search"
							class="network-search"
							placeholder="Search network"
							aria-label="Search network"
							autocomplete="off"
							role="combobox"
							aria-expanded={true}
							aria-controls={listId}
							aria-activedescendant={
								filtered.length ? `${listId}-${active}` : undefined
							}
							value={query}
							onInput={(event) => {
								setQuery((event.target as HTMLInputElement).value)
								// The old index can point past the end of a
								// narrower list, or at an unrelated chain.
								setActive(0)
							}}
						/>

						<ul
							class="network-list"
							id={listId}
							role="listbox"
							aria-labelledby={`${listId}-label`}
						>
							{filtered.map((network, index) => (
								<li
									key={network}
									id={`${listId}-${index}`}
									role="option"
									aria-selected={network === selected}
									class={
										index === active
											? 'network-item network-item-active'
											: 'network-item'
									}
									onClick={() => choose(network)}
									onMouseMove={() => setActive(index)}
								>
									<NetworkMark network={network} />
									<span class="network-item-name">
										{networkLabel(network)}
									</span>
								</li>
							))}
						</ul>

						{filtered.length === 0 ? (
							<p class="network-empty">No network matches “{query}”.</p>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	)
}

/**
 * A chain's mark, or its initial where there is no artwork.
 *
 * The fallback is not decorative: a chain can be payable before its mark is
 * added, and a broken image beside a payment network reads as though the
 * network itself is broken.
 */
function NetworkMark ({ network }: { network: string }) {
	const base = useAssetBase()
	const src = networkLogo(network, base)

	return (
		<span class="network-mark" aria-hidden="true">
			{src ? (
				<img src={src} alt="" width={20} height={20} loading="lazy" decoding="async" />
			) : (
				networkLabel(network).charAt(0)
			)}
		</span>
	)
}
