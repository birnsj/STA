import '../conversation/conversationEditor.css'
import './mapEditor.css'
import EditorMenuBar from './EditorMenuBar.jsx'

// Shared chrome for Mission full-screen editors: Map Editor ed-shell look.
// Optional menus → top main menu bar (File Save/Load for this editor's data).
// With title/toolbar: secondary action row + body. Without title/toolbar: children fill the shell
// (Conversation keeps a custom toolbar under the menu bar).
export default function EditorSubScreen({
  title = null,
  toolbar = null,
  menus = null,
  onMenuAction = null,
  menuChecks = {},
  children,
  className = '',
}) {
  const classes = `me-screen ed-shell ess-screen ${className}`.trim()
  const hasMenu = Array.isArray(menus) && menus.length > 0 && typeof onMenuAction === 'function'
  const hasToolbar = title != null || toolbar != null

  if (!hasMenu && !hasToolbar) {
    return <div className={classes}>{children}</div>
  }

  return (
    <div className={classes}>
      {hasMenu ? <EditorMenuBar menus={menus} onAction={onMenuAction} checks={menuChecks} /> : null}
      {hasToolbar ? (
        <>
          <div className="ess-toolbar">
            {title ? <strong className="ess-title">{title}</strong> : null}
            {toolbar}
          </div>
          <div className="ess-body">{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  )
}
