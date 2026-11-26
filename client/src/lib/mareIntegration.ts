import { PLAN_CHANGE_STORAGE_KEY } from "@/lib/sessionPlanEvents";
import { useEffect, useState } from "react";

export interface MareCapabilities {
  video: boolean;
  editor: boolean;
  publicEntry: boolean;
  localPreview?: boolean;
  paid: boolean;
}
interface Destination {
  postId?: number;
  agencyProjectId?: string;
  workspaceId?: string;
  expectedRevision: number;
  documentId: string;
  slideId: string;
  slotId: string;
}
export interface MareAnchor extends Destination {
  id: string;
  revisionId?: string;
  pending?: boolean;
  canApply?: boolean;
  conflict?: string;
  appliedRevision?: number;
}

async function request<T>(path: string, input?: object): Promise<T> {
  const options: RequestInit = {
    method: input ? "POST" : "GET",
    credentials: "same-origin",
    ...(input
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      : {}),
  };
  const url = "/api/mare/" + path;
  let response = await fetch(url, options);
  if (response.status === 401) {
    const { refreshBridgeFromCurrentSession } = await import("./authBridge");
    await refreshBridgeFromCurrentSession();
    response = await fetch(url, options);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body)
    throw Object.assign(
      new Error(
        body?.error ??
          body?.message ??
          "Não foi possível acessar o Maré Studio."
      ),
      { status: response.status }
    );
  return body;
}
export function useMareCapabilities(identity?: string) {
  const [value, setValue] = useState<MareCapabilities>();
  useEffect(() => {
    let revision = 0;
    const refresh = () => {
      const requested = ++revision;
      setValue(undefined);
      void request<MareCapabilities>("capabilities")
        .then(data => {
          if (requested === revision) setValue(data);
        })
        .catch(() => {});
    };
    const onPlanChange = (event: StorageEvent) => {
      if (event.key === PLAN_CHANGE_STORAGE_KEY) refresh();
    };
    refresh();
    window.addEventListener("storage", onPlanChange);
    return () => {
      revision++;
      window.removeEventListener("storage", onPlanChange);
    };
  }, [identity]);
  return value;
}
export async function sendToMare(destination: Destination) {
  const { id } = await request<{ id: string }>("anchors", destination);
  window.location.assign("/mare/?anchor=" + encodeURIComponent(id));
}
export function mareReturnId() {
  const id = new URLSearchParams(window.location.search).get("mareReturn");
  return id && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)
    ? id
    : undefined;
}
export async function acceptMareReturn(
  id: string,
  destination: "personal" | "agency"
) {
  const path = "anchors/" + encodeURIComponent(id);
  const anchor = await request<MareAnchor>(path);
  if (destination === "agency" ? !anchor.agencyProjectId : !anchor.postId)
    throw new Error("O design pertence a outro ambiente.");
  if (anchor.pending && anchor.canApply !== false && anchor.revisionId) {
    try {
      await request(path + "/apply", {
        revisionId: anchor.revisionId,
        expectedRevision: anchor.expectedRevision,
      });
      announceReturn(anchor);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 409)
        return { ...anchor, conflict: error.message };
      throw error;
    }
  }
  return anchor;
}
const returnChannel = "postspark.mare.applied";
function announceReturn(anchor: MareAnchor) {
  if (typeof window.BroadcastChannel !== "function") return;
  const channel = new BroadcastChannel(returnChannel);
  channel.postMessage({
    anchorId: anchor.id,
    recordId: anchor.agencyProjectId ?? String(anchor.postId),
  });
  channel.close();
}
export function observeMareReturns(
  recordId: string,
  receive: (anchorId: string) => void
) {
  if (typeof window.BroadcastChannel !== "function") return () => {};
  const channel = new BroadcastChannel(returnChannel);
  channel.onmessage = ({ data }) => {
    if (
      data?.recordId === recordId &&
      typeof data.anchorId === "string" &&
      /^[0-9a-f-]{36}$/i.test(data.anchorId)
    )
      receive(data.anchorId);
  };
  return () => channel.close();
}
export function clearMareReturn() {
  const url = new URL(window.location.href);
  url.searchParams.delete("mareReturn");
  window.history.replaceState(window.history.state, "", url);
}

export async function retargetMareReturn(
  anchor: MareAnchor,
  slideId: string,
  slotId: string,
  expectedRevision: number
) {
  const path = "anchors/" + encodeURIComponent(anchor.id);
  await request(path + "/retarget", {
    slideId,
    slotId,
    expectedRevision,
    revisionId: anchor.revisionId,
  });
  await request(path + "/apply", {
    expectedRevision,
    revisionId: anchor.revisionId,
  });
  announceReturn(anchor);
}
