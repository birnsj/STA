// A JSON-style object: not null and not an array. Used to tell sections of saved or imported characters from other values.
export const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
