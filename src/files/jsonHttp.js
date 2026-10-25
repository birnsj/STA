// Shared transport for the development server's simple JSON file endpoints.
// Callers retain their capability checks, local updates and response handling.
export async function requestJson(endpoint, method, body) {
  const response = await fetch(endpoint, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  return result
}
