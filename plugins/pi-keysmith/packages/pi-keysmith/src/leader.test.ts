import { describe, expect, it, vi } from "vitest";
import { MinimalLeaderState, TOOLS_TOGGLE_ACTION_ID } from "./leader.js";

describe("MinimalLeaderState", () => {
  it("delegates idle keys by returning false", () => {
    const dispatches: string[] = [];
    const leader = new MinimalLeaderState({ dispatch: (actionId) => dispatches.push(actionId) });

    expect(leader.handleInput("a")).toBe(false);
    expect(dispatches).toEqual([]);
    expect(leader.isPending).toBe(false);
  });

  it("enters pending on ctrl+x and dispatches the hardcoded tools toggle sequence", () => {
    const dispatches: string[] = [];
    const leader = new MinimalLeaderState({ dispatch: (actionId) => dispatches.push(actionId) });

    expect(leader.handleInput("\u0018")).toBe(true);
    expect(leader.isPending).toBe(true);
    expect(leader.handleInput("t")).toBe(true);

    expect(dispatches).toEqual([TOOLS_TOGGLE_ACTION_ID]);
    expect(leader.isPending).toBe(false);
  });

  it("consumes invalid sequence keys and clears pending", () => {
    const leader = new MinimalLeaderState({ dispatch: () => undefined });

    expect(leader.handleInput("\u0018")).toBe(true);
    expect(leader.handleInput("z")).toBe(true);

    expect(leader.isPending).toBe(false);
    expect(leader.handleInput("a")).toBe(false);
  });

  it("cleans timeout timers on dispatch, invalid key, timeout, clear, and dispose", () => {
    vi.useFakeTimers();
    try {
      const leader = new MinimalLeaderState({ sequenceTimeoutMs: 25, dispatch: () => undefined });

      leader.handleInput("\u0018");
      expect(vi.getTimerCount()).toBe(1);
      leader.handleInput("t");
      expect(vi.getTimerCount()).toBe(0);

      leader.handleInput("\u0018");
      expect(vi.getTimerCount()).toBe(1);
      leader.handleInput("z");
      expect(vi.getTimerCount()).toBe(0);

      leader.handleInput("\u0018");
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(25);
      expect(leader.isPending).toBe(false);
      expect(vi.getTimerCount()).toBe(0);

      leader.handleInput("\u0018");
      expect(vi.getTimerCount()).toBe(1);
      leader.clear();
      expect(vi.getTimerCount()).toBe(0);

      leader.handleInput("\u0018");
      expect(vi.getTimerCount()).toBe(1);
      leader.dispose();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
