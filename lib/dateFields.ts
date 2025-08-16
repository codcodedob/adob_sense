// lib/dateFields.ts
export function dateFields(d = new Date()) {
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1; // 1..12
  const year = d.getUTCFullYear();
  return { day, month, year, iso: d.toISOString() };
}
