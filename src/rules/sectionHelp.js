import sectionHelp from '../data/adaptation/sectionHelp.json'

// Builds a section's info box content; shared book concepts supply the title, definition, and page.
export function getSectionHelp(helpId) {
  const section = sectionHelp.sections[helpId]
  if (!section) return null
  const concept = sectionHelp.concepts[section.concept]
  const page = section.page ?? concept?.page
  return {
    title: section.title ?? concept?.name,
    sections: [
      { label: 'What it is', text: section.what ?? concept?.text },
      { label: 'On this screen', text: section.does },
    ],
    source: page ? `Captain's Log, p.${page}` : null,
  }
}
