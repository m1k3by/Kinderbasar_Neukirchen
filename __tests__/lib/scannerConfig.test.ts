import { describe, it, expect } from 'vitest';
import {
  hasNativeBarcodeDetector,
  scannerTuning,
  buildScannerConfig,
  scannerRecoveryAction,
  SCANNER_VIEWPORT_HEIGHT,
} from '@/app/lib/scannerConfig';

describe('hasNativeBarcodeDetector', () => {
  it('erkennt einen vorhandenen nativen Decoder', () => {
    expect(hasNativeBarcodeDetector({ BarcodeDetector: function () {} })).toBe(true);
  });

  // iOS Safari: BarcodeDetector existiert schlicht nicht.
  it('meldet false, wenn kein BarcodeDetector existiert', () => {
    expect(hasNativeBarcodeDetector({})).toBe(false);
  });

  // Auf dem Server (Prerendering) gibt es kein window – die Prüfung darf nicht werfen.
  it('meldet false statt zu werfen, wenn es kein window gibt', () => {
    expect(hasNativeBarcodeDetector(undefined)).toBe(false);
    expect(hasNativeBarcodeDetector(null)).toBe(false);
  });

  it('lässt sich nicht von einem Nicht-Konstruktor täuschen', () => {
    expect(hasNativeBarcodeDetector({ BarcodeDetector: 'ja' })).toBe(false);
    expect(hasNativeBarcodeDetector({ BarcodeDetector: {} })).toBe(false);
  });
});

describe('scannerTuning', () => {
  const native = scannerTuning(true);
  const js = scannerTuning(false);

  // Kern der Sache: ohne nativen Decoder läuft ZXing in JavaScript auf dem Hauptthread.
  // Bleibt die Bildrate dann auf 15, blockiert das Dekodieren das Zeichnen – genau das
  // sah auf dem iPhone wie ein eingefrorener Scanner aus.
  it('senkt die Bildrate, wenn in JavaScript dekodiert werden muss', () => {
    expect(native.fps).toBe(15);
    expect(js.fps).toBeLessThan(native.fps);
  });

  // Die Rechenlast je Bild wächst mit der Fläche, also quadratisch mit dem Verhältnis.
  it('verkleinert das Suchfenster ohne nativen Decoder deutlich', () => {
    expect(js.qrboxRatio).toBeLessThan(native.qrboxRatio);
    const flaechenanteil = (js.qrboxRatio / native.qrboxRatio) ** 2;
    expect(flaechenanteil).toBeLessThan(0.7);
  });

  // html5-qrcode dekodiert jedes erfolglose Bild ein zweites Mal gespiegelt
  // (DEFAULT_DISABLE_FLIP = false). Beim Zielen schlägt fast jedes Bild fehl – das ist
  // dauerhaft doppelte Arbeit für einen Fall, den es bei gedruckten Etiketten nie gibt.
  it('schaltet den gespiegelten Zweitversuch immer ab', () => {
    expect(native.disableFlip).toBe(true);
    expect(js.disableFlip).toBe(true);
  });

  // Ohne Begrenzung liefert ein iPhone gern Full-HD oder mehr, und jedes Einzelbild muss
  // vor dem Dekodieren heruntergerechnet werden.
  it('begrenzt die Kameraauflösung und wählt die Rückkamera', () => {
    for (const tuning of [native, js]) {
      expect(tuning.videoConstraints.facingMode).toBe('environment');
      expect(tuning.videoConstraints.width).toEqual({ ideal: 1280 });
      expect(tuning.videoConstraints.height).toEqual({ ideal: 720 });
    }
  });

  it('hält die Pause nach einem Treffer kurz', () => {
    expect(js.resumeDelayMs).toBeLessThanOrEqual(600);
    expect(js.resumeDelayMs).toBeGreaterThan(0);
  });
});

describe('buildScannerConfig', () => {
  it('reicht die Werte unverändert an html5-qrcode weiter', () => {
    const tuning = scannerTuning(false);
    const config = buildScannerConfig(tuning);
    expect(config.fps).toBe(tuning.fps);
    expect(config.disableFlip).toBe(true);
    expect(config.videoConstraints).toBe(tuning.videoConstraints);
  });

  // qrbox bekommt html5-qrcode als Funktion und ruft sie mit den Maßen des Suchers auf.
  it('berechnet ein Querformat-Suchfenster', () => {
    const config = buildScannerConfig(scannerTuning(false)); // ratio 0.55
    // 220 sichtbare Höhe × 0,55 = 121; Breite im Verhältnis 1,5 : 1 = 181.
    expect(config.qrbox(400, 300)).toEqual({ width: 181, height: 121 });
    expect(config.qrbox(300, 400)).toEqual({ width: 181, height: 121 });
  });

  // Der Kern der Änderung: die Kasse zeigt nur einen Streifen von SCANNER_VIEWPORT_HEIGHT.
  // Ein Suchfenster, das sich an der (viel größeren) Videohöhe bemisst, läge zum Teil hinter
  // dem abgeschnittenen Rand – der Nutzer zielt dann auf einen Bereich, den er nicht sieht.
  it('hält das Suchfenster innerhalb des sichtbaren Streifens', () => {
    for (const native of [true, false]) {
      const config = buildScannerConfig(scannerTuning(native));
      // Typisches Handy im Hochformat: das Video ist weit höher als der Ausschnitt.
      const box = config.qrbox(377, 812);
      expect(box.height).toBeLessThanOrEqual(SCANNER_VIEWPORT_HEIGHT);
    }
  });

  // html5-qrcode verwirft ein Suchfenster, das größer als der Sucher ist
  // (getShadedRegionBounds), und scannt dann ohne Begrenzung weiter.
  it('passt bei jedem Seitenverhältnis in den Sucher', () => {
    const config = buildScannerConfig(scannerTuning(true)); // ratio 0.72, das größere Fenster
    for (const [w, h] of [[377, 812], [160, 812], [400, 150], [1280, 720]]) {
      const box = config.qrbox(w, h);
      expect(box.width).toBeLessThanOrEqual(w);
      expect(box.height).toBeLessThanOrEqual(h);
      expect(Number.isInteger(box.width)).toBe(true);
      expect(Number.isInteger(box.height)).toBe(true);
    }
  });

  // Die Begründung von qrboxRatio (weniger Bildpunkte je Dekodierlauf ohne nativen Decoder)
  // muss die Umstellung auf Querformat überleben.
  it('dekodiert ohne nativen Decoder weiterhin eine kleinere Fläche', () => {
    const flaeche = (native: boolean) => {
      const box = buildScannerConfig(scannerTuning(native)).qrbox(377, 812);
      return box.width * box.height;
    };
    expect(flaeche(false)).toBeLessThan(flaeche(true));
  });
});

// ─── Wiederanlauf nach dem Hintergrund ───────────────────────────────────────
// iOS Safari hält den Kamerastream an, wenn die Seite in den Hintergrund geht. html5-qrcode
// bemerkt das nicht und dekodiert danach endlos dasselbe Standbild – ohne Fehlermeldung.
// Die Entscheidung, was beim Zurückkehren zu tun ist, steckt deshalb hier.
describe('scannerRecoveryAction', () => {
  const track = (readyState: string) => ({ readyState });
  const video = (paused: boolean, tracks: { readyState: string }[] | null) => ({
    paused,
    srcObject: tracks === null ? null : { getVideoTracks: () => tracks },
  });

  it('lässt einen laufenden Scanner in Ruhe', () => {
    expect(scannerRecoveryAction(video(false, [track('live')]))).toBe('ok');
  });

  it('setzt ein nur pausiertes Video fort, statt neu zu starten', () => {
    expect(scannerRecoveryAction(video(true, [track('live')]))).toBe('resume');
  });

  // Der Kern: ein beendeter Track lässt sich nicht wiederbeleben. Würde hier 'resume'
  // zurückkommen, liefe play() ins Leere und die Vorschau bliebe für immer stehen.
  it('verlangt einen Neustart, wenn der Kamera-Track beendet ist', () => {
    expect(scannerRecoveryAction(video(true, [track('ended')]))).toBe('restart');
    // auch wenn das Video selbst noch als laufend gemeldet wird
    expect(scannerRecoveryAction(video(false, [track('ended')]))).toBe('restart');
  });

  it('verlangt einen Neustart ohne Track oder ohne Stream', () => {
    expect(scannerRecoveryAction(video(false, []))).toBe('restart');
    expect(scannerRecoveryAction(video(false, null))).toBe('restart');
  });

  // querySelector('video') liefert null, wenn html5-qrcode sein Element abgeräumt hat.
  it('verlangt einen Neustart, wenn gar kein Videoelement mehr da ist', () => {
    expect(scannerRecoveryAction(null)).toBe('restart');
    expect(scannerRecoveryAction(undefined)).toBe('restart');
  });
});
