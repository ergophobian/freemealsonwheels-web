// The one place every site photo lives. Files are in src/assets/photos/. To swap a photo, replace the file
// (or edit the import) and update the alt text if the picture changes. Pages read from this map and render
// each one with astro:assets <Picture> (AVIF and WebP, srcset). Cards that sit next to a heading use alt="" at the call site.
import type { ImageMetadata } from 'astro';
import kitchen from '../assets/photos/kitchen.webp';
import team from '../assets/photos/team.webp';
import thanksgiving from '../assets/photos/thanksgiving.webp';
import blanket from '../assets/photos/blanket.webp';
import smile from '../assets/photos/smile.webp';

export type ArtKey = 'kitchen' | 'team' | 'thanksgiving' | 'blanket' | 'smile';
export interface Art { src: ImageMetadata; alt: string; /** default CSS object-position for cropped uses */ pos: string }

export const art: Record<ArtKey, Art> = {
  kitchen: {
    src: kitchen,
    alt: 'Volunteers in masks and gloves cooking and packing meals together in the Free Meals on Wheels kitchen',
    pos: '50% 30%',
  },
  team: {
    src: team,
    alt: 'Volunteers in blue shirts reaching hands toward each other, seen from below',
    pos: '52% 50%',
  },
  thanksgiving: {
    src: thanksgiving,
    alt: 'A bowl of freshly cooked rice and vegetables on a dark table',
    pos: '70% 50%',
  },
  blanket: {
    src: blanket,
    alt: 'A stack of warm folded blankets held in two hands',
    pos: '80% 40%',
  },
  smile: {
    src: smile,
    alt: 'A smiling neighbor reaching out a hand beside a boxed hot meal',
    pos: '20% 30%',
  },
};
