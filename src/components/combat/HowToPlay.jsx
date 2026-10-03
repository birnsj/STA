import help from '../../data/adaptation/combat/help.json'

export default function HowToPlay({ onClose }) {
  return (
    <div className="combat-modal-backdrop">
      <div className="combat-modal combat-help" role="dialog" aria-modal="true" aria-labelledby="combat-help-title">
        <h2 id="combat-help-title" className="combat-help-title">
          {help.title}
        </h2>
        <div className="combat-help-body">
          {help.sections.map((section) => (
            <section key={section.heading} className="combat-help-section">
              <h3 className="combat-help-heading">{section.heading}</h3>
              {section.lines.map((line) => (
                <p key={line} className="combat-help-line">
                  {line}
                </p>
              ))}
            </section>
          ))}
        </div>
        <button type="button" className="combat-button is-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}
