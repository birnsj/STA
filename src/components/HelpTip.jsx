import { getSectionHelp } from '../rules/sectionHelp.js'
import { useInfoTip } from './useInfoTip.js'

// Spans only, so it can sit inside a heading.
export default function HelpTip({ helpId, children }) {
  const tip = useInfoTip()
  const help = getSectionHelp(helpId)
  if (!help) return children
  return (
    <span className="help-tip" tabIndex={0} {...tip.bind(help)}>
      {children}
      {tip.element}
    </span>
  )
}
