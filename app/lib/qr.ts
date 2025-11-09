import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { createCanvas } from 'canvas';

export const generateQR = async (text: string) => {
  try {
    return await QRCode.toDataURL(text);
  } catch (err) {
    console.error(err);
    throw new Error('Failed to generate QR code');
  }
};

export const generateBarcode = (text: string): string => {
  try {
    // Remove special characters and convert umlauts for CODE128 compatibility
    const sanitized = text
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss')
      .replace(/_/g, ' ');  // Replace underscores with spaces
    
    const canvas = createCanvas(400, 100);
    JsBarcode(canvas, sanitized, {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 14,
      margin: 10
    });
    return canvas.toDataURL();
  } catch (err) {
    console.error(err);
    throw new Error('Failed to generate barcode');
  }
};