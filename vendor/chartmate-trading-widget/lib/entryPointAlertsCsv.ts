/** CSV export for `entry_point_alerts` rows (shared by LiveEntryTrackingSection + EntryPointNotificationsBell). */

export type EntryPointAlertRow = {
  id: string;
  symbol: string;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
};

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildEntryDigestCsv(rows: EntryPointAlertRow[]): string {
  const header = ["id", "symbol", "title", "message", "created_at", "read_at", "metadata_json"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const meta = r.metadata != null ? JSON.stringify(r.metadata) : "";
    lines.push(
      [
        escapeCsvCell(r.id),
        escapeCsvCell(r.symbol),
        escapeCsvCell(r.title ?? ""),
        escapeCsvCell(r.message ?? ""),
        escapeCsvCell(r.created_at ?? ""),
        escapeCsvCell(r.read_at ?? ""),
        escapeCsvCell(meta),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
