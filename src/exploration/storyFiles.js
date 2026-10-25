// Dev map editor: saves the outro's story templates into missionLog.json through the dev server's /__story endpoint.
// Built copies bundle the file read-only.
import { requestJson } from '../files/jsonHttp.js'
import { STORY_TEMPLATES } from './missionStory.js'

export const canEditStory = import.meta.env.DEV

// story: { templateKey: text }. Also updates the loaded templates, so the next outro uses them without a reload.
export async function saveStoryTemplates(story) {
  const result = await requestJson('/__story', 'PUT', { story })
  Object.assign(STORY_TEMPLATES, result)
  return result
}
