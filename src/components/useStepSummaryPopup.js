import { useEffect, useState } from 'react'
import { isStepComplete } from '../rules/creationProgress.js'
import { getStepSignature, hasStepSummary } from '../rules/stepSummary.js'

const isTextEntry = (element) => Boolean(element?.matches?.('textarea, input:not([type]), input[type="text"], input[type="search"]'))

// True while the player is typing, so a screen completed by its first keystroke waits until they leave the field.
function useIsTyping() {
  const [typing, setTyping] = useState(() => isTextEntry(document.activeElement))
  useEffect(() => {
    const onFocusIn = (event) => setTyping(isTextEntry(event.target))
    const onFocusOut = (event) => setTyping(isTextEntry(event.relatedTarget))
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])
  return typing
}

// UI state only. Opens when the screen's NEXT check (isStepComplete) passes with a completed choice set the player
// hasn't already closed on this visit. A screen that is already complete when the player arrives stays quiet.
// show() re-opens it on demand (the Summary button) whenever the screen is complete.
export function useStepSummaryPopup(stepId, character) {
  const complete = hasStepSummary(stepId) && isStepComplete(stepId, character)
  const signature = complete ? getStepSignature(stepId, character) : null
  const [seen, setSeen] = useState({ stepId, signature })
  const [requestedStepId, setRequestedStepId] = useState(null)
  const typing = useIsTyping()

  // Arriving on a screen sets its baseline (React's "adjust state while rendering" pattern).
  if (seen.stepId !== stepId) setSeen({ stepId, signature })

  const automatic = seen.stepId === stepId && complete && signature !== seen.signature && !typing
  const requested = requestedStepId === stepId && complete
  return {
    open: automatic || requested,
    canShow: complete,
    show: () => setRequestedStepId(stepId),
    close: () => {
      setSeen({ stepId, signature })
      setRequestedStepId(null)
    },
  }
}
