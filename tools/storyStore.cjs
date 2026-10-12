const fs = require('fs')

// Dev map editor's Story Wording: replaces the story templates in src/data/adaptation/exploration/missionLog.json.
// Used only by the dev server endpoint in vite.config.js. Only templates the file already has can be changed, and each
// must be text, so a bad request can't add or break keys the game reads.
function setStoryTemplates(file, story) {
  if (!story || typeof story !== 'object') throw new Error('No story templates sent')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const next = { ...data.story }
  Object.entries(story).forEach(([key, text]) => {
    if (!(key in next)) throw new Error(`Unknown story template ${key}`)
    if (typeof text !== 'string' || !text.trim()) throw new Error(`The ${key} template needs some text`)
    next[key] = text.trim()
  })
  fs.writeFileSync(file, `${JSON.stringify({ ...data, story: next }, null, 2)}\n`)
  return next
}

module.exports = { setStoryTemplates }
