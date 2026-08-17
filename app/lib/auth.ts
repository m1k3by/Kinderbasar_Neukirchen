import jwt from 'jsonwebtoken';
import { env } from './env';

export const createToken = (payload: object) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1d' });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, env.JWT_SECRET);
};

// E-Mail aus Formularen enthält regelmäßig Leerzeichen am Rand (Copy&Paste, Autofill,
// Mobiltastatur hängt nach der Autokorrektur eins an). Ungetrimmt landet " a@b.de " in der
// Datenbank und der spätere Login mit "a@b.de" findet die Zeile nicht mehr – die Anmeldung
// scheitert dauerhaft mit "Ungültige Anmeldedaten". Deshalb an *jeder* Stelle, die eine
// E-Mail entgegennimmt (Registrierung, Login, Admin-Bearbeitung, Passwort-Reset), über
// diese Funktion normalisieren. Nicht-Strings werden zu '' und damit von den
// Pflichtfeld-Prüfungen abgefangen. Leerzeichen *innerhalb* der Adresse fängt die
// Formatprüfung ab (`[^\s@]+@[^\s@]+\.[^\s@]+`).
export const normalizeEmail = (email: unknown): string =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';