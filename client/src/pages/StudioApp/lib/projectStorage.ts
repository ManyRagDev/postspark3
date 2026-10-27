import type { ProjectStructuredData } from "@shared/brandProjects";

export interface LocalBrandProject {
  id: string;
  name: string;
  niche: string;
  sourceType: "form" | "external_prompt";
  structuredData: ProjectStructuredData;
  compiledDocument: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  isLocalOnly?: boolean;
}

const SELECTED_PROJECT_STORAGE_KEY = "postspark.selected_project_id.v1";
const LOCAL_PROJECTS_STORAGE_KEY = "postspark.local_brand_projects.v1";

export function getSelectedProjectId(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setSelectedProjectId(id: string | null): void {
  try {
    if (id) {
      window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
    }
  } catch {
    // Storage access may be blocked
  }
}

export function getLocalProjects(): LocalBrandProject[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function getLocalProjectById(id: string): LocalBrandProject | null {
  const projects = getLocalProjects();
  return projects.find((p) => p.id === id) || null;
}

export function saveLocalProject(
  input: {
    id?: string;
    name: string;
    niche: string;
    sourceType: "form" | "external_prompt";
    structuredData: ProjectStructuredData;
    compiledDocument: string;
    isDefault?: boolean;
  }
): LocalBrandProject {
  const projects = getLocalProjects();
  const now = new Date().toISOString();
  const projectId = input.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`);

  if (input.isDefault) {
    projects.forEach((p) => {
      p.isDefault = false;
    });
  }

  const existingIndex = projects.findIndex((p) => p.id === projectId);
  const record: LocalBrandProject = {
    id: projectId,
    name: input.name,
    niche: input.niche,
    sourceType: input.sourceType,
    structuredData: input.structuredData,
    compiledDocument: input.compiledDocument,
    isDefault: Boolean(input.isDefault),
    createdAt: existingIndex !== -1 ? projects[existingIndex].createdAt : now,
    updatedAt: now,
    isLocalOnly: true,
  };

  if (existingIndex !== -1) {
    projects[existingIndex] = record;
  } else {
    projects.unshift(record);
  }

  try {
    window.localStorage.setItem(LOCAL_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch (err) {
    console.error("[projectStorage] Falha ao persistir localmente:", err);
  }

  return record;
}

export function deleteLocalProject(id: string): void {
  const projects = getLocalProjects().filter((p) => p.id !== id);
  try {
    window.localStorage.setItem(LOCAL_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch (err) {
    console.error("[projectStorage] Falha ao excluir localmente:", err);
  }
}
