/** Validierung für Neuigkeiten (Post) – geteilt von POST und PATCH /api/admin/posts. */

export const MAX_PDF_BYTES = 4 * 1024 * 1024; // Vercel begrenzt Request-Bodys auf 4,5 MB

export type PdfResult = { ok: true; fileName: string; data: Uint8Array<ArrayBuffer> } | { ok: false; error: string };

/** Nur echte PDFs: MIME-Typ UND Magic Bytes – der Content-Type kommt vom Client und beweist nichts. */
export async function readPdf(file: File): Promise<PdfResult> {
  if (file.type !== 'application/pdf') return { ok: false, error: 'Nur PDF-Dateien sind erlaubt' };
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: 'Die PDF-Datei ist größer als 4 MB' };
  const data = new Uint8Array(await file.arrayBuffer());
  if (data.length > MAX_PDF_BYTES) return { ok: false, error: 'Die PDF-Datei ist größer als 4 MB' };
  if (Buffer.from(data.subarray(0, 5)).toString('latin1') !== '%PDF-') {
    return { ok: false, error: 'Die Datei ist keine gültige PDF-Datei' };
  }
  return { ok: true, fileName: file.name.slice(0, 200) || 'datei.pdf', data };
}

export function validateTitle(title: string): string | null {
  return title.length >= 1 && title.length <= 200 ? null : 'Der Titel muss 1 bis 200 Zeichen lang sein';
}

export function validateBody(body: string): string | null {
  return body.length <= 5000 ? null : 'Der Text darf höchstens 5000 Zeichen lang sein';
}
