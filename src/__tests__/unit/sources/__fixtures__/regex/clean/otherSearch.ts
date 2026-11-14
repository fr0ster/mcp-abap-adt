// A `search` of an object that is no string takes its argument as it is.
const index = { search: (query: string) => query.length };
export const hits = (query: string) => index.search(query);
export const named = (query: string) => index['search'](query);
