// Client-side CSV export for the Epic 4 tables -- matches Banani's
// "Exporter" button. No server round trip: builds the CSV from the rows
// already loaded on the page.
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
  // UTF-8 BOM (escape sequence, not a literal char) so Excel detects the
  // encoding instead of mangling accented characters.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
