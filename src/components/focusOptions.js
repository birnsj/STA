// ChoiceList option for a focus; one the character already has elsewhere is disabled, with where on hover.
export function toFocusOption(name, heldElsewhere) {
  const where = heldElsewhere.get(name.toLowerCase())
  if (!where) return { id: name, label: name }
  return { id: name, label: name, disabled: true, suffix: 'Taken', title: `Already chosen: ${where}` }
}

// The group (book examples or matrix division) to show first: the one holding `name`, else the first.
export const initialGroupId = (groups, name) => (groups.find((group) => group.focuses.includes(name)) ?? groups[0]).id
