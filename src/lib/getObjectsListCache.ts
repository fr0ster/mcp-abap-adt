// In-memory cache for GetObjectsList

/**
 * The last list a listing tool answered, as it answered it: each listing
 * caches its own shape, so a reader reads it as a value of no known type.
 */
class ObjectsListCache {
  private cache: unknown = null;

  setCache(data: unknown) {
    this.cache = data;
  }

  getCache(): unknown {
    return this.cache;
  }

  clearCache() {
    this.cache = null;
  }
}

export const objectsListCache = new ObjectsListCache();
