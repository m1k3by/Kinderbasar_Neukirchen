import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dec } from '../helpers/decimal';
import zlib from 'zlib';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  basarSeller: { findUnique: vi.fn() },
  article: { findMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/basars/[id]/labels.pdf/route';
import { LABELS_PER_SHEET } from '@/app/lib/labels';

const PT_PER_MM = 72 / 25.4;

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeRequest(query = '') {
  return new Request(`http://localhost/api/basars/basar-1/labels.pdf${query}`);
}

const fakeBasar = { id: 'basar-1', title: 'Frühjahrsbasar 2026' };
const fakeBasarSeller = { id: 'bs-1', sellerId: 9001 };

function makeArticles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    title: `Artikel ${i}`,
    sizeLabel: '116',
    gender: 'Junge',
    price: dec(2.5),
    qrCode: `KB-9001-${String(i).padStart(4, '0')}`,
  }));
}

function happyPath(articles = makeArticles(3)) {
  prismaMock.basar.findUnique.mockResolvedValue(fakeBasar);
  prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
  prismaMock.article.findMany.mockResolvedValue(articles);
}

async function pdfBuffer(res: Response) {
  return Buffer.from(await res.arrayBuffer());
}

/** Entpackt den größten Content-Stream – dort stehen Text- und Zeichenoperationen. */
function contentStream(buf: Buffer): string {
  let best: Buffer | null = null;
  const re = /stream\r?\n/g;
  const raw = buf.toString('latin1');
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      const out = zlib.inflateSync(buf.subarray(start, end));
      if (!best || out.length > best.length) best = out;
    } catch {
      /* kein Flate-Stream */
    }
  }
  return best ? best.toString('latin1') : '';
}

/** Alle Textanker (Td-Operatoren) als {x, y} in PDF-Punkten. */
function textAnchors(content: string): { x: number; y: number }[] {
  return [...content.matchAll(/([\d.]+) ([\d.]+) Td/g)].map(m => ({
    x: parseFloat(m[1]),
    y: parseFloat(m[2]),
  }));
}

/**
 * Rechtecke aus dem Content-Stream, in mm ab Blattecke oben links.
 * jsPDF schreibt `x y w -h re` – die Höhe ist negativ, das Rechteck wächst nach unten.
 */
function rects(content: string): { left: number; right: number; top: number; bottom: number }[] {
  return [...content.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)].map(m => {
    const x = parseFloat(m[1]) / PT_PER_MM;
    const y = parseFloat(m[2]) / PT_PER_MM;
    const w = parseFloat(m[3]) / PT_PER_MM;
    const h = parseFloat(m[4]) / PT_PER_MM;
    return {
      left: Math.min(x, x + w),
      right: Math.max(x, x + w),
      top: 297 - Math.max(y, y + h),
      bottom: 297 - Math.min(y, y + h),
    };
  });
}

/** Dedupliziert nahe beieinanderliegende Werte, ohne die Messgenauigkeit zu verlieren. */
function uniqSorted(values: number[], digits = 6): number[] {
  return [...new Set(values.map(v => Number(v.toFixed(digits))))].sort((a, b) => a - b);
}

describe('GET /api/basars/[id]/labels.pdf – Auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 ohne Token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('403 wenn Verkäufer einen fremden Bogen anfordert', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    const res = await GET(makeRequest('?sellerId=9002'), makeContext());
    expect(res.status).toBe(403);
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('Verkäufer bekommt den eigenen Bogen, sellerId aus dem Token', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    happyPath();
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(prismaMock.basarSeller.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { basarId_sellerId: { basarId: 'basar-1', sellerId: 9001 } },
      })
    );
  });

  it('Admin darf mit ?sellerId einen fremden Bogen erzeugen', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    happyPath();
    const res = await GET(makeRequest('?sellerId=9001'), makeContext());
    expect(res.status).toBe(200);
  });

  it('400 wenn Admin ohne sellerId anfragt', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(400);
  });

  it('404 bei unbekanntem Basar', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('404 wenn der Verkäufer nicht am Basar teilnimmt', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    prismaMock.basar.findUnique.mockResolvedValue(fakeBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('409 wenn keine Artikel vorhanden sind', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    happyPath([]);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(409);
  });
});

describe('GET /api/basars/[id]/labels.pdf – PDF-Struktur', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
  });

  it('liefert application/pdf mit Download-Dateinamen', async () => {
    happyPath();
    const res = await GET(makeRequest(), makeContext());
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    // Umlaute im Basartitel dürfen nicht im Header landen
    const cd = res.headers.get('Content-Disposition')!;
    expect(cd).toBe('attachment; filename="etiketten-fruehjahrsbasar-2026-vk9001.pdf"');
    expect(cd).toMatch(/^[\x20-\x7E]+$/);
  });

  it('ist ein A4-PDF', async () => {
    happyPath();
    const buf = await pdfBuffer(await GET(makeRequest(), makeContext()));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const mediaBox = buf.toString('latin1').match(/\/MediaBox\s*\[([^\]]*)\]/)![1];
    const [, , w, h] = mediaBox.trim().split(/\s+/).map(Number);
    expect(w).toBeCloseTo(595.28, 1);
    expect(h).toBeCloseTo(841.89, 1);
  });

  it('setzt /PrintScaling /None', async () => {
    happyPath();
    const buf = await pdfBuffer(await GET(makeRequest(), makeContext()));
    expect(buf.toString('latin1')).toContain('/PrintScaling /None');
  });

  it('enthält keine Bilder – QR-Codes sind Vektor', async () => {
    happyPath();
    const buf = await pdfBuffer(await GET(makeRequest(), makeContext()));
    expect(buf.toString('latin1')).not.toMatch(/\/Subtype\s*\/Image/);
  });

  it('bettet keine Schriften ein, nutzt nur Standardfonts', async () => {
    happyPath();
    const raw = (await pdfBuffer(await GET(makeRequest(), makeContext()))).toString('latin1');
    expect(raw).not.toMatch(/\/FontFile\d?/);
    expect(raw).toContain('/Helvetica');
    expect(raw).not.toContain('/Arial');
  });
});

describe('GET /api/basars/[id]/labels.pdf – Geometrie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
  });

  it('hält exakt das Avery-3475-Raster von 70 × 36 mm ein', async () => {
    happyPath(makeArticles(LABELS_PER_SHEET));
    const buf = await pdfBuffer(await GET(makeRequest(), makeContext()));
    const anchors = textAnchors(contentStream(buf));
    expect(anchors.length).toBeGreaterThan(0);

    // Die Textspalte jedes Etiketts beginnt linksbündig bei x + 38 mm (5 + 31 QR + 2). Über den vollen
    // Bogen müssen daraus exakt drei x-Werte im Abstand von 70 mm entstehen.
    const colStarts = uniqSorted(
      anchors.map(a => a.x / PT_PER_MM).filter(mm => Math.abs((mm % 70) - 38) < 0.01)
    );
    expect(colStarts).toHaveLength(3);
    expect(colStarts[1] - colStarts[0]).toBeCloseTo(70, 3);
    expect(colStarts[2] - colStarts[1]).toBeCloseTo(70, 3);

    // Erste Grundlinie der Bezeichnung liegt 14,5 mm unter der Etikettenoberkante;
    // über acht Zeilen müssen daraus acht Werte im Abstand von 36 mm entstehen.
    const rowStarts = uniqSorted(
      anchors
        .map(a => 297 - a.y / PT_PER_MM)
        .filter(mm => Math.abs(((mm - 4.5) % 36) - 14.5) < 0.01)
    );
    expect(rowStarts).toHaveLength(8);
    for (let i = 1; i < rowStarts.length; i++) {
      expect(rowStarts[i] - rowStarts[i - 1]).toBeCloseTo(36, 3);
    }
  });

  it('hält überall mindestens 5 mm Abstand zur Blattkante', async () => {
    happyPath(makeArticles(LABELS_PER_SHEET));
    const buf = await pdfBuffer(await GET(makeRequest(), makeContext()));
    const content = contentStream(buf);

    const qrModules = rects(content);
    expect(qrModules.length).toBeGreaterThan(100);

    for (const r of qrModules) {
      expect(r.left).toBeGreaterThanOrEqual(5 - 0.01);
      expect(r.right).toBeLessThanOrEqual(210 - 5 + 0.01);
      expect(r.top).toBeGreaterThanOrEqual(5 - 0.01);
      expect(r.bottom).toBeLessThanOrEqual(297 - 5 + 0.01);
    }

    for (const a of textAnchors(content)) {
      expect(a.x / PT_PER_MM).toBeGreaterThanOrEqual(5 - 0.01);
      expect(a.x / PT_PER_MM).toBeLessThanOrEqual(210 - 5 + 0.01);
      expect(297 - a.y / PT_PER_MM).toBeGreaterThanOrEqual(5 - 0.01);
      expect(297 - a.y / PT_PER_MM).toBeLessThanOrEqual(297 - 5 + 0.01);
    }
  });

  it('bricht nach 24 Etiketten auf eine neue Seite um', async () => {
    happyPath(makeArticles(LABELS_PER_SHEET));
    const one = await pdfBuffer(await GET(makeRequest(), makeContext()));
    expect(one.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);

    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    happyPath(makeArticles(LABELS_PER_SHEET + 1));
    const two = await pdfBuffer(await GET(makeRequest(), makeContext()));
    expect(two.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2);
  });

  it('?from=5 beginnt in Spalte 3, Zeile 2', async () => {
    happyPath(makeArticles(1));
    const buf = await pdfBuffer(await GET(makeRequest('?from=5'), makeContext()));
    const anchors = textAnchors(contentStream(buf));
    const minX = Math.min(...anchors.map(a => a.x)) / PT_PER_MM;
    const maxY = Math.max(...anchors.map(a => 297 - a.y / PT_PER_MM));
    expect(minX).toBeGreaterThan(2 * 70); // dritte Spalte
    expect(maxY).toBeGreaterThan(4.5 + 36); // zweite Zeile
  });

  it('ignoriert ein unbrauchbares from und beginnt bei Etikett 1', async () => {
    happyPath(makeArticles(1));
    const buf = await pdfBuffer(await GET(makeRequest('?from=999'), makeContext()));
    const anchors = textAnchors(contentStream(buf));
    const minX = Math.min(...anchors.map(a => a.x)) / PT_PER_MM;
    expect(minX).toBeLessThan(70);
  });
});

describe('GET /api/basars/[id]/labels.pdf – Inhalt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
  });

  it('kürzt lange Bezeichnungen auf drei Zeilen und lässt sie im Etikett', async () => {
    happyPath([
      {
        title: 'Hshehejejehsjdjdjdjdjdjdjdjd Winterjacke Lego mit sehr langem Namen ohne Ende',
        sizeLabel: '116',
        gender: 'Junge',
        price: dec(5),
        qrCode: 'KB-9001-0001',
      },
    ]);
    const buf = await pdfBuffer(await GET(makeRequest(), makeContext()));
    const content = contentStream(buf);
    expect(content).toContain('\x85'); // Auslassungszeichen, WinAnsi 0x85

    // Grundlinien der Bezeichnung liegen bei 19,0 / 22,9 / 26,8 mm – genau drei, keine vierte
    // Zeile, und alle oberhalb des unteren Bands (Größe · Zielgruppe · Preis).
    const titleYs = uniqSorted(
      textAnchors(content)
        .map(a => 297 - a.y / PT_PER_MM)
        .filter(mm => mm > 17 && mm < 30)
    );
    expect(titleYs).toHaveLength(3);
    expect(titleYs[0]).toBeCloseTo(4.5 + 14.5, 2);
    expect(titleYs[2]).toBeLessThan(4.5 + 26.6 - 2); // oberhalb der Zielgruppenzeile
  });

  it('schreibt Umlaute und das Eurozeichen', async () => {
    happyPath([
      { title: 'Jäckchen grün', sizeLabel: '110', gender: 'Mädchen', price: dec(12.5), qrCode: 'KB-1' },
    ]);
    const content = contentStream(await pdfBuffer(await GET(makeRequest(), makeContext())));
    expect(content).toContain('J\xe4ckchen gr\xfcn'); // WinAnsi: ä = 0xE4, ü = 0xFC
    expect(content).toContain('12,50 \x80'); // WinAnsi: € = 0x80
  });

  it('druckt die Verkäufernummer aus dem BasarSeller-Datensatz', async () => {
    happyPath(makeArticles(1));
    const content = contentStream(await pdfBuffer(await GET(makeRequest(), makeContext())));
    expect(content).toContain('9001');
  });
});

describe('GET /api/basars/[id]/labels.pdf?calibration=1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
  });

  it('liefert eine einseitige Testseite ohne Datenbankzugriff', async () => {
    const res = await GET(makeRequest('?calibration=1'), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('etiketten-testseite.pdf');
    expect(prismaMock.basar.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();

    const buf = await pdfBuffer(res);
    expect(buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
    expect(buf.toString('latin1')).toContain('/PrintScaling /None');
  });

  it('braucht trotzdem eine Anmeldung', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest('?calibration=1'), makeContext());
    expect(res.status).toBe(401);
  });
});

describe('GET /api/basars/[id]/labels.pdf – Fehlerbehandlung', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
  });

  it('500 bei Datenbankfehler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    prismaMock.basar.findUnique.mockRejectedValue(new Error('db weg'));
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
