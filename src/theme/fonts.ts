import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { BarlowSemiCondensed_500Medium, BarlowSemiCondensed_600SemiBold, BarlowSemiCondensed_700Bold } from '@expo-google-fonts/barlow-semi-condensed';
import { IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSansDevanagari_400Regular,
  IBMPlexSansDevanagari_500Medium,
  IBMPlexSansDevanagari_600SemiBold,
  IBMPlexSansDevanagari_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-devanagari';

export const FONT_MAP = {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  BarlowSemiCondensed_500Medium,
  BarlowSemiCondensed_600SemiBold,
  BarlowSemiCondensed_700Bold,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexSansDevanagari_400Regular,
  IBMPlexSansDevanagari_500Medium,
  IBMPlexSansDevanagari_600SemiBold,
  IBMPlexSansDevanagari_700Bold,
};

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

const LATIN: Record<Weight, string> = {
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semibold: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
};

// Semi-condensed cut for headings and numbers: drawn from industrial signage,
// compact enough for dense dashboards.
const CONDENSED: Record<Weight, string> = {
  regular: 'BarlowSemiCondensed_500Medium',
  medium: 'BarlowSemiCondensed_500Medium',
  semibold: 'BarlowSemiCondensed_600SemiBold',
  bold: 'BarlowSemiCondensed_700Bold',
};

// IBM Plex Sans Devanagari also carries Latin glyphs, so Hindi UI uses it for
// everything (mixed Hindi/English transcripts render in one consistent face).
const DEVANAGARI: Record<Weight, string> = {
  regular: 'IBMPlexSansDevanagari_400Regular',
  medium: 'IBMPlexSansDevanagari_500Medium',
  semibold: 'IBMPlexSansDevanagari_600SemiBold',
  bold: 'IBMPlexSansDevanagari_700Bold',
};

export function fontFor(weight: Weight, hindi: boolean, condensed = false) {
  if (hindi) return DEVANAGARI[weight];
  return condensed ? CONDENSED[weight] : LATIN[weight];
}

export const MONO = { medium: 'IBMPlexMono_500Medium', semibold: 'IBMPlexMono_600SemiBold' };

const DEVANAGARI_RE = /[ऀ-ॿ]/;
export const hasDevanagari = (s: string) => DEVANAGARI_RE.test(s);
