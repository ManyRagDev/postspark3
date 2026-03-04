import type { CopyAngleType } from "@shared/postspark";

export interface AngleTemplates {
    badge: string;
    stickerText: string;
    headlinePrefix?: string;
}

export const ANGLE_TEMPLATES: Record<CopyAngleType, AngleTemplates> = {
    dor: {
        badge: "🔴 ALERTA",
        stickerText: "PERIGO",
        headlinePrefix: "Pare de cometer esse erro: ",
    },
    beneficio: {
        badge: "🟢 VANTAGEM",
        stickerText: "GRÁTIS",
        headlinePrefix: "Descubra como ganhar: ",
    },
    objecao: {
        badge: "🟡 DÚVIDA",
        stickerText: "SÉRIO?",
        headlinePrefix: "Sim, isso funciona porque: ",
    },
    autoridade: {
        badge: "🔵 ESPECIALISTA",
        stickerText: "PROVADO",
        headlinePrefix: "O segredo dos experts: ",
    },
    escassez: {
        badge: "⏳ ÚLTIMA CHANCE",
        stickerText: "ACABANDO",
        headlinePrefix: "Só restam poucas unidades: ",
    },
    storytelling: {
        badge: "📖 JORNADA",
        stickerText: "HISTÓRIA",
        headlinePrefix: "Minha vida mudou quando: ",
    },
    mito_vs_verdade: {
        badge: "⚡ MITO",
        stickerText: "VERDADE",
        headlinePrefix: "O que não te contam sobre: ",
    },
};
