/**
 * Single source of truth for the user-agent and any place we want to
 * report the SDK version on the wire. Bump in lockstep with package.json
 * — the "SDK_VERSION matches package.json" test in `test/client.test.ts`
 * pins the two together.
 */
export const SDK_VERSION = "0.2.1";
