import { EventEmitter } from "node:events";
import type { ChildProcess, ForkOptions } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../../_core/env";

const state = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("node:child_process", () => ({ fork: state.fork }));

import { startLocalGenerationWorker } from "./localGenerationWorker";

class MockChild extends EventEmitter {
  disconnect = vi.fn();
  kill = vi.fn();
}

const originalMode = ENV.generationV5Mode;
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  GENERATION_V5_MODE: process.env.GENERATION_V5_MODE,
  WORKER_TEST_VALUE: process.env.WORKER_TEST_VALUE,
};
const child = new MockChild();

afterEach(() => {
  ENV.generationV5Mode = originalMode;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  state.fork.mockReset();
  child.removeAllListeners();
});

function enableLocalDev() {
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL;
  process.env.GENERATION_V5_MODE = "dev";
  process.env.WORKER_TEST_VALUE = "inherited";
  ENV.generationV5Mode = "dev";
  state.fork.mockReturnValue(child);
}

describe("local V5 generation worker bootstrap", () => {
  it.each([
    ["mode off", "development", undefined, "off"],
    ["production", "production", undefined, "dev"],
    ["Vercel", "development", "1", "dev"],
  ] as const)("does not fork in %s", (_case, nodeEnv, vercel, mode) => {
    process.env.NODE_ENV = nodeEnv;
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
    ENV.generationV5Mode = mode;

    expect(startLocalGenerationWorker()).toBeUndefined();
    expect(state.fork).not.toHaveBeenCalled();
  });

  it("forks a separate TSX process with inherited env and IPC, then reports exit without respawning", () => {
    enableLocalDev();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(startLocalGenerationWorker()).toBe(child);
    expect(state.fork).toHaveBeenCalledTimes(1);
    const [path, args, options] = state.fork.mock.calls[0] as [
      string,
      string[],
      ForkOptions,
    ];
    expect(path).toMatch(/server\/ai\/workflows\/generationWorker\.ts$/);
    expect(args).toEqual([]);
    expect(options.execArgv).toEqual(["--import", "tsx"]);
    expect(options.stdio).toEqual(["inherit", "inherit", "inherit", "ipc"]);
    expect(options.env).toMatchObject({
      NODE_ENV: "development",
      GENERATION_V5_MODE: "dev",
      WORKER_TEST_VALUE: "inherited",
    });
    expect(options.env).not.toBe(process.env);

    child.emit("error", new Error("spawn failed"));
    child.emit("exit", 1, null);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Falha no processo filho; sem novas tentativas."),
      expect.objectContaining({ message: "spawn failed" })
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("sem novas tentativas.")
    );
    expect(child.listenerCount("error")).toBe(0);
    expect(child.listenerCount("exit")).toBe(0);
    expect(state.fork).toHaveBeenCalledTimes(1);
    info.mockRestore();
    error.mockRestore();
  });

  it("logs a synchronous fork failure without retrying", () => {
    enableLocalDev();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const startError = new Error("fork unavailable");
    state.fork.mockImplementation(() => {
      throw startError;
    });

    expect(startLocalGenerationWorker()).toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("sem novas tentativas."),
      startError
    );
    expect(state.fork).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
