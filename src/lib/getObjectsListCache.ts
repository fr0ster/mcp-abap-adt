// In-memory cache for GetObjectsList

import type { JsonAnswer } from './answer';

/** A row a listing of objects caches: what GetObjectNodeFromCache finds a node by, and keeps. */
export interface CachedObject {
  readonly OBJECT_TYPE: string;
  readonly OBJECT_NAME: string;
  readonly TECH_NAME?: string | undefined;
  readonly OBJECT_URI?: string | undefined;
  readonly object_uri_response?: string | undefined;
}

/** A listing of objects, with whatever else its tool answered. */
export interface ObjectsListing {
  readonly objects: readonly CachedObject[];
}

/** The last answer a listing tool cached: a listing of objects, or a JSON answer. */
export type CachedListing = ObjectsListing | JsonAnswer;

class ObjectsListCache {
  private cache: CachedListing | null = null;

  setCache(data: CachedListing) {
    this.cache = data;
  }

  getCache(): CachedListing | null {
    return this.cache;
  }

  clearCache() {
    this.cache = null;
  }
}

export const objectsListCache = new ObjectsListCache();
