// Temporary: speeds up testing by wiping every choice on every screen, as if starting a new character.
export default function ClearButton({ onClear }) {
  return (
    <button type="button" className="dev-button" onClick={onClear}>
      Clear
    </button>
  )
}
