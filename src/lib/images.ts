import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

/** FR-LST-07: photos are compressed on the phone to at most 400 KB. */
export const MAX_BYTES = 400 * 1024;

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

export type Bucket = 'item-images' | 'post-images' | 'avatars' | 'evidence';

export async function pickFromGallery(limit: number): Promise<PickedImage[]> {
  if (limit <= 0) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1,
  });
  if (res.canceled) return [];
  return res.assets.slice(0, limit).map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

export async function takePhoto(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Allow camera access in your phone settings to take a photo.');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || res.assets.length === 0) return null;
  const a = res.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

async function byteLength(uri: string): Promise<number> {
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  return buf.byteLength;
}

/** Resizes and re-encodes as JPEG, trying smaller settings until the file is at most 400 KB. */
export async function compressImage(img: PickedImage): Promise<string> {
  const steps: { width: number; quality: number }[] = [
    { width: 1280, quality: 0.7 },
    { width: 1080, quality: 0.55 },
    { width: 900, quality: 0.45 },
    { width: 720, quality: 0.4 },
  ];
  let lastUri = img.uri;
  for (const step of steps) {
    const ctx = ImageManipulator.manipulate(img.uri);
    // never upscale small photos
    if (img.width > step.width) ctx.resize({ width: step.width });
    const rendered = await ctx.renderAsync();
    const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: step.quality });
    lastUri = out.uri;
    if ((await byteLength(out.uri)) <= MAX_BYTES) return out.uri;
  }
  return lastUri;
}

export function randomFileName(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.jpg`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Uploads one local file. Retries on flaky connections (NFR-REL-02). */
export async function uploadImage(bucket: Bucket, path: string, localUri: string): Promise<void> {
  const res = await fetch(localUri);
  const body = await res.arrayBuffer();
  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg', upsert: false });
    if (!error) return;
    // a previous attempt may have reached the server even though the response was lost
    if (/already exists|duplicate/i.test(error.message)) return;
    lastError = error;
    await sleep(600 * 2 ** attempt);
  }
  throw new Error(lastError?.message ?? 'Upload failed');
}

/** Compress + upload, returning the storage path. */
export async function compressAndUpload(bucket: Bucket, folder: string, img: PickedImage): Promise<string> {
  const small = await compressImage(img);
  const path = `${folder}/${randomFileName()}`;
  await uploadImage(bucket, path, small);
  return path;
}

export async function removeFiles(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(bucket).remove(paths);
  } catch {
    // best effort: orphaned files are harmless and can be cleaned up later
  }
}
