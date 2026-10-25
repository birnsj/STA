export const MAP_HISTORY_LIMIT = 100

export function createMapHistory(present) {
  return { present, undoStack: [], redoStack: [], stroke: null }
}

export function editMapHistory(history, next) {
  if (next === history.present) return history
  if (history.stroke) {
    const undoStack = history.stroke.pushed
      ? history.undoStack
      : [...history.undoStack.slice(-(MAP_HISTORY_LIMIT - 1)), history.stroke.before]
    return {
      present: next,
      undoStack,
      redoStack: history.stroke.pushed ? history.redoStack : [],
      stroke: { ...history.stroke, pushed: true },
    }
  }
  return {
    present: next,
    undoStack: [...history.undoStack.slice(-(MAP_HISTORY_LIMIT - 1)), history.present],
    redoStack: [],
    stroke: null,
  }
}

export function beginMapHistoryStroke(history) {
  return history.stroke ? history : { ...history, stroke: { before: history.present, pushed: false } }
}

export function endMapHistoryStroke(history) {
  return history.stroke ? { ...history, stroke: null } : history
}

export function undoMapHistory(history) {
  if (!history.undoStack.length) return history
  const previous = history.undoStack[history.undoStack.length - 1]
  return {
    present: previous,
    undoStack: history.undoStack.slice(0, -1),
    redoStack: [...history.redoStack, history.present],
    stroke: null,
  }
}

export function redoMapHistory(history) {
  if (!history.redoStack.length) return history
  const next = history.redoStack[history.redoStack.length - 1]
  return {
    present: next,
    undoStack: [...history.undoStack, history.present],
    redoStack: history.redoStack.slice(0, -1),
    stroke: null,
  }
}

export function replaceMapHistory(history, present) {
  return { ...history, present }
}
