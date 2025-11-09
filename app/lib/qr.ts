import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

export const generateQR = async (text: string) => {
  try {
    return await QRCode.toDataURL(text);
  } catch (err) {
    console.error(err);
    throw new Error('Failed to generate QR code');
  }
};

export const generateBarcode = async (text: string): Promise<string> => {
  try {
    // Remove special characters and convert Umlaute for CODE128 compatibility
    const sanitized = text
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss')
      .replace(/_/g, ' ');  // Replace underscores with spaces
    
    // bwip-js works in Edge Runtime (no native dependencies)
    const png = await bwipjs.toBuffer({
      bcid: 'code128',       // Barcode type
      text: sanitized,       // Text to encode
      scale: 3,              // 3x scaling factor
      height: 10,            // Bar height, in millimeters
      includetext: true,     // Show human-readable text
      textxalign: 'center',  // Center text
    });
    
    // Convert buffer to base64 data URL
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (err) {
    console.error(err);
    throw new Error('Failed to generate barcode');
  }
};