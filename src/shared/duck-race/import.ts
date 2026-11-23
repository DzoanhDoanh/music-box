import { entryInputSchema, type EntryInput } from './contracts';
/** RFC4180-style CSV: quoted commas/newlines and escaped quotes, with bounded input. */
export function parseEntries(text: string): EntryInput[] {
  if (text.length > 16000) throw new Error('Danh sách quá dài.');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(cell);
      cell = '';
      if (c !== ',') {
        if (row.some((s) => s.trim())) rows.push(row);
        row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else cell += c;
  }
  if (quoted) throw new Error('CSV thiếu dấu ngoặc kép đóng.');
  row.push(cell);
  if (row.some((s) => s.trim())) rows.push(row);
  if (rows[0] && ['name', 'tên', 'ten'].includes(rows[0][0].trim().toLowerCase())) rows.shift();
  if (rows.length < 2 || rows.length > 30) throw new Error('Cần từ 2 đến 30 mục.');
  return rows.map((r) =>
    entryInputSchema.parse({ name: r[0], team: r[1]?.trim() ?? '', skin: 'YELLOW' }),
  );
}
