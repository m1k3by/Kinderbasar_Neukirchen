/**
 * Konfiguration des QR-Scanners an der Kasse (html5-qrcode 2.3.8).
 *
 * Warum das nicht überall gleich sein darf – der Unterschied Android/iPhone hat genau eine
 * Ursache, und sie steckt in html5-qrcode/esm/code-decoder.js:
 *
 *   if (useBarCodeDetectorIfSupported && BarcodeDetectorDelegate.isSupported())
 *        → nativer Decoder (BarcodeDetector)
 *   else → ZXingHtml5QrcodeDecoder, reines JavaScript auf dem Hauptthread
 *
 * Chrome auf Android bringt `BarcodeDetector` mit: das Dekodieren passiert in nativem Code
 * und kostet den Hauptthread fast nichts. iOS Safari hat `BarcodeDetector` nicht – dort läuft
 * ZXing in JavaScript, und jedes Einzelbild blockiert den Hauptthread für Dutzende
 * Millisekunden. Bei 15 Bildern pro Sekunde kommt React zwischen zwei Dekodierläufen nicht
 * mehr zum Zeichnen: die Vorschau bleibt stehen, Tippen reagiert verzögert – das „Einfrieren".
 *
 * Deshalb wird nicht auf das Gerät geprüft, sondern auf die Ursache: gibt es einen nativen
 * Decoder? Sobald Safari `BarcodeDetector` nachliefert, greift dort automatisch die schnelle
 * Einstellung, ohne dass hier etwas geändert werden muss.
 */

export interface ScannerTuning {
  fps: number;
  /** Anteil der kürzeren Kantenlänge, den das Suchfenster einnimmt. */
  qrboxRatio: number;
  disableFlip: boolean;
  videoConstraints: MediaTrackConstraints;
  /** Wartezeit nach einem Treffer, bevor weitergescannt wird (ms). */
  resumeDelayMs: number;
}

export function hasNativeBarcodeDetector(win: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  return !!win && typeof (win as { BarcodeDetector?: unknown }).BarcodeDetector === 'function';
}

export function scannerTuning(native: boolean): ScannerTuning {
  return {
    // Ohne nativen Decoder ist eine *niedrigere* Bildrate schneller: der Hauptthread bekommt
    // zwischen den Dekodierläufen Luft, die Vorschau läuft flüssig und ein Treffer wird
    // trotzdem in Sekundenbruchteilen erkannt.
    fps: native ? 15 : 8,
    // Kleineres Suchfenster = weniger Pixel je Dekodierlauf. Die Fläche geht quadratisch
    // ein: 0,55 statt 0,72 sind nur noch 58 % der Bildpunkte.
    qrboxRatio: native ? 0.72 : 0.55,
    // html5-qrcode dekodiert jedes *erfolglose* Bild ein zweites Mal gespiegelt
    // (DEFAULT_DISABLE_FLIP = false). Beim Zielen schlägt fast jedes Bild fehl, das ist also
    // dauerhaft die doppelte Arbeit. Etiketten werden nie gespiegelt gedruckt.
    disableFlip: true,
    // Ohne Begrenzung liefert ein iPhone gern 1920×1080 oder mehr und jedes Bild muss vor
    // dem Dekodieren heruntergerechnet werden. 1280×720 reicht für QR-Codes auf 17 mm.
    videoConstraints: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    // Nach einem Treffer pausiert die Kasse kurz, damit derselbe Code nicht sofort erneut
    // auslöst. Gegen Doppelscans schützt ohnehin die Code-Merkliste in der Kasse (3-Sekunden-
    // Fenster), deshalb reicht eine kurze Pause – 1,5 s fühlten sich wie ein Hänger an.
    resumeDelayMs: 600,
  };
}

/**
 * Was mit dem Scanner zu tun ist, wenn die Seite wieder in den Vordergrund kommt.
 *
 * iOS Safari hält den Kamerastream an, sobald die Seite in den Hintergrund gerät –
 * App-Wechsel, Sperrbildschirm, eingehender Anruf, Benachrichtigung. Beim Zurückkehren
 * bleibt das <video> pausiert oder der Track ist ganz beendet. html5-qrcode bemerkt das
 * nicht (die Bibliothek hat keinen visibilitychange-Listener) und zeichnet in ihrer
 * Endlosschleife weiter dasselbe Standbild ab: die Vorschau steht, Scannen bleibt ohne
 * jede Fehlermeldung dauerhaft wirkungslos. Genau das sieht wie „eingefroren" aus, und es
 * geht von allein nie wieder weg.
 *
 * - `restart`: kein Video oder Track beendet – der Stream ist tot, nur ein Neustart hilft.
 * - `resume`: Video ist nur pausiert, ein play() reicht.
 * - `ok`: läuft, nichts zu tun.
 */
export type ScannerRecovery = 'ok' | 'resume' | 'restart';

interface VideoLike {
  paused: boolean;
  srcObject: unknown;
}

export function scannerRecoveryAction(video: VideoLike | null | undefined): ScannerRecovery {
  if (!video) return 'restart';
  const stream = video.srcObject as { getVideoTracks?: () => { readyState: string }[] } | null;
  const tracks = stream?.getVideoTracks?.() ?? [];
  // Kein Track oder ein beendeter Track: der Stream lässt sich nicht wiederbeleben.
  if (tracks.length === 0 || tracks.some(t => t.readyState === 'ended')) return 'restart';
  return video.paused ? 'resume' : 'ok';
}

/** Fertige `Html5QrcodeCameraScanConfig` für `Html5Qrcode.start()`. */
export function buildScannerConfig(tuning: ScannerTuning) {
  return {
    fps: tuning.fps,
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * tuning.qrboxRatio);
      return { width: size, height: size };
    },
    disableFlip: tuning.disableFlip,
    videoConstraints: tuning.videoConstraints,
  };
}
