import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
export const paidOperationScope = new AsyncLocalStorage<string>();
export const paidCallMetadata = new AsyncLocalStorage<
  Record<string, string | number>
>();
export interface PriceQuote {
  id: string;
  context_length: number;
  top_provider?: { max_completion_tokens?: number | null };
  pricing: Record<string, string>;
}
export interface PaidCall {
  ledgerId?: string;
  metadata?: Record<string, string | number>;
  operation: string;
  model: string;
  startedAt: string;
  latencyMs?: number;
  reservedUsd: number;
  actualUsd?: number;
  providerId?: string;
  status: "started" | "completed" | "uncertain";
  queuedAt?: string;
  queueMs?: number;
  httpStatus?: number;
  requestId?: string;
  bodyReadError?: string;
}
export interface SharedAccounting {
  lock<T>(work: () => Promise<T>): Promise<T>;
  load(): Promise<{ calls: PaidCall[]; interruption?: CampaignStop }>;
}
export interface CampaignStop {
  reason:
    | "budget_exhausted"
    | "cost_exceeded_reservation"
    | "operator_interrupt"
    | "authorization_declined";
  at: string;
  operation?: string;
  requiredUsd?: number;
}

export function blocksCampaign(stop: CampaignStop | undefined, limitsSuspended: boolean): boolean {
  if (!stop) return false;
  return !limitsSuspended || (stop.reason !== "budget_exhausted" && stop.reason !== "cost_exceeded_reservation");
}
/** Conservative pre-dispatch reservation; model prices are fetched and pinned by the operator run. */
export function reserveQuote(
  payload: Record<string, any>,
  quote: PriceQuote,
  systemOne = false
) {
  const price = (key: string) => {
    const value = Number(quote.pricing[key] ?? 0);
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`invalid_price:${key}`);
    return value;
  };
  if (
    !Number.isFinite(quote.context_length) ||
    quote.context_length <= 0 ||
    !quote.pricing.prompt ||
    !quote.pricing.completion
  )
    throw new Error("incomplete_model_price_quote");
  if (payload.tools || payload.plugins)
    throw new Error("unbounded_auxiliary_service_cost");
  const body = JSON.stringify(payload);
  const imageCount = (body.match(/"image_url"/g) ?? []).length;
  // Bytes upper-bound ordinary text tokens; images reserve the entire context.
  const inputBound = imageCount
    ? quote.context_length
    : Math.min(quote.context_length, Buffer.byteLength(body) + 4096);
  const outputBound = systemOne
    ? 0
    : Number(
        payload.max_completion_tokens ??
          payload.max_tokens ??
          quote.top_provider?.max_completion_tokens ??
          quote.context_length
      );
  if (
    !Number.isInteger(outputBound) ||
    outputBound < 0 ||
    outputBound > quote.context_length
  )
    throw new Error("unbounded_completion_budget");
  // Sol has higher long-context pricing. Pin an acceptance ceiling for chat routing.
  const tier =
    payload.model.startsWith("openai/gpt-6.1-sol") && inputBound > 272_000
      ? 2
      : 1;
  const inputRate =
    Math.max(
      price("prompt"),
      price("input_cache_write"),
      price("input_cache_read")
    ) * tier;
  const outputRate =
    Math.max(price("completion"), price("internal_reasoning")) * tier;
  const usd =
    (inputBound * inputRate +
      outputBound * outputRate +
      price("request") +
      price("image") *
        (imageCount +
          (payload.modalities?.includes("image") ? outputBound : 0))) *
    1.06;
  return {
    usd,
    maxPrice: {
      prompt: inputRate * 1_000_000,
      completion: outputRate * 1_000_000,
    },
  };
}

export class MatrixBudget {
  private tail = Promise.resolve();
  private stopped?: CampaignStop;
  constructor(
    readonly maxUsd: number,
    readonly maxCalls: number,
    readonly calls: PaidCall[],
    private persist: (calls: PaidCall[]) => Promise<void>,
    private accounting?: SharedAccounting,
    private suspendLimits?: () => Promise<boolean>
  ) {
    if (
      !Number.isFinite(maxUsd) ||
      maxUsd <= 0 ||
      !Number.isInteger(maxCalls) ||
      maxCalls <= 0
    )
      throw new Error("explicit_numeric_budget_required");
  }
  get committedUsd() {
    return this.calls.reduce(
      (sum, call) => sum + (call.actualUsd ?? call.reservedUsd),
      0
    );
  }
  get knownUsd() {
    return this.calls.reduce((sum, call) => sum + (call.actualUsd ?? 0), 0);
  }
  get interruption() {
    return this.stopped;
  }
  stop(reason: CampaignStop["reason"], requiredUsd?: number) {
    this.stopped ??= {
      reason,
      at: new Date().toISOString(),
      operation: paidOperationScope.getStore(),
      requiredUsd,
    };
  }
  async refresh() {
    await this.locked(async () => {});
  }
  async flush() {
    await this.locked(() => this.persist(this.calls));
  }
  async canPrepare(minimumUsd: number) {
    return this.locked(async () => {
      const limitsSuspended = await this.suspendLimits?.() ?? false;
      if (
        blocksCampaign(this.stopped, limitsSuspended) ||
        !Number.isFinite(minimumUsd) ||
        minimumUsd < 0 ||
        (!limitsSuspended && (this.calls.length >= this.maxCalls || this.committedUsd + minimumUsd > this.maxUsd))
      ) {
        this.stop("budget_exhausted", minimumUsd);
        await this.persist(this.calls);
        return false;
      }
      return true;
    });
  }
  private async locked<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    const transaction = async () => {
      if (this.accounting) {
        const state = await this.accounting.load();
        const inFlight = new Map(
          this.calls.filter(c => c.ledgerId).map(c => [c.ledgerId, c])
        );
        this.calls.splice(
          0,
          this.calls.length,
          ...state.calls.map(row => {
            const existing = row.ledgerId && inFlight.get(row.ledgerId);
            return existing ? Object.assign(existing, row) : row;
          })
        );
        this.stopped ??= state.interruption;
      }
      return work();
    };
    try {
      return await (this.accounting
        ? this.accounting.lock(transaction)
        : transaction());
    } finally {
      release();
    }
  }
  async run<T>(
    model: string,
    reserveUsd: number,
    work: () => Promise<{
      result: T;
      actualUsd?: number;
      providerId?: string;
      httpStatus?: number;
      requestId?: string;
      bodyReadError?: string;
    }>,
    signal?: AbortSignal | null
  ): Promise<T> {
    const queuedAt = Date.now(),
      operation = paidOperationScope.getStore() ?? "unscoped";
    // Serialize durable accounting only. Provider concurrency and its deadlines
    // must remain those of the production coordinator, with no artificial queue.
    const { call, limitsSuspended } = await this.locked(async () => {
      signal?.throwIfAborted();
      const limitsSuspended = await this.suspendLimits?.() ?? false;
      signal?.throwIfAborted();
      if (blocksCampaign(this.stopped, limitsSuspended)) {
        await this.persist(this.calls);
        throw new Error(`comparison_campaign_stopped:${this.stopped?.reason}`);
      }
      if (
        !Number.isFinite(reserveUsd) ||
        reserveUsd < 0 ||
        (!limitsSuspended && (this.calls.length >= this.maxCalls || this.committedUsd + reserveUsd > this.maxUsd))
      ) {
        this.stop("budget_exhausted", reserveUsd);
        await this.persist(this.calls);
        throw new Error("comparison_budget_exhausted_before_dispatch");
      }
      const call: PaidCall = {
        ledgerId: randomUUID(),
        metadata: paidCallMetadata.getStore(),
        operation,
        model,
        queuedAt: new Date(queuedAt).toISOString(),
        queueMs: Date.now() - queuedAt,
        startedAt: new Date().toISOString(),
        reservedUsd: reserveUsd,
        status: "started",
      };
      this.calls.push(call);
      await this.persist(this.calls); // Reserve durably before transmission; a crash does not free uncertain spend.
      return { call, limitsSuspended };
    });
    const start = Date.now();
    try {
      const response = await work();
      await this.locked(async () => {
        call.latencyMs = Date.now() - start;
        call.status = response.bodyReadError ? "uncertain" : "completed";
        Object.assign(call, {
          providerId: response.providerId,
          httpStatus: response.httpStatus,
          requestId: response.requestId,
          bodyReadError: response.bodyReadError,
        });
        if (
          typeof response.actualUsd === "number" &&
          Number.isFinite(response.actualUsd) &&
          response.actualUsd >= 0
        )
          call.actualUsd = response.actualUsd;
        if (!limitsSuspended && (
          (call.actualUsd ?? 0) > reserveUsd ||
          this.committedUsd > this.maxUsd
        ))
          this.stop("cost_exceeded_reservation");
        await this.persist(this.calls);
      });
      return response.result;
    } catch (error) {
      await this.locked(async () => {
        call.status = "uncertain";
        call.latencyMs = Date.now() - start;
        await this.persist(this.calls);
      });
      throw error;
    }
  }
}

/** All existing provider modules use fetch. This catches JEV, text, vision and images, including retries. */
export function installMatrixTransport(
  budget: MatrixBudget,
  quotes: Map<string, PriceQuote>,
  options: {
    /** Local harness only: exact expected Supabase origin, never a wildcard. */
    allowApplicationRequest?: (
      url: URL,
      method: string,
      request: RequestInfo | URL,
      init?: RequestInit
    ) => Promise<boolean>;
    onApplicationResponse?: (
      url: URL,
      request: RequestInfo | URL,
      init: RequestInit | undefined,
      response: Response
    ) => Promise<void>;
    context?: (payload: Record<string, any>) => Promise<{
      operation: string;
      metadata: Record<string, string | number>;
    }>;
  } = {}
) {
  const original = globalThis.fetch;
  globalThis.fetch = async (request, init) => {
    const url = new URL(
      typeof request === "string" || request instanceof URL
        ? request
        : request.url
    );
    const method =
      init?.method ?? (request instanceof Request ? request.method : "GET");
    if (url.hostname !== "openrouter.ai") {
      if (
        await options.allowApplicationRequest?.(
          url,
          method.toUpperCase(),
          request,
          init
        )
      ) {
        const response = await original(request, init);
        await options.onApplicationResponse?.(url, request, init, response);
        return response;
      }
      // Existing image/text fallbacks must never bypass this run's ledger. Asset
      // downloads and source scraping remain read-only; cloud API writes do not.
      const paidHost =
        /(^|\.)(pollinations\.ai|api\.openai\.com|api\.groq\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com)$/.test(
          url.hostname
        );
      if (paidHost || !["GET", "HEAD"].includes(method.toUpperCase()))
        throw new Error("paid_route_outside_openrouter_blocked");
      return original(request, init);
    }
    if (method.toUpperCase() !== "POST") return original(request, init);
    if (
      !["/api/v1/chat/completions", "/api/v1/systemone"].includes(
        url.pathname
      ) ||
      typeof init?.body !== "string"
    )
      throw new Error("unbudgeted_provider_endpoint");
    const payload = JSON.parse(init.body),
      quote = quotes.get(payload.model);
    if (!quote) throw new Error(`unquoted_model:${payload.model}`);
    const systemOne = url.pathname.endsWith("/systemone");
    const bound = reserveQuote(payload, quote, systemOne);
    if (!systemOne) {
      // Reservation may use a higher context tier; it must never relax the
      // application's separately pinned endpoint acceptance price.
      const requested = payload.provider?.max_price ?? {};
      const maxPrice = { ...requested, ...bound.maxPrice };
      for (const key of ["prompt", "completion"] as const) {
        if (requested[key] === undefined) continue;
        const limit = Number(requested[key]);
        if (!Number.isFinite(limit) || limit < 0) throw new Error("invalid_requested_max_price");
        maxPrice[key] = Math.min(bound.maxPrice[key], limit);
      }
      payload.provider = { ...payload.provider, max_price: maxPrice };
    }
    const invoke = () =>
      budget.run(
        payload.model,
        bound.usd,
        async () => {
          const response = await original(request, {
            ...init,
            body: JSON.stringify(payload),
          });
          let receipt: any, bodyReadError: string | undefined;
          try {
            receipt = await response.clone().json();
          } catch (error) {
            bodyReadError =
              error instanceof Error ? error.name : "body_unreadable";
          }
          return {
            result: response,
            actualUsd: receipt?.usage?.cost,
            providerId:
              receipt?.id ??
              response.headers.get("x-generation-id") ??
              undefined,
            httpStatus: response.status,
            requestId:
              response.headers.get("x-request-id") ??
              response.headers.get("request-id") ??
              undefined,
            bodyReadError,
          };
        },
        init?.signal ??
          (request instanceof Request ? request.signal : undefined)
      );
    const context = await options.context?.(payload);
    return context
      ? paidOperationScope.run(context.operation, () =>
          paidCallMetadata.run(context.metadata, invoke)
        )
      : invoke();
  };
  return () => {
    globalThis.fetch = original;
  };
}
