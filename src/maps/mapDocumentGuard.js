export const createMapDocumentGuard = () => ({ revision: 0, operation: 0 })

export function noteMapDocumentChange(guard) {
  guard.revision += 1
  return guard.revision
}

export function beginMapDocumentOperation(guard) {
  guard.operation += 1
  return { operation: guard.operation, revision: guard.revision }
}

export const isMapDocumentOperationCurrent = (guard, token) =>
  Boolean(token) && token.operation === guard.operation && token.revision === guard.revision
