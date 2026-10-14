// A plain tooltip text (an element's title) as the creator's info box content ({ title, text }). The first line is
// the box's title; any more lines are its text. A one-line "Name: what it does" splits at the colon; a one-line
// sentence too long for the title strip is shown as text only.
const TITLE_MAX = 40
// A toggle's "On: what it does. Off: ..." describes its states; neither is a name.
const NOT_TITLES = ['On', 'Off']

export function titleTipContent(raw) {
  const lines = String(raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return null
  if (lines.length > 1) return { title: lines[0], text: lines.slice(1).join('\n') }
  const [line] = lines
  const colon = line.indexOf(': ')
  if (colon > 0 && colon <= TITLE_MAX && !NOT_TITLES.includes(line.slice(0, colon))) return { title: line.slice(0, colon), text: line.slice(colon + 2) }
  return line.length <= TITLE_MAX ? { title: line } : { title: null, text: line }
}
