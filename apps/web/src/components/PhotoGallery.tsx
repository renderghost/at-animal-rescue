import { imageSrcSet, imageUrl } from '@/lib/images';
import type { AnimalRecord } from '@/server/animals/animal-form';
import { photoCid } from '@/server/animals/animals';

type Photo = NonNullable<AnimalRecord['photos']>[number];

export type PhotoSource = 'public' | 'owner' | 'moderator';

/**
 * An animal's photos: the cover photo large, the rest in a grid. Public pages use Homeward's
 * image route (#26); the organisation previewing its own listing, its private route; a
 * moderator judging one that isn't public yet, the moderators' route (#43).
 */
export function PhotoGallery({
  did,
  animalKey,
  photos,
  source,
}: {
  did: string;
  animalKey: string;
  photos: Photo[];
  source: PhotoSource;
}) {
  const image = (photo: Photo, sizes: string, className: string) => {
    const cid = photoCid(photo);
    const { width, height } = photo.aspectRatio ?? {};
    return (
      // eslint-disable-next-line @next/next/no-img-element -- sized and cached by our image route
      <img
        src={
          source === 'owner'
            ? `/organisation/animals/${animalKey}/photos/${cid}`
            : source === 'moderator'
              ? `/admin/photos/${encodeURIComponent(did)}/${cid}`
              : imageUrl(did, cid, 800)
        }
        srcSet={source === 'public' ? imageSrcSet(did, cid) : undefined}
        sizes={sizes}
        alt={photo.alt}
        width={width}
        height={height}
        loading="lazy"
        className={className}
      />
    );
  };
  const [cover, ...rest] = photos;
  if (!cover) return null;
  return (
    <div className="mb-6 grid gap-3">
      {image(
        cover,
        '(min-width: 1024px) 42rem, 100vw',
        'h-auto w-full rounded-md border border-line',
      )}
      {rest.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rest.map((photo) => (
            <li key={photoCid(photo)}>
              {image(
                photo,
                '(min-width: 1024px) 14rem, (min-width: 640px) 33vw, 50vw',
                'aspect-square h-auto w-full rounded-md border border-line object-cover',
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
