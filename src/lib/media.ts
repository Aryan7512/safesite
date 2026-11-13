// Photo compression + private uploads (PRD §10 notes, §12).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const BUCKET = 'report-media';

/** Resize to ≤1280 px wide and JPEG ~70 %: a phone photo drops from ~4 MB to ~200 KB. */
export async function compressPhoto(uri: string, width?: number): Promise<string> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    if (!width || width > 1280) ctx.resize({ width: 1280, height: null });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    return uri; // never block a report on compression
  }
}

async function bytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web' || uri.startsWith('blob:') || uri.startsWith('data:') || uri.startsWith('http')) {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

export function audioMime(uri: string): { ext: string; type: string } {
  if (Platform.OS === 'web' || uri.startsWith('blob:')) return { ext: 'webm', type: 'audio/webm' };
  if (uri.endsWith('.caf')) return { ext: 'caf', type: 'audio/x-caf' };
  return { ext: 'm4a', type: 'audio/mp4' };
}

/** Upload once; an "already exists" from a retry counts as success. */
export async function upload(path: string, uri: string, contentType: string): Promise<string> {
  const body = await bytes(uri);
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
  return path;
}
