import { describe, it, expect, vi } from "vitest";
import { paginate } from "../src/pagination.js";

describe("paginate", () => {
  it("yields all items from a single page", async () => {
    const fetch = vi.fn(async () => ({
      data: [{ id: "a" }, { id: "b" }],
      nextCursor: null,
      hasMore: false,
    }));
    const out: unknown[] = [];
    for await (const item of paginate(fetch)) out.push(item);
    expect(out).toEqual([{ id: "a" }, { id: "b" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("follows nextCursor across pages", async () => {
    const pages = [
      { data: [{ id: "a" }], nextCursor: "cur_1", hasMore: true },
      { data: [{ id: "b" }], nextCursor: null, hasMore: false },
    ];
    let i = 0;
    const fetch = vi.fn(async () => pages[i++]!);
    const out: unknown[] = [];
    for await (const item of paginate(fetch)) out.push(item);
    expect(out).toEqual([{ id: "a" }, { id: "b" }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("passes cursor forward in the query argument", async () => {
    const calls: Array<{ cursor?: string }> = [];
    const pages = [
      { data: [{ id: "a" }], nextCursor: "cur_x", hasMore: true },
      { data: [{ id: "b" }], nextCursor: null, hasMore: false },
    ];
    let i = 0;
    const fetch = vi.fn(async (q: { cursor?: string }) => {
      calls.push({ cursor: q.cursor });
      return pages[i++]!;
    });
    for await (const _ of paginate(fetch)) void _;
    expect(calls).toEqual([{ cursor: undefined }, { cursor: "cur_x" }]);
  });

  it("threads initial filters through every call", async () => {
    const calls: unknown[] = [];
    const fetch = vi.fn(async (q: { cursor?: string; status?: string; limit?: number }) => {
      calls.push({ ...q });
      return { data: [], nextCursor: null, hasMore: false };
    });
    for await (const _ of paginate(fetch, { status: "active", limit: 10 })) void _;
    expect(calls).toEqual([{ status: "active", limit: 10, cursor: undefined }]);
  });

  it("stops on hasMore=false even if nextCursor is set", async () => {
    const fetch = vi.fn(async () => ({
      data: [],
      nextCursor: "ignored",
      hasMore: false,
    }));
    const out: unknown[] = [];
    for await (const item of paginate(fetch)) out.push(item);
    expect(out).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("handles empty intermediate pages", async () => {
    const pages = [
      { data: [], nextCursor: "cur_1", hasMore: true },
      { data: [{ id: "z" }], nextCursor: null, hasMore: false },
    ];
    let i = 0;
    const fetch = vi.fn(async () => pages[i++]!);
    const out: unknown[] = [];
    for await (const item of paginate(fetch)) out.push(item);
    expect(out).toEqual([{ id: "z" }]);
  });
});
