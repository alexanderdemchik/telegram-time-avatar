import fs from 'fs';
import path from 'path';
import { logger } from './logger';

interface ICache {
  session?: string;
  lastUploadedAvatarId?: string;
}

let cache: ICache = {};
const CACHE_FILE_NAME = 'cache.json';

const CACHE_FILE_PATH = path.join(process.cwd(), CACHE_FILE_NAME);

export function init() {
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8'));
  } catch (e) {
    logger.error(e);
  }
}

export function set(key: keyof ICache, value: ICache[keyof ICache]) {
  cache[key] = value;

  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache));
  } catch (e) {
    logger.error(e);
  }
}

export function get(key: keyof ICache) {
  return cache[key];
}
