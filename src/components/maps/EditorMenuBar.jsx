import { useEffect, useRef, useState } from 'react'

// File / Edit / View / Mission / Test menus. Mission generate actions also have toolbar icons before Enemies.

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
      { id: 'weatherFx', label: 'Weather FX' },
      { id: 'grid', label: 'Grid' },
      { id: 'gridOptions', label: 'Grid options…' },
      { sep: true },
      { id: 'overview', label: 'Overview window' },
      { id: 'layers', label: 'Layers window' },
      { id: 'levels', label: 'Levels window' },
    ],
  },
  {
    id: 'mission',
    label: 'Mission',
    items: [
      { id: 'generateMap', label: 'Generate Map' },
      { id: 'generateName', label: 'Generate Name' },
      { id: 'generateEpisode', label: 'Generate Episode Name' },
      { id: 'generateCard', label: 'Generate Card' },
      { sep: true },
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
]

export default function EditorMenuBar({ onAction, checks = {} }) {
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
      {MENUS.map((menu) => (
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
