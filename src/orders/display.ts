/** Format an API timestamp for managers while preserving malformed/unknown values verbatim. */
export function formatOrderDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString();
}
