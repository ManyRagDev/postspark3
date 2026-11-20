import { useSyncExternalStore } from "react";
import { identityFixture } from "../../shared/visualIdentity.fixture";

let revision = 0;
const project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Minha marca",
  niche: "",
  sourceType: "form",
  structuredData: {},
  compiledDocument: "",
  visualPreferences: {
    colors: ["#123456", "#ffffff", "#102030"],
    fonts: ["Inter"],
    personality: ["Estilo de teste"],
  },
  visualIdentity: identityFixture({
    headingFont: "Fonte de exemplo indisponível",
  }),
};
const subscribe = (listener: () => void) => {
  window.addEventListener("identity-harness-change", listener);
  return () => window.removeEventListener("identity-harness-change", listener);
};
const invalidate = async () => {
  revision++;
  window.dispatchEvent(new Event("identity-harness-change"));
};
export const trpc = {
  useUtils: () => ({ brandProjects: { list: { invalidate } } }),
  catalog: {
    acervo82Directory: { useQuery: () => ({ data: { families: [] } }) },
  },
  brandProjects: {
    list: {
      useQuery: () => {
        useSyncExternalStore(subscribe, () => revision);
        return { data: [project] };
      },
    },
    delete: { useMutation: () => ({ mutateAsync: async () => undefined }) },
    saveIdentity: {
      useMutation: () => ({
        mutateAsync: async (input: any) => {
          const response = await fetch("/identity-harness-save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          if (!response.ok) throw new Error("Falha controlada");
          const result = await response.json();
          project.visualIdentity = result.visualIdentity;
          project.name = input.name;
          return result;
        },
      }),
    },
  },
  post: {
    saveMediaAsset: {
      useMutation: () => ({
        mutateAsync: async () => {
          throw new Error("Upload não faz parte deste harness");
        },
      }),
    },
  },
};
