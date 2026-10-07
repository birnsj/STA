import { useCharacter } from '../character/useCharacter.js'
import { serializeCharacter } from '../export/serializeCharacter.js'
import { downloadJson, toSafeFilename } from '../export/downloadJson.js'

export default function ExportButton({ className = 'dev-button', label = 'Export JSON (dev)' }) {
  const { character } = useCharacter()
  return (
    <button type="button" className={className} onClick={() => downloadJson(serializeCharacter(character), toSafeFilename(character.identity.name))}>
      {label}
    </button>
  )
}
