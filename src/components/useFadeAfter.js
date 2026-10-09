import { useEffect, useState } from 'react'

// How long an on-screen message stays before it fades (designer decision).
export const MESSAGE_FADE_MS = 5000

// True once `key` has been unchanged for `ms`. A new key (new message text, a new scan) shows the message again.
export default function useFadeAfter(key, ms = MESSAGE_FADE_MS) {
  const [shown, setShown] = useState({ key, faded: false })
  if (shown.key !== key) setShown({ key, faded: false })

  useEffect(() => {
    const timer = setTimeout(() => setShown((current) => (current.key === key ? { ...current, faded: true } : current)), ms)
    return () => clearTimeout(timer)
  }, [key, ms])

  return shown.key === key && shown.faded
}
