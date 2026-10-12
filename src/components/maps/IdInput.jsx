import { useState } from 'react'

// An id field that only takes an id nothing else uses, so renaming never merges two things: while the typed id is
// empty or taken the field shows why and keeps the old id, and leaving the field puts the old id back.
// taken(id): whether another entry already has that id. onChange(id): a valid new id (letters, digits, - and _).
export default function IdInput({ value, taken, onChange, className = 'ce-input', label }) {
  const [text, setText] = useState(value)
  // The id changed from outside (another entry shown here, or this rename went through): show it.
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setText(value)
  }
  const typed = text.replace(/[^A-Za-z0-9_-]/g, '')
  const problem = typed === value ? null : !typed ? 'An id is needed' : taken(typed) ? `${typed} is already used` : null
  return (
    <>
      <input
        className={`${className}${problem ? ' is-invalid' : ''}`}
        value={text}
        aria-label={label}
        title={problem ?? undefined}
        onChange={(event) => {
          const next = event.target.value.replace(/[^A-Za-z0-9_-]/g, '')
          setText(next)
          if (next && next !== value && !taken(next)) onChange(next)
        }}
        onBlur={() => setText(value)}
      />
      {problem && <span className="ce-text is-warning">{problem}; the old id is kept.</span>}
    </>
  )
}
