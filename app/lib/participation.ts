/**
 * Nimmt jemand an einem Basar teil?
 *
 * Normalfall: die Zeile BasarSeller.isActive für genau diesen Basar, gesetzt durch die
 * eigene Aktivierung (PUT /api/basars/[id]/participation) oder stellvertretend durch einen
 * Admin. Fehlt die Zeile, nimmt die Person nicht teil.
 *
 * Ausnahme: Orga. Wer das Kennzeichen trägt, gilt in JEDEM Basar als teilnehmend, ohne sich
 * je aktiviert zu haben – auch in Basaren, für die es noch gar keine BasarSeller-Zeile gibt.
 *
 * Bewusst abgeleitet statt gespeichert: die Alternative wäre, beim Setzen des Kennzeichens
 * für jeden bestehenden Basar eine aktive Zeile anzulegen und beim Anlegen jedes neuen
 * Basars für jede Orga-Person eine weitere. Beide Wege müssten dauerhaft synchron gehalten
 * werden und liefen bei der ersten vergessenen Stelle auseinander. Die Ableitung kann nicht
 * veralten. Die BasarSeller-Zeile entsteht ohnehin von selbst, sobald die Person einen
 * Artikel anlegt (upsert in POST /api/basars/[id]/articles) – daran hängen die Artikel.
 */

export interface ParticipationSeller {
  isOrga?: boolean | null;
}

export interface ParticipationRow {
  isActive: boolean;
}

export function isParticipating(
  seller: ParticipationSeller | null | undefined,
  participation: ParticipationRow | null | undefined
): boolean {
  if (seller?.isOrga) return true;
  return participation?.isActive ?? false;
}

/**
 * Die Teilnahme-Angabe, wie sie an den Client geht: isActive bereits aufgelöst, damit keine
 * Oberfläche das Orga-Kennzeichen selbst kennen muss. `viaOrga` sagt, woher das true kommt –
 * die Oberfläche schaltet damit den Teilnahme-Umschalter ab, weil ein Abmelden für Orga
 * wirkungslos wäre und nur verwirren würde.
 */
export function participationPayload<T extends ParticipationRow>(
  seller: ParticipationSeller | null | undefined,
  participation: (T & ParticipationRow) | null | undefined
): (Omit<T, 'isActive'> & { isActive: boolean; viaOrga: boolean }) | { isActive: true; viaOrga: true } | null {
  const viaOrga = !!seller?.isOrga;
  if (!participation) return viaOrga ? { isActive: true, viaOrga: true } : null;
  return { ...participation, isActive: isParticipating(seller, participation), viaOrga };
}

/**
 * Filter der Teilnehmerliste auf /admin/basars/[id].
 *
 * „Aktiv angemeldet" heißt hier: die Zeile selbst trägt isActive=true (`activated`), also
 * genau die Menge, die gegen `maxSellers` zählt und die Kachel „aktiv angemeldet" zeigt.
 * Bewusst **nicht** das aufgelöste isActive aus isParticipating(): Orga-Personen, die sich
 * nie aktiviert haben, belegen keinen Platz und sollen in „ohne Artikel" nicht auftauchen –
 * sonst stimmt die Zahl im Filter nicht mehr mit der Kachel überein, und eine Erinnerung
 * „du hast noch keine Artikel" ginge an Leute, die gar nicht verkaufen.
 */
export type ParticipantFilter = 'all' | 'activated' | 'activatedNoArticles';

export function matchesParticipantFilter(
  row: { activated: boolean; viaOrga: boolean; _count: { articles: number } },
  filter: ParticipantFilter,
  // Blendet nur Orga aus. Mitarbeiter ohne Orga-Kennzeichen bleiben: viaOrga kommt allein
  // aus Seller.isOrga, nicht aus isEmployee.
  hideOrga = false
): boolean {
  if (hideOrga && row.viaOrga) return false;
  if (filter === 'activated') return row.activated;
  if (filter === 'activatedNoArticles') return row.activated && row._count.articles === 0;
  return true;
}
