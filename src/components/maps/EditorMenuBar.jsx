import { useEffect, useRef, useState } from 'react'

// File / Edit / View / Tools / Test / Help. Generate Map / Name / Episode / Card live on the Properties Map tab (and toolbar).

const MENUS = [
  {
    id: 'file',
    label: 'File',
    items: [
      { id: 'new', label: 'New' },
      { id: 'load', label: 'Load…' },
      { id: 'save', label: 'Save' },
      { id: 'saveAs', label: 'Save As…' },
      { id: 'delete', label: 'Delete Map' },
      { sep: true },
      { id: 'back', label: 'Back to Menu' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { id: 'undo', label: 'Undo' },
      { id: 'redo', label: 'Redo' },
      { sep: true },
      { id: 'placeTiles', label: 'Toggle Place Tiles' },
      { id: 'move', label: 'Toggle Move' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { id: 'ghost', label: 'See-through blocks' },
      { id: 'animate', label: 'Tile animations' },
      { id: 'lighting', label: 'Lighting' },
      { id: 'surfaces', label: 'Placement surfaces' },
      { id: 'weatherFx', label: 'Weather FX' },
      { id: 'grid', label: 'Grid' },
      { id: 'gridOptions', label: 'Grid options…' },
      { id: 'viewScale', label: 'View scale…' },
      { sep: true },
      { id: 'overview', label: 'Overview window' },
      { id: 'layers', label: 'Layers window' },
      { id: 'levels', label: 'Levels window' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { id: 'objectives', label: 'Objective Editor' },
      { id: 'objects', label: 'Object Editor' },
      { id: 'conversations', label: 'Conversation Editor' },
      { id: 'characters', label: 'Character Library' },
      { id: 'generators', label: 'Generator Editor' },
      { id: 'story', label: 'Story Wording' },
    ],
  },
  {
    id: 'test',
    label: 'Test',
    items: [
      { id: 'play', label: 'Play' },
      { id: 'enemies', label: 'Toggle Enemies Active' },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { id: 'help', label: 'Keyboard Shortcuts…' },
      { sep: true },
      { id: 'about', label: 'About STA Builder' },
    ],
  },
]

export default function EditorMenuBar({ onAction, checks = {}, menus = MENUS }) {
  const [open, setOpen] = useState(null)
  const root = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (root.current && !root.current.contains(event.target)) setOpen(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className="ed-menubar" ref={root} role="menubar">
      {menus.map((menu) => (
        <div key={menu.id} className="ed-menu">
          <button
            type="button"
            className={`ed-menu-trigger${open === menu.id ? ' is-open' : ''}`}
            aria-haspopup="true"
            aria-expanded={open === menu.id}
            onClick={() => setOpen((current) => (current === menu.id ? null : menu.id))}
          >
            {menu.label}
          </button>
          {open === menu.id && (
            <ul className="ed-menu-list" role="menu">
              {menu.items.map((item, index) =>
                item.sep ? (
                  <li key={`sep-${index}`} className="ed-menu-sep" role="separator" />
                ) : (
                  <li key={item.id} role="none">
                    <button
                      type="button"
                      className="ed-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setOpen(null)
                        onAction?.(item.id)
                      }}
                    >
                      {item.label}
                      {checks[item.id] != null && <span className="ed-menu-check">{checks[item.id] ? '✓' : ''}</span>}
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
