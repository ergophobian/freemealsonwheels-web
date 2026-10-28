// The one place the /hearth pictures live. To change the art style, replace the five files in
// src/assets/hearth/ (keep the names, or edit the imports here) and update the alt text if the scene changes.
// Both src/pages/hearth.astro and src/layouts/HearthLayout.astro read from this map.
import type { ImageMetadata } from 'astro';
import cook from '../assets/hearth/cook.jpg';
import pack from '../assets/hearth/pack.jpg';
import deliver from '../assets/hearth/deliver.jpg';
import share from '../assets/hearth/share.jpg';
import grass from '../assets/hearth/grass.jpg';

export type HearthArtKey = 'cook' | 'pack' | 'deliver' | 'share' | 'grass';
export interface HearthArt { src: ImageMetadata; alt: string }

export const art: Record<HearthArtKey, HearthArt> = {
  cook: {
    src: cook,
    alt: 'A hatched drawing of a volunteer crew in a community kitchen before dawn, all in matching red aprons and hairnets: one stirs a big steel stockpot on the range, a lead with a clipboard points the way, and others roll rotis at a steel prep table under a window strung with marigolds.',
  },
  pack: {
    src: pack,
    alt: 'A hatched drawing of three volunteers in matching red aprons, hairnets and gloves packing meals at a long table in morning light: one ladles dal into a steel tiffin, one lifts a tiffin lid, and an older volunteer sets a box on a growing stack.',
  },
  deliver: {
    src: deliver,
    alt: 'A hatched drawing of a bright morning street: a volunteer in a red apron and cap carries a steel tiffin from the team van to an elder in a shawl who waits smiling in a doorway under a string of marigolds.',
  },
  share: {
    src: share,
    alt: 'A hatched drawing of an evening meal under a string of warm lights: neighbors seated along a long table, a volunteer in a red apron serving an elder, and a child carefully carrying a plate to the table, with a single diya glowing on the window sill.',
  },
  // Decorative strip of grass and marigolds along the bottom of every footer.
  grass: { src: grass, alt: '' },
};
