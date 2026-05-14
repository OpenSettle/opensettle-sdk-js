/**
 * Cursor-pagination helper — async iterator that follows the API's
 * `{data, nextCursor, hasMore}` envelope automatically.
 *
 * Resource `list()` methods continue to return a single page for
 * backward compatibility. `paginate(...)` walks the whole result set.
 *
 * @example
 *   for await (const customer of paginate(os.customers.list.bind(os.customers))) {
 *     console.log(customer.id);
 *   }
 *
 * @example with filters
 *   for await (const sub of paginate(
 *     os.subscriptions.list.bind(os.subscriptions),
 *     { status: "active" }
 *   )) {
 *     // ...
 *   }
 */

export type Page<T> = {
  data: T[];
  nextCursor?: string | null;
  hasMore?: boolean;
};

export async function* paginate<T, Q extends { cursor?: string } = { cursor?: string }>(
  fetch: (query: Q) => Promise<Page<T>>,
  initialQuery: Omit<Q, "cursor"> = {} as Omit<Q, "cursor">,
): AsyncGenerator<T, void, void> {
  let cursor: string | undefined;
  // First call is unfiltered for cursor; later calls thread it through.
  // We rebuild the query object per call so each fetch sees the current cursor.
  while (true) {
    const query = { ...initialQuery, cursor } as Q;
    const page = await fetch(query);
    for (const item of page.data ?? []) {
      yield item;
    }
    if (!page.hasMore || !page.nextCursor) return;
    cursor = page.nextCursor;
  }
}
