/** A schema component name: dots and punctuation folded into underscores. */
export const componentName = (identifier: string): string => {
  const name = identifier.replaceAll('.', '_').replace(/[^A-Za-z0-9._-]/g, '_');
  // The generator looks up component IDs in an ordinary object.
  return Object.hasOwn(Object.prototype, name) ? `_${name}` : name;
};
