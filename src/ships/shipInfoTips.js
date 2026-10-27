import { getStarshipTalentById } from './shipTalents.js'

const CORE = 'Star Trek Adventures 2E Core Rulebook'
const cite = (page, book = CORE) => (page ? `${book}, p.${page}` : null)

const SYSTEM_BLURB = {
  comms: 'Communications arrays, subspace links, and signal processing.',
  computers: 'Core processing, libraries, and shipboard automation.',
  engines: 'Warp, impulse, and power distribution.',
  sensors: 'Long- and short-range sensing suites.',
  structure: 'Hull integrity, plating, and internal framing.',
  weapons: 'Offensive systems and fire control.',
}

const DEPARTMENT_BLURB = {
  command: 'Command and control of the ship and its crew.',
  conn: 'Flight control, navigation, and helm operations.',
  engineering: 'Power, propulsion, and technical systems.',
  security: 'Tactical operations, security, and damage control.',
  science: 'Sensors, research, and analysis.',
  medicine: 'Sickbay, medical response, and crew health.',
}

export function eraTip(era) {
  if (!era) return null
  return {
    title: era.name,
    text: era.summary || era.overview,
    sections: era.years ? [{ label: 'Years', text: era.years }] : undefined,
    source: cite(193),
  }
}

export function spaceframeTip(frame) {
  if (!frame) return null
  return {
    title: frame.name,
    text: frame.overview,
    sections: [
      { label: 'Launch year', text: String(frame.launchYear) },
      { label: 'Scale', text: String(frame.scale) },
      frame.traits?.length ? { label: 'Traits', text: frame.traits.join(', ') } : null,
    ].filter(Boolean),
    source: cite(frame.page),
  }
}

export function missionProfileTip(profile) {
  if (!profile) return null
  return {
    title: profile.name,
    text: profile.overview,
    source: cite(profile.page),
  }
}

function formatTalentRequirements(req) {
  if (!req) return null
  const parts = []
  if (req.minYear != null) parts.push(`Year ${req.minYear}+`)
  if (req.maxYear != null) parts.push(`Not after year ${req.maxYear}`)
  if (req.klingonOrRomulan) parts.push('Klingon or Romulan starship')
  for (const [department, minimum] of Object.entries(req.departments ?? {})) {
    parts.push(`${department} ${minimum}+`)
  }
  for (const [system, minimum] of Object.entries(req.minSystem ?? {})) {
    parts.push(`${system} ${minimum}+`)
  }
  if (req.expansiveDepartment) parts.push('A department rated 5')
  if (req.traitsAny?.length) parts.push(`Trait: ${req.traitsAny.join(' or ')}`)
  return parts.length ? parts.join('; ') : 'None'
}

export function missionTalentTip(entry) {
  if (!entry) return null
  const talent = getStarshipTalentById(entry.id)
  if (talent?.effect) {
    const requirements = formatTalentRequirements(talent.requirements)
    return {
      title: talent.name,
      text: talent.effect,
      sections: requirements ? [{ label: 'Requirements', text: requirements }] : undefined,
      source: cite(talent.page),
    }
  }
  return {
    title: entry.name,
    text: 'Mission profile talent. Full rules are in Core pp. 218–225.',
    source: cite(218),
  }
}

export function serviceRecordTip(record) {
  if (!record) return null
  return {
    title: record.name,
    text: record.overview || record.summary || record.rule,
    sections: record.ruleName ? [{ label: record.ruleName, text: record.rule }] : undefined,
    source: cite(record.page ?? 216),
  }
}

export function narrativeServiceTip(entry, kindLabel) {
  if (!entry) return null
  return {
    title: entry.name,
    text: entry.description || entry.summary,
    sections: entry.implications ? [{ label: 'Implications', text: entry.implications }] : undefined,
    note: `${kindLabel} · Prototype narrative Trait (−1 / +1 on tagged tasks). Not STA 2E Service Record mechanics.`,
  }
}

export function starshipTalentTip(talent, note = null) {
  if (!talent) return null
  const requirements = formatTalentRequirements(talent.requirements)
  return {
    title: talent.name,
    text: talent.effect,
    sections: [
      requirements ? { label: 'Requirements', text: requirements } : null,
      talent.tab ? { label: 'Category', text: talent.tab === 'weapons' ? 'Weapons & Defenses' : 'Special Systems' } : null,
    ].filter(Boolean),
    note,
    source: cite(talent.page),
  }
}

export function finishingOptionTip(option, availability = null) {
  if (!option) return null
  const locked = availability && availability.available === false
  return {
    title: option.name,
    text: option.description || option.caption,
    sections: option.gameplay === 'earned'
      ? [{ label: 'Earned', text: 'Requires a Screen 04 honor. No System or Department bonuses.' }]
      : undefined,
    note: locked
      ? availability.reason
      : (option.caption && option.description && option.caption !== option.description ? option.caption : null),
    source: option.source ? cite(option.source.page, option.source.book) : null,
  }
}

export function systemTip(systemId, label = null) {
  const text = SYSTEM_BLURB[systemId]
  if (!text) return null
  return { title: label || systemId, text, source: cite(217) }
}

export function departmentTip(departmentId, label = null) {
  const text = DEPARTMENT_BLURB[departmentId]
  if (!text) return null
  return { title: label || departmentId, text, source: cite(212) }
}
