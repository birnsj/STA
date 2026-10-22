import { createContext, useContext, useMemo, useState } from 'react'

// Collapsible Properties sections with Expand all / Collapse all for the right panel.

const PropertySectionsContext = createContext(null)

export function PropertySectionsProvider({ children }) {
  const [wave, setWave] = useState({ mode: null, tick: 0 })
  const api = useMemo(
    () => ({
      wave,
      expandAll: () => setWave((prev) => ({ mode: 'open', tick: prev.tick + 1 })),
      collapseAll: () => setWave((prev) => ({ mode: 'closed', tick: prev.tick + 1 })),
    }),
    [wave],
  )
  return <PropertySectionsContext.Provider value={api}>{children}</PropertySectionsContext.Provider>
}

export function PropertySectionsToolbar() {
  const api = useContext(PropertySectionsContext)
  if (!api) return null
  return (
    <div className="ed-prop-sections-bar" role="toolbar" aria-label="Property sections">
      <button type="button" className="ed-prop-sections-btn" onClick={api.expandAll}>
        Expand all
      </button>
      <span className="ed-prop-sections-sep" aria-hidden="true">
        ·
      </span>
      <button type="button" className="ed-prop-sections-btn" onClick={api.collapseAll}>
        Collapse all
      </button>
    </div>
  )
}

export function PropertySection({ id, title, defaultOpen = true, children }) {
  const api = useContext(PropertySectionsContext)
  const [open, setOpen] = useState(defaultOpen)
  const [seenTick, setSeenTick] = useState(api?.wave.tick ?? 0)
  if (api && api.wave.tick !== seenTick) {
    setSeenTick(api.wave.tick)
    if (api.wave.mode === 'open') setOpen(true)
    else if (api.wave.mode === 'closed') setOpen(false)
  }

  return (
    <section className={`ed-prop-section${open ? ' is-open' : ''}`} data-section={id}>
      <button
        type="button"
        className="ed-prop-section-head"
        aria-expanded={open}
        aria-controls={`ed-prop-section-${id}`}
        id={`ed-prop-section-head-${id}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ed-prop-section-chevron" aria-hidden="true" />
        <span className="ed-prop-section-title">{title}</span>
      </button>
      {open && (
        <div className="ed-prop-section-body" id={`ed-prop-section-${id}`} role="region" aria-labelledby={`ed-prop-section-head-${id}`}>
          {children}
        </div>
      )}
    </section>
  )
}
