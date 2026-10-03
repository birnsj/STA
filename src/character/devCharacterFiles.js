// Dev server only (see vite.config.js): the same calls the desktop app exposes as window.characterFiles,
// saving to ./characters through the local server. Synchronous requests keep persistence.js synchronous;
// the files are small and the server is on this machine.
const ENDPOINT = '/__characters'

function request(method, body) {
  const xhr = new XMLHttpRequest()
  xhr.open(method, ENDPOINT, false)
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.send(body === undefined ? null : JSON.stringify(body))
  if (xhr.status !== 200) throw new Error(`Character files: ${xhr.status} ${xhr.responseText}`)
  return JSON.parse(xhr.responseText)
}

export const devCharacterFiles = {
  list: () => request('GET'),
  put: (entry) => request('PUT', entry),
  remove: (id) => request('DELETE', { id }),
}
