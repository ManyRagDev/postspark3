import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import {
  derivePhysicalDensity,
  derivePhysicalImageRole,
  derivePhysicalTypography,
  FAMILY_AXES_RECONCILIATION_VERSION,
} from "../shared/familyNeutrality";

const AGREGADO_PATH = path.resolve("artifacts/design-audit-20261111/agregado-82.json");
const INTERNOS_PATH = path.resolve("artifacts/design-audit-20261111/perfis-82-internos.json");
const OUTPUT_PATH = path.resolve("artifacts/design-audit-20261111/perfis-82-reconciliados.json");

interface AgregadoItem {
  id: string;
  family: string;
  label: string;
  aspectRatios: string[];
  roles: string[];
  n_regions: number;
  n_mediaSlots: number;
  densities: string[];
  sourceFontFamilies: string[];
}

interface PerfilInterno {
  version: number;
  kind: string;
  family: string;
  description?: string;
  aesthetic: {
    languages: string[];
    treatments: string[];
    motifs: string[];
    fonts: string[];
    densities: string[];
    identity: {
      essential: string[];
      optional: string[];
      adaptable: string[];
    };
  };
  editorial: {
    catalogHash: string | null;
    intents: any[];
    rationales: string[];
  };
  structure: {
    capacityRule: string;
    textBlocks: { min: number; max: number };
    listBlocks: { min: number; max: number };
    listItemsPerBlock: any;
    mediaSlots: { min: number; max: number };
    relationships: string[];
  };
  availability: {
    roles: string[];
    functions: string[];
  };
  compactAssessment?: boolean;
}

export interface ReconciliationChange {
  family: string;
  field: "density" | "imageRole" | "typography" | "roles";
  oldValue: string;
  newValue: string;
  source: string;
}

const mapCardDensityToProfile = derivePhysicalDensity;
const deriveImageRole = derivePhysicalImageRole;
const deriveTypography = derivePhysicalTypography;

export function reconcile82Data(): {
  reconciled: PerfilInterno[];
  changes: ReconciliationChange[];
} {
  const agregado: AgregadoItem[] = JSON.parse(fs.readFileSync(AGREGADO_PATH, "utf-8"));
  const internos: PerfilInterno[] = JSON.parse(fs.readFileSync(INTERNOS_PATH, "utf-8"));

  const cardByFamily = new Map<string, AgregadoItem>();
  for (const c of agregado) {
    cardByFamily.set(c.family, c);
  }

  const changes: ReconciliationChange[] = [];
  const reconciled: PerfilInterno[] = [];

  for (const perfil of internos) {
    const card = cardByFamily.get(perfil.family);
    if (!card) {
      reconciled.push(perfil);
      continue;
    }

    const next = structuredClone(perfil);

    // 1. Density: fato físico do card vence
    const targetDensity = mapCardDensityToProfile(card.densities);
    const oldDensity = next.aesthetic.densities[0] || "desconhecida";
    if (oldDensity !== targetDensity) {
      changes.push({
        family: perfil.family,
        field: "density",
        oldValue: oldDensity,
        newValue: targetDensity,
        source: `card.densities=[${card.densities.join(",")}]`,
      });
      next.aesthetic.densities = [targetDensity];
      next.aesthetic.identity.essential = next.aesthetic.identity.essential.map(item =>
        item.startsWith("density:") ? `density: ${targetDensity}` : item
      );
    }

    // 2. ImageRole: derivar de mediaSlots
    const targetImageRole = deriveImageRole(card.n_mediaSlots);
    const oldImageRoleItem = next.aesthetic.identity.essential.find(item => item.startsWith("imageRole:"));
    const oldImageRole = oldImageRoleItem ? oldImageRoleItem.replace(/^imageRole:\s*/, "") : "desconhecido";
    if (oldImageRole !== targetImageRole) {
      changes.push({
        family: perfil.family,
        field: "imageRole",
        oldValue: oldImageRole,
        newValue: targetImageRole,
        source: `card.n_mediaSlots=${card.n_mediaSlots}`,
      });
      if (oldImageRoleItem) {
        next.aesthetic.identity.essential = next.aesthetic.identity.essential.map(item =>
          item.startsWith("imageRole:") ? `imageRole: ${targetImageRole}` : item
        );
      } else {
        next.aesthetic.identity.essential.push(`imageRole: ${targetImageRole}`);
      }
    }

    // 3. Typography: derivar de sourceFontFamilies
    const targetTypography = deriveTypography(card.sourceFontFamilies || []);
    const oldTypography = next.aesthetic.treatments[0] || "desconhecido";
    if (oldTypography !== targetTypography) {
      changes.push({
        family: perfil.family,
        field: "typography",
        oldValue: oldTypography,
        newValue: targetTypography,
        source: `card.sourceFontFamilies=[${(card.sourceFontFamilies || []).join(",")}]`,
      });
      next.aesthetic.treatments = [targetTypography];
      next.aesthetic.identity.essential = next.aesthetic.identity.essential.map(item =>
        item.startsWith("typography:") ? `typography: ${targetTypography}` : item
      );
    }

    // 4. Roles: card.roles vence
    const targetRoles = [...card.roles].sort();
    const oldRoles = [...(next.availability.roles || [])].sort();
    if (JSON.stringify(oldRoles) !== JSON.stringify(targetRoles)) {
      changes.push({
        family: perfil.family,
        field: "roles",
        oldValue: `[${oldRoles.join(",")}]`,
        newValue: `[${targetRoles.join(",")}]`,
        source: `card.roles=[${targetRoles.join(",")}]`,
      });
      next.availability.roles = targetRoles;
    }

    reconciled.push(next);
  }

  return { reconciled, changes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { reconciled, changes } = reconcile82Data();
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(reconciled, null, 2), "utf-8");
  const auditPath = path.resolve("artifacts/design-audit-20261111/reconciliation-trace.json");
  fs.writeFileSync(
    auditPath,
    JSON.stringify({ version: FAMILY_AXES_RECONCILIATION_VERSION, totalChanges: changes.length, changes }, null, 2),
    "utf-8"
  );

  console.log(`Reconciliação v${FAMILY_AXES_RECONCILIATION_VERSION} concluída para ${reconciled.length} perfis.`);
  console.log(`Total de correções aplicadas: ${changes.length}`);
  console.log("--- Detalhe das alterações (amostra de 20): ---");
  for (const c of changes.slice(0, 20)) {
    console.log(`[${c.family}] ${c.field}: ${c.oldValue} → ${c.newValue} → fonte: ${c.source}`);
  }
}
