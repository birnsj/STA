// Chooses which list of focuses is shown: the step's book examples or one Focus Matrix division.
export default function FocusGroupSelect({ groups, groupId, onChange }) {
  return (
    <select className="env-select" aria-label="Focus list" value={groupId} onChange={(event) => onChange(event.target.value)}>
      {groups.map((group) => (
        <option key={group.id} value={group.id}>{group.name}</option>
      ))}
    </select>
  )
}