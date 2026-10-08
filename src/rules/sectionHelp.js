import sectionHelp from '../data/adaptation/sectionHelp.json'

// Builds a section's info box content; shared book concepts supply the title, definition, and page.
export function getSectionHelp(helpId) {
  const section = sectionHelp.sections[helpId]
  if (!section) return null
  const concept = sectionHelp.concepts[section.concept]
  const page = section.page ?? concept?.page
  const book = section.book ?? ((!section.page && concept?.book) || "Captain's Log")
  return {
    title: section.title ?? concept?.name,
    sections: [
      { label: 'What it is', text: section.what ?? concept?.text },
      { label: 'On this screen', text: section.does },
    ],
    source: page ? `${book}, p.${page}` : null,
  }
}

// A shared book concept on its own (trait, attribute, discipline, focus, value, ...), for places that aren't a screen section.
export function getConceptHelp(conceptId) {
  const concept = sectionHelp.concepts[conceptId]
  if (!concept) return null
  return { title: concept.name, text: concept.text, source: concept.page ? `${concept.book ?? "Captain's Log"}, p.${concept.page}` : null }
}
