import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Drop-in for native <select> inside ScaledStage. Native option popups ignore CSS transform:scale and look huge;
// this menu is portaled into `.stage` so it stays scaled with the chrome and is not clipped by panel overflow.

function collectItems(children, group = null) {
  const items = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === 'optgroup') {
      const label = child.props.label ?? ''
      items.push({ type: 'group', label })
      items.push(...collectItems(child.props.children, label))
      return
    }
    if (child.type !== 'option') return
    items.push({
      type: 'option',
      value: child.props.value === undefined || child.props.value === null ? '' : String(child.props.value),
      label: child.props.children,
      disabled: Boolean(child.props.disabled),
      group,
    })
  })
  return items
}

function menuBoxFor(trigger, stage) {
  if (!trigger || !stage) return null
  const stageRect = stage.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  const sx = stageRect.width / stage.offsetWidth || 1
  const sy = stageRect.height / stage.offsetHeight || 1
  const left = (triggerRect.left - stageRect.left) / sx
  const width = triggerRect.width / sx
  const below = (triggerRect.bottom - stageRect.top) / sy
  const above = (triggerRect.top - stageRect.top) / sy
  const spaceBelow = stage.offsetHeight - below
  const openUp = spaceBelow < 160 && above > spaceBelow
  return {
    left,
    width,
    top: openUp ? undefined : below + 2,
    bottom: openUp ? stage.offsetHeight - above + 2 : undefined,
    maxHeight: Math.max(120, openUp ? above - 8 : spaceBelow - 8),
  }
}

export default function EditorSelect({
  value,
  onChange,
  className = '',
  disabled = false,
  title,
  'aria-label': ariaLabel,
  children,
}) {
  const listId = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState(null)
  const items = useMemo(() => collectItems(children), [children])
  const current = String(value ?? '')
  const selected = items.find((item) => item.type === 'option' && item.value === current)
  const display = selected?.label ?? ''
  const isOpen = open && !disabled

  useLayoutEffect(() => {
    if (!isOpen) {
      setPlacement(null)
      return undefined
    }
    const host = rootRef.current?.closest('.stage') ?? null
    const update = () => {
      const box = menuBoxFor(triggerRef.current, host)
      setPlacement(host && box ? { host, box } : null)
    }
    update()
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [isOpen, items, current])

  useEffect(() => {
    if (!isOpen) return undefined
    const onPointer = (event) => {
      const target = event.target
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [isOpen])

  const pick = (next) => {
    setOpen(false)
    if (next === current) return
    onChange?.({ target: { value: next } })
  }

  const menu =
    isOpen && placement
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            className="ed-select-menu"
            role="listbox"
            aria-label={ariaLabel}
            style={{
              left: placement.box.left,
              width: placement.box.width,
              top: placement.box.top,
              bottom: placement.box.bottom,
              maxHeight: placement.box.maxHeight,
            }}
          >
            {items.map((item, index) => {
              if (item.type === 'group') {
                return (
                  <li key={`g-${item.label}-${index}`} className="ed-select-group" role="presentation">
                    {item.label}
                  </li>
                )
              }
              const isSelected = item.value === current
              return (
                <li key={`o-${item.value}-${index}`} role="presentation">
                  <button
                    type="button"
                    role="option"
                    className={`ed-select-option${isSelected ? ' is-selected' : ''}`}
                    aria-selected={isSelected}
                    disabled={item.disabled}
                    onClick={() => pick(item.value)}
                  >
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ul>,
          placement.host,
        )
      : null

  return (
    <div ref={rootRef} className={`ed-select${isOpen ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`ed-select-trigger ${className}`.trim()}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="ed-select-value">{display}</span>
        <span className="ed-select-caret" aria-hidden="true" />
      </button>
      {menu}
    </div>
  )
}
