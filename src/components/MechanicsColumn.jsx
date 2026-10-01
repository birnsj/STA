import HelpTip from './HelpTip.jsx'
import RequirementTag from './RequirementTag.jsx'

// Matches .env-column-instruction line-height in styles.css.
const INSTRUCTION_LINE_HEIGHT = 1.25

// `met` is omitted for columns that have no requirement to show.
// `locked` dims the column and blocks input until the sections before it are done.
// `instructionLines` reserves room for the longest wording of an instruction that changes with
// selections, so the column body below never moves; omit it for fixed instructions.
export default function MechanicsColumn({ number, title, helpId, instruction, instructionLines, met, locked = false, children }) {
  const isMissing = met === false && !locked
  const instructionStyle = instructionLines ? { height: `${instructionLines * INSTRUCTION_LINE_HEIGHT}em` } : undefined
  return (
    <div className={`panel env-column${isMissing ? ' is-missing' : ''}${locked ? ' is-locked' : ''}`} inert={locked}>
      <div className="env-column-header">
        <span className="step-badge">{number}</span>
        <div>
          <h3 className="env-column-title">
            <HelpTip helpId={helpId}>{title}</HelpTip>
            {met !== undefined && <RequirementTag met={met} />}
          </h3>
          <p className="env-column-instruction" style={instructionStyle}>{instruction}</p>
        </div>
      </div>
      <div className="env-column-body">{children}</div>
    </div>
  )
}
