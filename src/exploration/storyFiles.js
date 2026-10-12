// Dev map editor: saves the outro's story templates into missionLog.json through the dev server's /__story endpoint.
// Built copies bundle the file read-only.
import { STORY_TEMPLATES } from './missionStory.js'

export const canEditStory = import.meta.env.DEV

// story: { templateKey: text }. Also updates the loaded templates, so the next outro uses them without a reload.
export async function saveStoryTemplates(story) {
  const response = await fetch('/__story', {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ story }),
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  Object.assign(STORY_TEMPLATES, result)
  return result
}
