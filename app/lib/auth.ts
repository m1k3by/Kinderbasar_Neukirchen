import jwt from 'jsonwebtoken';
import { env } from './env';

// Gültigkeit von Login-Token UND Cookie: 3 Tage, für alle Rollen. Ein Basar läuft Fr–So;
// bei 24 h lief die Anmeldung mitten im Betrieb ab (Basar 10/2026: Kasse brach ab, Warenkorb
// weg). Bewusst ein fester Ablauf statt gleitend erneuerter Token: eine Erneuerung pro Request
// kostet Rechenzeit und Schreibzugriffe, ein fester Ablauf kostet nichts.
export const SESSION_MAX_AGE_SECONDS = 3 * 24 * 60 * 60;

export const createToken = (payload: object) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: SESSION_MAX_AGE_SECONDS });
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