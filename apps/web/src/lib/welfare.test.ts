import { DOG_BREEDS } from '@homeward/lexicons/taxonomy';
import { describe, expect, it } from 'vitest';
import { BREED_RULES, breedWarnings } from './breed-restrictions';
import { latestBirthDay, listableFrom, saleWording } from './welfare';

const now = new Date('2026-10-24T12:00:00Z');

describe('minimum age', () => {
  it('reads approximate birth dates as the youngest they could be', () => {
    expect(latestBirthDay('2026-09-10')).toEqual(new Date('2026-09-10T00:00:00Z'));
    expect(latestBirthDay('2026-02')).toEqual(new Date('2026-02-28T00:00:00Z'));
    expect(latestBirthDay('2026')).toEqual(new Date('2026-12-31T00:00:00Z'));
    expect(latestBirthDay('soon')).toBeUndefined();
  });

  it('says when a puppy or kitten can be listed', () => {
    const puppy = { species: 'dog', birth: { date: '2026-09-10' } };
    expect(listableFrom(puppy, { now })).toEqual(new Date('2026-11-05T00:00:00Z'));
    expect(listableFrom(puppy, { now, minWeeks: 6 })).toBeUndefined(); // 22 October
    expect(listableFrom({ species: 'cat', birth: { date: '2026-10' } }, { now })).toEqual(
      new Date('2026-12-26T00:00:00Z'),
    );
    expect(listableFrom({ species: 'dog', birth: { date: '2025' } }, { now })).toBeUndefined();
  });

  it('applies only to dogs and cats with a birth date', () => {
    expect(
      listableFrom({ species: 'rabbit', birth: { date: '2026-10-20' } }, { now }),
    ).toBeUndefined();
    expect(listableFrom({ species: 'dog' }, { now })).toBeUndefined();
  });
});

describe('sale wording', () => {
  it('finds whole words and phrases, in several languages, ignoring case', () => {
    expect(
      saleWording(['Lovely pup FOR SALE, price negotiable', 'KC registered, papers included']),
    ).toEqual(['for sale', 'price', 'papers', 'kc registered', 'negotiable']);
    expect(saleWording(['Pup te koop bij de fokker'])).toEqual(['te koop', 'fokker']);
    expect(saleWording(['Chiot à vendre, prix sur demande'])).toEqual(['à vendre', 'prix']);
  });

  it('ignores the same letters inside other words', () => {
    expect(saleWording(['Loves his buoy and monotone squeaky toys', undefined])).toEqual([]);
  });
});

describe('breed restrictions', () => {
  it('only names breeds that exist in the taxonomy', () => {
    for (const rule of BREED_RULES) {
      for (const breed of rule.breeds)
        expect(DOG_BREEDS, `${rule.country} ${breed}`).toContain(breed);
      expect(rule.source).toMatch(/^https:\/\//);
    }
  });

  it('warns about the countries asked for', () => {
    expect(breedWarnings(['dogoArgentino', 'labradorRetriever'], ['GB', 'NL'])).toEqual([
      expect.objectContaining({ breed: 'dogoArgentino', country: 'GB', level: 'banned' }),
    ]);
    expect(breedWarnings(['rottweiler'], ['gb', undefined])).toEqual([]);
    expect(breedWarnings(['americanBully'], ['IE']).map((w) => w.level)).toEqual(['banned']);
    expect(breedWarnings(['staffordshireBullTerrier'], ['DE'])).toMatchObject([
      { country: 'DE', level: 'noImport' },
    ]);
  });

  it('matches breeds an organisation typed by name', () => {
    const names = { tosaInu: 'Tosa Inu', sarplaninac: 'Šarplaninac' };
    expect(breedWarnings(['tosa inu', 'Sarplaninac'], ['DK'], names).map((w) => w.breed)).toEqual([
      'tosaInu',
      'sarplaninac',
    ]);
  });
});
