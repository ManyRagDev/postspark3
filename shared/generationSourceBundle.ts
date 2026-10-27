export type GenerationContextSource = {
  id: string;
  kind: "project" | "site_snapshot" | "page" | "request" | "image";
  purpose: "content" | "guidance";
  origin: string;
  text: string;
  url?: string;
};
export type GenerationSourceBundle = {
  version: 1;
  sources: GenerationContextSource[];
  text: string;
};
