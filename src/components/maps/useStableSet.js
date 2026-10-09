import { useMemo } from 'react'

// A Set of string keys kept the same object while its contents are: the views rebuild sets such as the faded blocks
// every render, and MapCanvas repaints whenever it is handed a different one.
export default function useStableSet(set) {
  const key = [...set].sort().join(' ')
  return useMemo(() => new Set(key ? key.split(' ') : []), [key])
}
