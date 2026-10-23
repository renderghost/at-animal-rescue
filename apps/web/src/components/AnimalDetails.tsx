import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ageOf, type AnimalRecord } from '@/server/animals/animal-form';
import { PhotoGallery } from './PhotoGallery';
import { VideoEmbed } from './VideoEmbed';

/** One animal on a listing page: photos, the facts, its story and videos. */
export async function AnimalDetails({
  did,
  animalKey,
  animal,
  owner,
  headingLevel = 2,
}: {
  did: string;
  animalKey: string;
  animal: AnimalRecord;
  owner: boolean;
  headingLevel?: 2 | 3;
}) {
  const t = await getTranslations('ListingPage');
  const taxonomy = await getTranslations('Taxonomy');
  // Records can carry values added after this version; show those as they are.
  const label = (key: string) => (taxonomy.has(key as never) ? taxonomy(key as never) : undefined);
  const Heading = `h${headingLevel}` as const;
  const Sub = `h${headingLevel + 1}` as 'h3' | 'h4';
  const name = animal.name;

  const species =
    animal.species === 'other' && animal.speciesDetail
      ? animal.speciesDetail
      : (label(`species.${animal.species}`) ?? animal.species);
  const breeds = (animal.breeds ?? []).map(
    (breed) => label(`breed.${animal.species}.${breed}`) ?? breed,
  );
  const breed =
    breeds.length > 0
      ? animal.mixedBreed
        ? t('mixed', { breeds: breeds.join(', ') })
        : breeds.join(', ')
      : animal.mixedBreed
        ? t('mixedOnly')
        : undefined;
  const age = animal.birth?.date && ageOf(animal.birth.date, new Date());
  const ageText =
    age &&
    [
      age.years > 0 && t('years', { count: age.years }),
      (age.months > 0 || age.years === 0) && t('months', { count: age.months }),
    ]
      .filter(Boolean)
      .join(', ');
  const yesNo = (value: boolean | undefined) =>
    value === undefined ? undefined : value ? t('yes') : t('no');

  const facts = (
    [
      [t('species'), species],
      [t('breed'), breed],
      [t('sex'), animal.sex && animal.sex !== 'unknown' ? label(`sex.${animal.sex}`) : undefined],
      [t('age'), ageText && (animal.birth?.estimated ? t('ageAbout', { age: ageText }) : ageText)],
      [t('size'), animal.size && (label(`size.${animal.size}`) ?? animal.size)],
      [t('colours'), animal.colours?.join(', ')],
      [t('neutered'), yesNo(animal.neutered)],
      [t('vaccinated'), yesNo(animal.vaccinated)],
      [t('microchipped'), yesNo(animal.microchipped)],
    ] satisfies Array<[string, ReactNode]>
  ).filter((fact): fact is [string, string] => Boolean(fact[1]));
  const health = animal.health;

  return (
    <section aria-labelledby={`animal-${animalKey}`} className="mb-12">
      <Heading id={`animal-${animalKey}`} className="mb-4 text-2xl font-bold">
        {name}
      </Heading>
      <PhotoGallery did={did} animalKey={animalKey} photos={animal.photos ?? []} owner={owner} />

      <dl className="mb-6 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="font-semibold">{term}</dt>
            <dd className="mb-2 sm:mb-0">{value}</dd>
          </div>
        ))}
      </dl>

      {animal.traits && animal.traits.length > 0 && (
        <>
          <Sub className="mb-2 text-lg font-bold">{t('traits')}</Sub>
          <ul className="mb-6 flex flex-wrap gap-2">
            {animal.traits.map((trait) => (
              <li key={trait} className="rounded-full border border-line px-3 py-1 text-sm">
                {label(`trait.${trait}`) ?? trait}
              </li>
            ))}
          </ul>
        </>
      )}

      {health && (health.conditions?.length || health.medication || health.notes) && (
        <>
          <Sub className="mb-2 text-lg font-bold">{t('health')}</Sub>
          {health.conditions && health.conditions.length > 0 && (
            <>
              <p className="font-semibold">{t('conditions')}</p>
              <ul className="mb-3 list-disc pl-6">
                {health.conditions.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </>
          )}
          {health.medication && (
            <p className="mb-3">
              <span className="font-semibold">{t('medication')}:</span> {health.medication}
            </p>
          )}
          {health.notes && (
            <p className="mb-6 whitespace-pre-line">
              <span className="font-semibold">{t('healthNotes')}:</span> {health.notes}
            </p>
          )}
        </>
      )}

      {animal.story && (
        <>
          <Sub className="mb-2 text-lg font-bold">{t('story')}</Sub>
          <p className="mb-6 max-w-prose whitespace-pre-line">{animal.story}</p>
        </>
      )}

      {animal.videos && animal.videos.length > 0 && (
        <>
          <Sub className="mb-2 text-lg font-bold">{t('videos', { name })}</Sub>
          {animal.videos.map((url, i) => (
            <VideoEmbed key={url} url={url} label={t('videoLabel', { number: i + 1, name })} />
          ))}
        </>
      )}
    </section>
  );
}
