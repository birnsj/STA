import { requestJson } from '../files/jsonHttp.js'

// The MP3s in music/ the map editor can choose from (file names without ".mp3"). Only the dev server can list a folder,
// so a built copy gets an empty list: it still plays what a map names, it just can't offer a choice.
export async function listMusicFiles() {
  if (!import.meta.env.DEV) return []
  try {
    return await requestJson('/__music', 'GET')
  } catch {
    return []
  }
}
