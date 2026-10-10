import { useEffect, useMemo, useState } from 'react'
import ConversationCanvas, { NODE_WIDTH } from '../components/conversation/ConversationCanvas.jsx'
import NodeInspector from '../components/conversation/NodeInspector.jsx'
import '../components/conversation/conversationEditor.css'
import ConfirmDialog from '../components/maps/ConfirmDialog.jsx'
import { canSaveConversations, conversationFileId, deleteConversation, listConversations, loadConversation, saveConversation } from '../conversation/conversationFiles.js'
import { createConversation, createNode, getNode, nextId, NODE_TYPES, removeNode, validateConversation, withLink } from '../conversation/conversationFormat.js'

// Dev conversation editor (opened from the map editor): authors the node graphs NPCs open in exploration and saves
// them as conversations/{id}.json. map: the map open in the map editor, for its objectives and challenge objects.
// Everything here is UI state until Save.
export default function ConversationEditorScreen({ initialId = null, map = null, onBack }) {
  const [conversation, setConversation] = useState(() => (initialId ? null : createConversation()))
  // The file the open conversation was loaded from or saved as (null = never saved).
  const [fileId, setFileId] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [files, setFiles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  // A port waiting for the node it should lead to: { nodeId, key } | null.
  const [connecting, setConnecting] = useState(null)
  const [status, setStatus] = useState(null)
  // The open confirm popup: { title, message, confirmLabel, resolve }.
  const [question, setQuestion] = useState(null)

  const open = (id) =>
    loadConversation(id)
      .then((loaded) => {
        setConversation(loaded)
        setFileId(id)
        setDirty(false)
        setSelectedId(null)
        setConnecting(null)
        setStatus(`Opened conversations/${id}.json.`)
      })
      .catch((error) => setStatus(`Could not open ${id}: ${error.message}`))

  useEffect(() => {
    listConversations()
      .then(setFiles)
      .catch((error) => setStatus(`Could not list conversations: ${error.message}`))
    if (initialId) open(initialId)
  }, [initialId])

  // change: a function of the conversation, or a new conversation.
  const edit = (change) => {
    setConversation((current) => (typeof change === 'function' ? change(current) : change))
    setDirty(true)
  }

  // Escape drops a pending connection; Delete removes the selected node (not while typing).
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select') || question) return
      if (event.key === 'Escape') setConnecting(null)
      if (event.key === 'Delete' && selectedId) {
        edit((current) => removeNode(current, selectedId))
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const warnings = useMemo(() => (conversation ? validateConversation(conversation) : []), [conversation])

  const askConfirm = (details) => new Promise((resolve) => setQuestion({ ...details, resolve }))
  const answer = (confirmed) => {
    question.resolve(confirmed)
    setQuestion(null)
  }
  const confirmDiscard = async () => !dirty || askConfirm({ title: 'Unsaved Changes', message: 'This conversation has unsaved changes. Discard them?', confirmLabel: 'Discard' })

  const setNode = (node) => edit((current) => ({ ...current, nodes: current.nodes.map((other) => (other.id === node.id ? node : other)) }))

  const addNode = (type) => {
    const selected = selectedId && getNode(conversation, selectedId)
    const lowest = Math.max(0, ...conversation.nodes.map((node) => node.position.y))
    const position = selected ? { x: selected.position.x + NODE_WIDTH + 60, y: selected.position.y } : { x: 40, y: conversation.nodes.length ? lowest + 160 : 40 }
    const node = createNode(type, nextId('n', conversation.nodes), position)
    edit((current) => ({ ...current, start: current.start ?? node.id, nodes: [...current.nodes, node] }))
    setSelectedId(node.id)
  }

  const link = (targetId) => {
    if (!connecting) return
    const { nodeId, key } = connecting
    setConnecting(null)
    if (nodeId === targetId) return
    edit((current) => ({ ...current, nodes: current.nodes.map((node) => (node.id === nodeId ? withLink(node, key, targetId) : node)) }))
  }

  const onNew = async () => {
    if (!(await confirmDiscard())) return
    setConversation(createConversation())
    setFileId(null)
    setDirty(false)
    setSelectedId(null)
    setStatus('New conversation. Give it a file id and Save.')
  }
  const onOpen = async (id) => {
    if (id && (await confirmDiscard())) open(id)
  }
  const onSave = async () => {
    const id = conversationFileId(conversation.id || conversation.name)
    if (!id) return setStatus('Give the conversation a file id first.')
    const renamed = !fileId || fileId.toLowerCase() !== id.toLowerCase()
    if (renamed && files.some((entry) => entry.id.toLowerCase() === id.toLowerCase())) {
      const overwrite = await askConfirm({ title: 'Conversation Exists', message: `conversations/${id}.json already exists. Overwrite it?`, confirmLabel: 'Overwrite' })
      if (!overwrite) return
    }
    try {
      const saved = { ...conversation, id }
      setFiles(await saveConversation(saved, fileId))
      setConversation(saved)
      setFileId(id)
      setDirty(false)
      setStatus(`Saved conversations/${id}.json.`)
    } catch (error) {
      setStatus(`Could not save: ${error.message}`)
    }
  }
  const onDelete = async () => {
    const confirmed = await askConfirm({ title: 'Delete Conversation', message: `Delete conversations/${fileId}.json? NPCs that open it will have nothing to say. This cannot be undone.`, confirmLabel: 'Delete' })
    if (!confirmed) return
    try {
      setFiles(await deleteConversation(fileId))
      setConversation(createConversation())
      setFileId(null)
      setDirty(false)
      setSelectedId(null)
      setStatus(`Deleted conversations/${fileId}.json.`)
    } catch (error) {
      setStatus(`Could not delete: ${error.message}`)
    }
  }

  const selected = conversation && selectedId ? getNode(conversation, selectedId) : null

  return (
    <div className="ce-screen">
      <div className="ce-toolbar">
        <button type="button" className="ce-button" onClick={async () => (await confirmDiscard()) && onBack()}>
          Back to Map
        </button>
        <select className="ce-input" value={fileId ?? ''} aria-label="Open conversation" onChange={(event) => onOpen(event.target.value)}>
          <option value="">{fileId ? 'Open…' : 'Not saved yet'}</option>
          {files.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} ({entry.id})
            </option>
          ))}
        </select>
        <button type="button" className="ce-button" onClick={onNew}>
          New
        </button>
        <button type="button" className={`ce-button${dirty ? ' is-primary' : ''}`} disabled={!canSaveConversations || !conversation} onClick={onSave}>
          Save{dirty ? ' *' : ''}
        </button>
        <button type="button" className="ce-button" disabled={!canSaveConversations || !fileId} onClick={onDelete}>
          Delete
        </button>
        {conversation && (
          <>
            <label className="ce-toolbar-field">
              File id
              <input className="ce-input" value={conversation.id} placeholder="engineerSealedSection" onChange={(event) => edit({ ...conversation, id: event.target.value })} />
            </label>
            <label className="ce-toolbar-field">
              Name
              <input className="ce-input ce-wide" value={conversation.name} onChange={(event) => edit({ ...conversation, name: event.target.value })} />
            </label>
          </>
        )}
      </div>
      <div className="ce-toolbar is-add">
        <span className="ce-field-label">Add node</span>
        {NODE_TYPES.map((type) => (
          <button key={type.id} type="button" className={`ce-button is-small is-${type.id}`} disabled={!conversation} onClick={() => addNode(type.id)}>
            {type.label}
          </button>
        ))}
        {connecting && <span className="ce-connecting">Connecting from {connecting.nodeId}: click the node it leads to (Escape cancels).</span>}
      </div>
      <div className="ce-body">
        {conversation ? (
          <ConversationCanvas
            conversation={conversation}
            selectedId={selectedId}
            connecting={connecting}
            onSelect={(id) => {
              setSelectedId(id)
              if (!id) setConnecting(null)
            }}
            onMove={(id, position) => edit((current) => ({ ...current, nodes: current.nodes.map((node) => (node.id === id ? { ...node, position } : node)) }))}
            onConnect={setConnecting}
            onLink={link}
          />
        ) : (
          <div className="ce-canvas" />
        )}
        <div className="ce-side">
          {selected ? (
            <NodeInspector
              key={selected.id}
              node={selected}
              nodes={conversation.nodes}
              isStart={conversation.start === selected.id}
              map={map}
              onChange={setNode}
              onDelete={() => {
                edit((current) => removeNode(current, selected.id))
                setSelectedId(null)
              }}
              onMakeStart={() => edit({ ...conversation, start: selected.id })}
            />
          ) : (
            <p className="ce-text">
              Select a node to edit it. Drag a node by its title. Click an output port (the dot on a node&apos;s right edge), then the node it leads to. Delete removes the
              selected node.
            </p>
          )}
          <p className="ce-heading">Warnings</p>
          {warnings.length ? (
            <ul className="ce-warnings">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="ce-text">None</p>
          )}
          {map && <p className="ce-text">Objective and challenge object pickers list {map.name || 'the open map'}&apos;s.</p>}
          {!canSaveConversations && <p className="ce-text is-warning">Saving only works from the dev server.</p>}
          {status && <p className="ce-status">{status}</p>}
        </div>
      </div>
      {question && <ConfirmDialog title={question.title} message={question.message} confirmLabel={question.confirmLabel} onConfirm={() => answer(true)} onCancel={() => answer(false)} />}
    </div>
  )
}
