import { describe, it, expect, vi } from "vitest";
import { waitFor, WaitTimeoutError } from "../src/wait.js";

describe("waitFor", () => {
  it("returns immediately when predicate is already satisfied", async () => {
    const retrieve = vi.fn(async (id: string) => ({ id, status: "confirmed" }));
    const sleep = vi.fn(async () => {});
    const out = await waitFor(retrieve, "pay_1", (r) => r.status === "confirmed", {
      sleep,
    });
    expect(out.status).toBe("confirmed");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("polls until the predicate matches", async () => {
    const states = ["pending", "pending", "confirmed"];
    let i = 0;
    const retrieve = vi.fn(async (id: string) => ({ id, status: states[i++]! }));
    const sleeps: number[] = [];
    const out = await waitFor(retrieve, "pay_1", (r) => r.status === "confirmed", {
      intervalMs: 250,
      sleep: async (ms) => { sleeps.push(ms); },
    });
    expect(out.status).toBe("confirmed");
    expect(sleeps).toEqual([250, 250]);
    expect(retrieve).toHaveBeenCalledTimes(3);
  });

  it("throws WaitTimeoutError with the last-observed resource", async () => {
    const clock = [0, 500, 1500, 2500];
    let ci = 0;
    const retrieve = vi.fn(async (id: string) => ({ id, status: "pending" }));
    await expect(
      waitFor(retrieve, "pay_x", (r) => r.status === "confirmed", {
        timeoutMs: 2000,
        intervalMs: 1000,
        sleep: async () => {},
        now: () => clock[ci++]!,
      }),
    ).rejects.toBeInstanceOf(WaitTimeoutError);
  });

  it("WaitTimeoutError exposes the last resource", async () => {
    const clock = [0, 100, 200];
    let ci = 0;
    const retrieve = vi.fn(async (id: string) => ({ id, status: "pending", n: 42 }));
    try {
      await waitFor(retrieve, "pay_x", (r) => r.status === "confirmed", {
        timeoutMs: 50,
        intervalMs: 1,
        sleep: async () => {},
        now: () => clock[ci++]!,
      });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(WaitTimeoutError);
      const w = e as WaitTimeoutError;
      expect(w.last).toMatchObject({ id: "pay_x", status: "pending", n: 42 });
    }
  });

  it("predicate can inspect any field, not just status", async () => {
    const retrieve = vi.fn(async (id: string) => ({ id, confirmations: 12 }));
    const out = await waitFor(retrieve, "pay_1", (r) => r.confirmations >= 6, {
      sleep: async () => {},
    });
    expect(out.confirmations).toBe(12);
  });
});
