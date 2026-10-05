import roleSource from '../data/source/roles.json'

const rolesById = new Map(roleSource.roles.map((role) => [role.id, role]))

export const getRoles = () => roleSource.roles
export const getRoleById = (roleId) => rolesById.get(roleId) ?? null

// Book: a role's benefit has no name of its own, so it is labelled after the role.
export const getRoleBenefitName = (role) => `${role.name} Role Benefit`

// Book: no Service Role lists a department, rating, rank, or other requirement, so every known role is eligible.
// If one ever gains requirements, they are checked here.
export const isRoleEligible = (roleId) => Boolean(getRoleById(roleId))

export const getRoleRequirementSummary = () => 'None (the book lists none)'

const sourceText = (role) => `${role.source.book}, p.${role.source.page}`

export function getRoleTip(role) {
  return {
    title: role.name,
    text: role.description,
    sections: [
      { label: 'Role Benefit', text: role.benefit.description },
      { label: 'Requirements', text: getRoleRequirementSummary() },
    ],
    source: sourceText(role),
  }
}

// The export/runtime form: everything a later system needs without the role catalog.
export function getRoleRecord(roleRef) {
  const role = getRoleById(roleRef?.id)
  if (!role) return null
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    requirements: role.requirements,
    benefit: { id: role.id, name: getRoleBenefitName(role), description: role.benefit.description, effects: role.benefit.effects },
    era: role.era,
    reference: role.source,
  }
}
