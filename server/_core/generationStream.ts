import type { Express } from "express";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { ownedGenerationSubscription } from "../ai/workflows/localDemandStore";
import {
  generationEvents,
  type GenerationEvent,
} from "../ai/workflows/generationEvents";
import { COOKIE_NAME } from "@shared/const";
import { parse } from "cookie";
export function registerGenerationStream(app: Express) {
  app.get("/api/generation/events/:id", async (req, res) => {
    if (!ENV.localDemandEnabled) {
      res.sendStatus(404);
      return;
    }
    if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) {
      res.sendStatus(400);
      return;
    }
    try {
      const user = await sdk.authenticateRequest(req);
      const record = await ownedGenerationSubscription(req.params.id, user.id);
      if (!record) {
        res.sendStatus(404);
        return;
      }
      if (record.executionMode !== "local-demand") {
        res.sendStatus(409);
        return;
      }
      // getUser already validated the token. Decode only its expiration to bound this stream.
      const token = parse(req.headers.cookie ?? "")[COOKIE_NAME];
      const exp = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString()
      ).exp;
      if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
        res.sendStatus(401);
        return;
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      let closed = false;
      const send = (event: GenerationEvent) => {
        if (!closed && !res.writableEnded && event.ownerId === user.id)
          res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      const listener = (event: GenerationEvent) => {
        if (closed || event.ownerId !== user.id) return;
        // Revalidate on actual progress, not on a clock; revoked access must close the stream.
        void sdk
          .authenticateRequest(req)
          .then(current => {
            if (closed) return;
            if (current.id === user.id) send(event);
            else res.end();
          })
          .catch(() => {
            if (!closed) res.end();
          });
      };
      generationEvents.on(record.id, listener);
      const expiry = setTimeout(
        () => res.end(),
        Math.min(exp * 1000 - Date.now(), 2_147_483_647)
      );
      res.on("close", () => {
        closed = true;
        clearTimeout(expiry);
        generationEvents.off(record.id, listener);
      });
      // A ready event requests an authoritative read, closing the subscribe/read race.
      res.write("event: connected\ndata: {}\n\n");
    } catch {
      if (!res.headersSent) res.sendStatus(401);
      else res.end();
    }
  });
}
