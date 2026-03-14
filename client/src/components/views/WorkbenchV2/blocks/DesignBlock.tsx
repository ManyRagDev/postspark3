/**
 * DesignBlock — Bloco de Identidade Visual do WorkbenchV2 (Passo 4.3).
 *
 * Extrai e modulariza a seção "Marca & Temas" do WorkbenchRefactored legado.
 *
 * Responsabilidades:
 *  - Exibir e editar os Design Tokens (DesignTokens) da variação ativa
 *    via <ChameleonPanel />
 *  - Controlar a cor de destaque (accentColor) e cor de fundo (backgroundColor)
 *    da variation ativa
 *
 * Fonte de dados: 100% Zustand (useEditorStore). Zero props de estado.
 * O WorkbenchRefactored.tsx NÃO é alterado.
 */

import React from "react";
import { Palette } from "lucide-react";
import type { DesignTokens } from "@shared/postspark";
import { DEFAULT_DESIGN_TOKENS } from "@shared/postspark";
import ChameleonPanel from "@/components/ChameleonPanel";
import { useEditorStore } from "@/store/editorStore";

export default function DesignBlock() {
    const activeVariation = useEditorStore((s) => s.activeVariation);
    const updateVariation = useEditorStore((s) => s.updateVariation);
    const layoutTarget = useEditorStore((s) => s.layoutTarget);

    if (!activeVariation) {
        return (
            <div className="text-[11px] text-[var(--text-tertiary)] italic text-center py-4">
                Sem post ativo
            </div>
        );
    }

    // Tokens atuais da variation (fallback para DEFAULT)
    const tokens: DesignTokens = (activeVariation.designTokens as DesignTokens | undefined) ?? DEFAULT_DESIGN_TOKENS;

    // Converte layoutTarget do Zustand para o activeTarget esperado pelo ChameleonPanel
    const panelTarget = (layoutTarget === "global"
        ? "both"
        : layoutTarget) as "headline" | "body" | "both";

    const handleTokensChange = (updated: DesignTokens) => {
        updateVariation({
            designTokens: updated,
        });
    };

    const handleUpdateVariation = (partial: Partial<typeof activeVariation>) => {
        updateVariation(partial);
    };

    return (
        <div className="space-y-3">
            {/* Cabeçalho */}
            <div className="flex items-center gap-2">
                <Palette size={13} className="text-[var(--text-tertiary)]" />
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                    Identidade Visual
                </label>
            </div>

            {/* ChameleonPanel — reutilizado do legado */}
            <ChameleonPanel
                tokens={tokens}
                onChange={handleTokensChange}
                variation={activeVariation}
                onUpdateVariation={handleUpdateVariation}
                activeTarget={panelTarget}
            />
        </div>
    );
}
