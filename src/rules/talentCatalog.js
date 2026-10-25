import talentSource from '../data/source/talents.json'

const talentsById = new Map(talentSource.talents.map((talent) => [talent.id, talent]))

export const getTalentById = (id) => talentsById.get(id) ?? null

// Book p.127–128: Novice receives Untapped Potential and Veteran receives Veteran; Experienced chooses freely.
export function getFixedCareerTalentId(character) {
  return talentSource.careerLengthTalents[character.career.length?.id] ?? null
}
