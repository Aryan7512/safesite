import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSansDevanagari_400Regular,
  IBMPlexSansDevanagari_500Medium,
  IBMPlexSansDevanagari_600SemiBold,
  IBMPlexSansDevanagari_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-devanagari';

export const FONT_MAP = {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexSansDevanagari_400Regular,
  IBMPlexSansDevanagari_500Medium,
  IBMPlexSansDevanagari_600SemiBold,
  IBMPlexSansDevanagari_700Bold,
};

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

const LATIN: Record<Weight, string> = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
};

// IBM Plex Sans Devanagari also carries Latin glyphs, so Hindi UI uses it for
// everything (mixed Hindi/English transcripts render in one consistent face).
const DEVANAGARI: Record<Weight, string> = {
  regular: 'IBMPlexSansDevanagari_400Regular',
  medium: 'IBMPlexSansDevanagari_500Medium',
  semibold: 'IBMPlexSansDevanagari_600SemiBold',
  bold: 'IBMPlexSansDevanagari_700Bold',
};

export function fontFor(weight: Weight, hindi: boolean) {
  return hindi ? DEVANAGARI[weight] : LATIN[weight];
}

export const MONO = { medium: 'IBMPlexMono_500Medium', semibold: 'IBMPlexMono_600SemiBold' };

const DEVANAGARI_RE = /[ऀ-ॿ]/;
export const hasDevanagari = (s: string) => DEVANAGARI_RE.test(s);
