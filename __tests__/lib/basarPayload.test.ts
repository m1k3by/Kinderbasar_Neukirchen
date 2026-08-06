import { describe, it, expect } from 'vitest';
import { buildBasarData, lockedFieldsForActiveBasar } from '@/app/lib/basarPayload';
import { DEFAULT_SIZES } from '@/app/lib/sizes';
import { parseAsGermanTime } from '@/app/lib/time';

describe('buildBasarData – create mode', () => {
  it('requires a title', () => {
    const result = buildBasarData({ dateFriday: '2025-06-13' }, 'create');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Titel/i);
  });

  it('rejects a blank/whitespace-only title', () => {
    const result = buildBasarData({ title: '   ', dateFriday: '2025-06-13' }, 'create');
    expect(result.ok).toBe(false);
  });

  it('requires at least one basar day', () => {
    const result = buildBasarData({ title: 'Basar' }, 'create');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Basartag/i);
  });

  it('derives eventDate as the earliest set day', () => {
    const result = buildBasarData(
      { title: 'Basar', dateSaturday: '2025-06-14', dateFriday: '2025-06-13' },
      'create'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data.eventDate as Date).getTime()).toBe(parseAsGermanTime('2025-06-13').getTime());
    }
  });

  it('defaults allowedSizes to DEFAULT_SIZES when not provided', () => {
    const result = buildBasarData({ title: 'Basar', dateFriday: '2025-06-13' }, 'create');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.allowedSizes).toBe(DEFAULT_SIZES);
  });

  it('uses a provided allowedSizes value as-is', () => {
    const result = buildBasarData({ title: 'Basar', dateFriday: '2025-06-13', allowedSizes: 'S,M,L' }, 'create');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.allowedSizes).toBe('S,M,L');
  });

  it.each([
    ['maxSellers', -1],
    ['maxSellers', 0],
    ['maxSellers', 100001],
    ['maxArticlesPerSeller', 0],
    ['commissionPercent', -1],
    ['commissionPercent', 101],
    ['entryFee', -0.01],
  ])('rejects %s out of range (%d)', (field, value) => {
    const result = buildBasarData(
      { title: 'Basar', dateFriday: '2025-06-13', [field]: value },
      'create'
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a non-numeric value for a numeric field', () => {
    const result = buildBasarData({ title: 'Basar', dateFriday: '2025-06-13', commissionPercent: 'abc' }, 'create');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Zahl/i);
  });

  it('rejects an empty string for a numeric field rather than silently defaulting', () => {
    const result = buildBasarData({ title: 'Basar', dateFriday: '2025-06-13', entryFee: '' }, 'create');
    expect(result.ok).toBe(false);
  });

  it('accepts valid boundary values (0 and 100 for commissionPercent)', () => {
    const low = buildBasarData({ title: 'Basar', dateFriday: '2025-06-13', commissionPercent: 0 }, 'create');
    const high = buildBasarData({ title: 'Basar', dateFriday: '2025-06-13', commissionPercent: 100 }, 'create');
    expect(low.ok).toBe(true);
    expect(high.ok).toBe(true);
  });

  it('rejects an invalid date string for a window field', () => {
    const result = buildBasarData(
      { title: 'Basar', dateFriday: '2025-06-13', deliveryStart: 'not-a-date' },
      'create'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/deliveryStart/);
  });

  it('treats an empty string window field as "clear" (null), not an error', () => {
    const result = buildBasarData(
      { title: 'Basar', dateFriday: '2025-06-13', deliveryStart: '' },
      'create'
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.deliveryStart).toBeNull();
  });
});

describe('buildBasarData – update mode', () => {
  const existing = {
    dateFriday: new Date('2025-06-13T00:00:00Z'),
    dateSaturday: new Date('2025-06-14T00:00:00Z'),
    dateSunday: null,
  };

  it('does not require a title when it is not part of the update', () => {
    const result = buildBasarData({ location: 'Gemeindehaus' }, 'update', existing);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.title).toBeUndefined();
  });

  it('rejects an explicit blank title on update', () => {
    const result = buildBasarData({ title: '' }, 'update', existing);
    expect(result.ok).toBe(false);
  });

  it('does not touch eventDate when no day field is part of the update', () => {
    const result = buildBasarData({ location: 'Neuer Ort' }, 'update', existing);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.eventDate).toBeUndefined();
  });

  it('re-derives eventDate from the mix of changed and existing days', () => {
    // Moving Friday later should shift eventDate to the untouched Saturday.
    const result = buildBasarData({ dateFriday: '2025-06-20' }, 'update', existing);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data.eventDate as Date).toISOString().slice(0, 10)).toBe('2025-06-14');
    }
  });

  it('rejects clearing every day down to none', () => {
    const result = buildBasarData(
      { dateFriday: '', dateSaturday: '' },
      'update',
      existing
    );
    expect(result.ok).toBe(false);
  });

  it('leaves numeric fields untouched when not present in the body', () => {
    const result = buildBasarData({ location: 'X' }, 'update', existing);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.commissionPercent).toBeUndefined();
      expect(result.data.maxSellers).toBeUndefined();
    }
  });
});

describe('lockedFieldsForActiveBasar', () => {
  it('flags economics fields present in the update payload', () => {
    const locked = lockedFieldsForActiveBasar({ commissionPercent: 25, title: 'New Title' });
    expect(locked).toEqual(['commissionPercent']);
  });

  it('returns an empty array for a purely editorial update', () => {
    const locked = lockedFieldsForActiveBasar({ title: 'New Title', location: 'X', allowedSizes: 'S,M' });
    expect(locked).toEqual([]);
  });

  it('flags all four economics fields when all are present', () => {
    const locked = lockedFieldsForActiveBasar({
      maxSellers: 10,
      maxArticlesPerSeller: 5,
      commissionPercent: 10,
      entryFee: 2,
    });
    expect(locked.sort()).toEqual(['commissionPercent', 'entryFee', 'maxArticlesPerSeller', 'maxSellers']);
  });
});
