/** Validierung für Neuigkeiten (Post) – geteilt von POST und PATCH /api/admin/posts. */

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel begrenzt Request-Bodys auf 4,5 MB

const OOXML = 'application/vnd.openxmlformats-officedocument';
const DOCX = `${OOXML}.wordprocessingml.document`;
const XLSX = `${OOXML}.spreadsheetml.sheet`;
const PPTX = `${OOXML}.presentationml.presentation`;
const OFFICE_BY_EXT: Record<string, string> = { docx: DOCX, xlsx: XLSX, pptx: PPTX };

/** Für <input accept>: die erlaubten Endungen. */
export const ACCEPT_ATTACHMENT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx';

const NOT_ALLOWED = 'Dieser Dateityp ist nicht erlaubt (erlaubt: PDF, PNG, JPEG, GIF, WebP, Word, Excel, PowerPoint)';

export type AttachmentResult =
  | { ok: true; fileName: string; fileType: string; data: Uint8Array<ArrayBuffer> }
  | { ok: false; error: string };

const startsWith = (d: Uint8Array, sig: number[], at = 0) => sig.every((b, i) => d[at + i] === b);
const ascii = (s: string) => [...s].map(c => c.charCodeAt(0));

/**
 * Typ aus den Magic Bytes – der vom Client gemeldete MIME-Typ beweist nichts. Bewusst eine
 * Positivliste: die Datei wird von unserer Domain ausgeliefert, HTML/SVG/JS liefen dort als Seite.
 * ZIP zählt nur mit Endung .docx/.xlsx/.pptx (OOXML ist ein ZIP; eine .zip-Datei ist es nicht).
 */
export function detectFileType(d: Uint8Array, fileName: string): string | null {
  if (startsWith(d, ascii('%PDF-'))) return 'application/pdf';
  if (startsWith(d, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(d, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(d, ascii('GIF87a')) || startsWith(d, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(d, ascii('RIFF')) && startsWith(d, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(d, [0x50, 0x4b, 0x03, 0x04])) {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return OFFICE_BY_EXT[ext] ?? null;
  }
  return null;
}

export async function readAttachment(file: File): Promise<AttachmentResult> {
  const tooBig = { ok: false, error: 'Die Datei ist größer als 4 MB' } as const;
  if (file.size > MAX_FILE_BYTES) return tooBig;
  const data = new Uint8Array(await file.arrayBuffer());
  if (data.length > MAX_FILE_BYTES) return tooBig;
  const fileType = detectFileType(data, file.name);
  if (!fileType) return { ok: false, error: NOT_ALLOWED };
  return { ok: true, fileName: file.name.slice(0, 200) || 'datei', fileType, data };
}

/**
 * Zeilen von vor der Migration 20261111140000 haben eine Datei, aber fileType = NULL – damals
 * war nur PDF erlaubt, es gibt bewusst keinen Backfill.
 */
export function fileTypeOrPdf(fileType: string | null | undefined): string {
  return fileType ?? 'application/pdf';
}

export const isImageType = (t: string) => t.startsWith('image/');

export function fileTypeLabel(t: string): string {
  if (t === 'application/pdf') return 'PDF';
  if (isImageType(t)) return 'Bild';
  if (t === DOCX) return 'Word';
  if (t === XLSX) return 'Excel';
  if (t === PPTX) return 'PowerPoint';
  return 'Datei';
}

export function validateTitle(title: string): string | null {
  return title.length >= 1 && title.length <= 200 ? null : 'Der Titel muss 1 bis 200 Zeichen lang sein';
}

export function validateBody(body: string): string | null {
  return body.length <= 5000 ? null : 'Der Text darf höchstens 5000 Zeichen lang sein';
}
