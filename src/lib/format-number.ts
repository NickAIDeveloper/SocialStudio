/**
 * Thousands separators without depending on the runtime locale, so copy reads
 * the same on a server render, a client render and in a test.
 */
export function formatCount(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return (
    sign +
    Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  );
}
