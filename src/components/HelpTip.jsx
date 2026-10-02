import { getSectionHelp } from '../rules/sectionHelp.js'
import { useInfoTip } from './useInfoTip.js'

// Spans only, so it can sit inside a heading. `content` supplies a ready-made info box instead of a section helpId.
export default function HelpTip({ helpId, content, children }) {
  const tip = useInfoTip()
  const help = content ?? getSectionHelp(helpId)
  if (!help) return children
  return (
    <span className="help-tip" tabIndex={0} {...tip.bind(help)}>
      {children}
      {tip.element}
    </span>
  )
}
