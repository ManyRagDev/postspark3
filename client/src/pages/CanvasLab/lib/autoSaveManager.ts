export type AutoSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutoSaveControllerOptions<T> {
  onSave: (doc: T) => Promise<boolean | void>;
  debounceMs?: number;
  onStateChange?: (state: AutoSaveState, lastSavedAt?: Date) => void;
}

/**
 * Gerenciador de autosave resiliente com controle estrito de concorrência (Etapa 8 §4).
 *
 * Invariantes inegociáveis:
 * 1. Mutação dispara state = 'dirty' e agenda salvamento com debounce (default 1000ms).
 * 2. Somente UMA requisição de salvamento pode estar em voo por vez (lock mutex).
 * 3. Se houver nova mutação enquanto salva, a mutação é enfileirada no `queuedDoc`
 *    e processada sequencialmente assim que o save atual terminar, impedindo
 *    duplicação de posts no banco e garantindo que o payload final seja o mais recente.
 */
export class AutoSaveManager<T> {
  private state: AutoSaveState = "idle";
  private latestDoc: T | null = null;
  private queuedDoc: T | null = null;
  private isSaving = false;
  private destroyed = false;
  private paused = false;
  private timer: any = null;
  private lastSavedAt: Date | null = null;
  private activeSavePromise: Promise<boolean> | null = null;

  private onSave: (doc: T) => Promise<boolean | void>;
  private debounceMs: number;
  private onStateChange?: (state: AutoSaveState, lastSavedAt?: Date) => void;

  constructor(options: AutoSaveControllerOptions<T>) {
    this.onSave = options.onSave;
    this.debounceMs = options.debounceMs ?? 1000;
    this.onStateChange = options.onStateChange;
  }

  public getState(): AutoSaveState {
    return this.state;
  }

  public get saving(): boolean {
    return this.isSaving;
  }

  public getLastSavedAt(): Date | null {
    return this.lastSavedAt;
  }

  private setState(next: AutoSaveState, savedAt?: Date) {
    if (this.destroyed) return;
    this.state = next;
    if (savedAt) this.lastSavedAt = savedAt;
    this.onStateChange?.(next, this.lastSavedAt ?? undefined);
  }

  /** Notifica que o documento sofreu alteração pelo usuário. */
  public triggerChange(doc: T): void {
    if (this.destroyed) return;
    this.latestDoc = doc;

    if (this.paused) {
      this.setState("dirty");
      return;
    }

    // Se já estiver salvando, apenas enfileira o doc mais recente para o próximo ciclo
    if (this.isSaving) {
      this.queuedDoc = doc;
      if (this.state !== "saving") {
        this.setState("dirty");
      }
      return;
    }

    this.setState("dirty");

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.executeSave();
    }, this.debounceMs);
  }

  /** Evita salvar novamente a mesma versão enquanto um save manual acontece. */
  public pauseForManualSave(): void {
    if (this.destroyed) return;
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.latestDoc = null;
    this.queuedDoc = null;
  }

  /** Retoma o autosave somente se houve novas edições durante o save manual. */
  public resumeAfterManualSave(): void {
    if (this.destroyed) return;
    this.paused = false;
    if (this.latestDoc) this.triggerChange(this.latestDoc);
  }

  /** Força o salvamento imediato sem esperar o tempo de debounce. */
  public async flushNow(): Promise<boolean> {
    if (this.destroyed) return false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.isSaving) {
      if (this.latestDoc) {
        this.queuedDoc = this.latestDoc;
      }
      return (await this.activeSavePromise) ?? false;
    }
    const docToSave = this.queuedDoc ?? this.latestDoc;
    if (!docToSave) {
      return this.state !== "error";
    }
    return this.executeSave();
  }

  private async executeSave(): Promise<boolean> {
    if (this.destroyed) return false;
    if (this.isSaving) {
      // Já existe um save em voo; marca queuedDoc para rodar assim que terminar
      if (this.latestDoc) {
        this.queuedDoc = this.latestDoc;
      }
      return (await this.activeSavePromise) ?? false;
    }

    const docToSave = this.queuedDoc ?? this.latestDoc;
    if (!docToSave) {
      return this.state !== "error";
    }

    this.queuedDoc = null;
    this.latestDoc = null;
    this.isSaving = true;
    this.setState("saving");

    const currentExecution = (async (): Promise<boolean> => {
      let finalSuccess = false;
      try {
        const result = await this.onSave(docToSave);
        finalSuccess = result !== false;

        if (this.destroyed) {
          this.isSaving = false;
          return finalSuccess;
        }

        if (finalSuccess) {
          const now = new Date();
          this.setState("saved", now);
        } else {
          this.setState("error");
          // Conserva a versão falha para retry se nenhuma edição mais recente foi enfileirada
          this.latestDoc = this.latestDoc ?? docToSave;
        }
      } catch {
        if (this.destroyed) {
          this.isSaving = false;
          return false;
        }
        this.setState("error");
        finalSuccess = false;
        // Conserva a versão falha para retry se nenhuma edição mais recente foi enfileirada
        this.latestDoc = this.latestDoc ?? docToSave;
      } finally {
        this.isSaving = false;
      }

      // Se durante este salvamento houve novas alterações, processa a mais recente
      if (this.queuedDoc && !this.destroyed) {
        return this.executeSave();
      }

      return finalSuccess;
    })();

    this.activeSavePromise = currentExecution;
    try {
      return await currentExecution;
    } finally {
      if (this.activeSavePromise === currentExecution) {
        this.activeSavePromise = null;
      }
    }
  }

  /** Limpa timers pendentes ao desmontar o componente. */
  public destroy(): void {
    this.destroyed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queuedDoc = null;
    this.latestDoc = null;
  }
}
