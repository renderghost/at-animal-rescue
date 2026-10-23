/** Widths of public photos (#26); the browser picks one through srcset. */
export const IMAGE_WIDTHS = [400, 800, 1600] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

export const isImageWidth = (value: number): value is ImageWidth =>
  (IMAGE_WIDTHS as readonly number[]).includes(value);

/** A public photo at one width, served by Homeward from the organisation's PDS. */
export const imageUrl = (did: string, cid: string, width: ImageWidth) =>
  `/img/${did}/${cid}/${width}`;

/** All widths of a public photo, for an <img srcset>. */
export const imageSrcSet = (did: string, cid: string) =>
  IMAGE_WIDTHS.map((width) => `${imageUrl(did, cid, width)} ${width}w`).join(', ');
