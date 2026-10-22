import '../conversation/conversationEditor.css'
import './mapEditor.css'

// Shared chrome for Mission full-screen editors: Map Editor ed-shell look.
// With title/toolbar: standard top bar + body. Without: wrap-only so screens keep custom toolbars (Conversation).
export default function EditorSubScreen({ title = null, toolbar = null, children, className = '' }) {
  const classes = `me-screen ed-shell ess-screen ${className}`.trim()
  if (title == null && toolbar == null) {
    return <div className={classes}>{children}</div>
  }
  return (
    <div className={classes}>
      <div className="ess-toolbar">
        {title ? <strong className="ess-title">{title}</strong> : null}
        {toolbar}
      </div>
      <div className="ess-body">{children}</div>
    </div>
  )
}
