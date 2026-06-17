import type { NextFunction, Request, Response } from "express";
import { appendFile } from "fs/promises";
import path from "path";
import { inspect } from "util";

const LOG_FILE = path.resolve(process.cwd(), "OPERATIONAL_ERRORS.txt");
const MAX_FIELD_LENGTH = 4_000;

type OperationalLogDetails = Record<string, unknown>;

const redact = (value: string): string =>
  value
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;}]+/gi, "$1[REDACTED]")
    .replace(/(cookie\s*[:=]\s*)[^,;}]+/gi, "$1[REDACTED]")
    .replace(/(access_token\s*[:=]\s*)[^,;}]+/gi, "$1[REDACTED]")
    .replace(/(refresh_token\s*[:=]\s*)[^,;}]+/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key\s*[:=]\s*)[^,;}]+/gi, "$1[REDACTED]");

const truncate = (value: string): string =>
  value.length > MAX_FIELD_LENGTH
    ? `${value.slice(0, MAX_FIELD_LENGTH)}...[truncated ${value.length - MAX_FIELD_LENGTH} chars]`
    : value;

const serialize = (value: unknown): string => {
  if (value instanceof Error) {
    return truncate(redact(value.stack || value.message));
  }

  if (typeof value === "string") {
    return truncate(redact(value));
  }

  return truncate(
    redact(
      inspect(value, {
        depth: 5,
        breakLength: 160,
        maxArrayLength: 50,
        maxStringLength: MAX_FIELD_LENGTH,
      }),
    ),
  );
};

export async function appendOperationalLog(
  event: string,
  details: OperationalLogDetails = {},
): Promise<void> {
  const lines = [
    `[${new Date().toISOString()}] ${event}`,
    ...Object.entries(details).map(([key, value]) => `${key}: ${serialize(value)}`),
    "",
  ];

  try {
    await appendFile(LOG_FILE, `${lines.join("\n")}\n`, "utf8");
  } catch {
    // Logging must never break the request path.
  }
}

export function installConsoleErrorFileLogging(): void {
  const originalError = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    originalError(...args);
    void appendOperationalLog("CONSOLE_ERROR", {
      message: args.map(serialize).join(" "),
    });
  };

  process.on("unhandledRejection", (reason) => {
    void appendOperationalLog("UNHANDLED_REJECTION", { reason });
  });

  process.on("uncaughtException", (error) => {
    void appendOperationalLog("UNCAUGHT_EXCEPTION", { error });
  });
}

export function httpStatusFileLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = Date.now();
  let responseBody: unknown;

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    return originalJson(body);
  }) as Response["json"];

  const originalSend = res.send.bind(res);
  res.send = ((body: unknown) => {
    if (responseBody === undefined) {
      responseBody = body;
    }
    return originalSend(body);
  }) as Response["send"];

  res.on("finish", () => {
    if (res.statusCode === 200) return;

    void appendOperationalLog("HTTP_NON_200", {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      responseBody,
    });
  });

  next();
}
