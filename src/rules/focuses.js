import focusMatrix from '../data/source/focusMatrix.json'

// Book: a lifepath focus can be one of the step's examples, one of the Sample Focuses (Core pp.94-95), or the
// player's own. Prototype: every focus step offers all three.
export const getFocusDivisions = () => focusMatrix.divisions
export const isMatrixFocus = (name) => focusMatrix.divisions.some((division) => division.focuses.includes(name))
export const isBookFocus = (name, examples) => examples.includes(name) || isMatrixFocus(name)
export const getAllMatrixFocuses = () => focusMatrix.divisions.flatMap((division) => division.focuses)

// Picker groups: the step's examples (when it has any), then each matrix division.
export function getFocusGroups(examples) {
  const divisions = focusMatrix.divisions.map((division) => ({ id: division.id, name: `${division.name} focuses`, focuses: division.focuses }))
  return examples.length ? [{ id: 'examples', name: 'Book examples', focuses: examples }, ...divisions] : divisions
}
