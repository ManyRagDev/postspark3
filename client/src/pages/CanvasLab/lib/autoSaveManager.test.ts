import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoSaveManager, type AutoSaveState } from "./autoSaveManager";

describe("AutoSaveManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces rapid edits and triggers save only once after quiet window", async () => {
    const saveFn = vi.fn().mockResolvedValue(true);
    const states: AutoSaveState[] = [];
    const manager = new AutoSaveManager<{ text: string }>({
      onSave: saveFn,
      debounceMs: 500,
      onStateChange: (s) => states.push(s),
    });

    manager.triggerChange({ text: "Hello" });
    manager.triggerChange({ text: "Hello W" });
    manager.triggerChange({ text: "Hello World" });

    expect(manager.getState()).toBe("dirty");
    expect(saveFn).not.toHaveBeenCalled();

    // Avança 400ms (ainda não atingiu 500ms)
    vi.advanceTimersByTime(400);
    expect(saveFn).not.toHaveBeenCalled();

    // Completa os 500ms
    vi.advanceTimersByTime(100);
    await vi.runAllTimersAsync();

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith({ text: "Hello World" });
    expect(manager.getState()).toBe("saved");
    expect(manager.getLastSavedAt()).toBeInstanceOf(Date);
  });

  it("prevents concurrent requests and queues latest mutation without duplication", async () => {
    let resolveFirstSave: (val: boolean) => void = () => {};
    const firstSavePromise = new Promise<boolean>((resolve) => {
      resolveFirstSave = resolve;
    });

    const secondSaveFn = vi.fn().mockResolvedValue(true);

    const saveCalls: any[] = [];
    const saveFn = vi.fn().mockImplementation((doc) => {
      saveCalls.push(doc);
      if (saveCalls.length === 1) {
        return firstSavePromise;
      }
      return secondSaveFn(doc);
    });

    const manager = new AutoSaveManager<{ v: number }>({
      onSave: saveFn,
      debounceMs: 300,
    });

    // 1. Dispara primeira alteração e aguarda término do debounce
    manager.triggerChange({ v: 1 });
    vi.advanceTimersByTime(300);
    expect(saveCalls.length).toBe(1);
    expect(saveCalls[0]).toEqual({ v: 1 });
    expect(manager.getState()).toBe("saving");

    // 2. Enquanto o save 1 está EM VOO, ocorrem mais alterações
    manager.triggerChange({ v: 2 });
    manager.triggerChange({ v: 3 });

    // Mesmo avançando o tempo, NENHUM segundo save concorrente pode ocorrer
    vi.advanceTimersByTime(1000);
    expect(saveCalls.length).toBe(1);

    // 3. Conclui o primeiro save: agora o segundo save é disparado com a versão mais recente { v: 3 }
    resolveFirstSave(true);
    await vi.runAllTimersAsync();

    expect(saveCalls.length).toBe(2);
    expect(saveCalls[1]).toEqual({ v: 3 }); // Enfileirou o mais recente, sem duplicar chamadas
    expect(manager.getState()).toBe("saved");
  });

  it("flushNow saves immediately and cancels active debounce timer", async () => {
    const saveFn = vi.fn().mockResolvedValue(true);
    const manager = new AutoSaveManager<{ count: number }>({
      onSave: saveFn,
      debounceMs: 1000,
    });

    manager.triggerChange({ count: 42 });
    expect(saveFn).not.toHaveBeenCalled();

    const success = await manager.flushNow();
    expect(success).toBe(true);
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith({ count: 42 });

    // Avançar o timer não deve disparar novamente
    vi.advanceTimersByTime(1500);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("handles failure by entering error state", async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error("Network offline"));
    const manager = new AutoSaveManager<{ ok: boolean }>({
      onSave: saveFn,
      debounceMs: 100,
    });

    manager.triggerChange({ ok: false });
    vi.advanceTimersByTime(100);
    await vi.runAllTimersAsync();

    expect(manager.getState()).toBe("error");
  });

  it("cancels pending and queued saves when autosave is turned off", async () => {
    const pendingSave = vi.fn().mockResolvedValue(true);
    const pendingManager = new AutoSaveManager({ onSave: pendingSave, debounceMs: 100 });
    pendingManager.triggerChange({ version: 1 });
    pendingManager.destroy();
    await vi.runAllTimersAsync();
    expect(pendingSave).not.toHaveBeenCalled();

    let finishSave: (success: boolean) => void = () => {};
    const firstSave = new Promise<boolean>((resolve) => { finishSave = resolve; });
    const inFlightSave = vi.fn().mockReturnValueOnce(firstSave);
    const inFlightManager = new AutoSaveManager({ onSave: inFlightSave, debounceMs: 100 });
    inFlightManager.triggerChange({ version: 1 });
    vi.advanceTimersByTime(100);
    inFlightManager.triggerChange({ version: 2 });
    inFlightManager.destroy();
    finishSave(true);
    await vi.runAllTimersAsync();
    expect(inFlightSave).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate a manual save and resumes for edits made during it", async () => {
    const saveFn = vi.fn().mockResolvedValue(true);
    const manager = new AutoSaveManager({ onSave: saveFn, debounceMs: 100 });
    manager.triggerChange({ version: 1 });
    manager.pauseForManualSave();
    await vi.runAllTimersAsync();
    expect(saveFn).not.toHaveBeenCalled();

    manager.triggerChange({ version: 2 });
    await vi.runAllTimersAsync();
    expect(saveFn).not.toHaveBeenCalled();

    manager.resumeAfterManualSave();
    await vi.runAllTimersAsync();
    expect(saveFn).toHaveBeenCalledOnce();
    expect(saveFn).toHaveBeenCalledWith({ version: 2 });
  });
});
