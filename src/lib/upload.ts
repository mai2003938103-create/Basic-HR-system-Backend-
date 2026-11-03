import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config/env.js';
import type { AuthContext } from './auth-context.js';
import { badRequest } from './errors.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export type Folder = 'photos' | 'documents';
const ALLOWED: Record<Folder, Record<string, string>> = {
  photos: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  documents: { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' },
};
export const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

export const uploadRoot = () => path.resolve(env.UPLOAD_DIR);

const make = () => multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
export const imageUpload = make();
export const documentUpload = make();

/** Checks the real file type from its bytes and stores it; returns the key `<folder>/<uuid>.<ext>`. */
export async function saveUpload(file: Express.Multer.File, folder: Folder): Promise<string> {
  const type = await fileTypeFromBuffer(file.buffer);
  const ext = type ? ALLOWED[folder][type.mime] : undefined;
  if (!ext) throw badRequest('errors.upload.invalidType');
  const name = `${crypto.randomUUID()}.${ext}`;
  const dir = path.join(uploadRoot(), folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), file.buffer, { flag: 'wx' });
  return `${folder}/${name}`;
}

type DocumentAccess = (auth: AuthContext, key: string) => Promise<boolean>;
let documentAccess: DocumentAccess = async () => false;
export function registerDocumentAccess(fn: DocumentAccess) {
  documentAccess = fn;
}
export const canReadDocument: DocumentAccess = (auth, key) => documentAccess(auth, key);
