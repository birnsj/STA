import ChipGroup from './ChipGroup.jsx'

const SHORT_NAMES = { examples: 'Examples', command: 'CMD', conn: 'CONN', engineering: 'ENG', security: 'SEC', science: 'SCI', medicine: 'MED' }

// Chooses which list of focuses is shown: the step's book examples or one Focus Matrix division.
export default function FocusGroupSelect({ groups, groupId, onChange }) {
  return (
    <ChipGroup
      label="Focus list"
      className="focus-group-chips"
      options={groups.map((group) => ({ id: group.id, label: SHORT_NAMES[group.id] ?? group.name, title: group.name }))}
      value={groupId}
      onChange={onChange}
    />
  )
}
