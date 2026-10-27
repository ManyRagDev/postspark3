import { brandCaptureMetadataSchema, capturedVisualPreferencesSchema } from "./generationSources";
import { z } from "zod";

/**
 * Dados estruturados de calibração de um projeto / empresa.
 */
export const projectStructuredDataSchema = z.object({
  offerAndTransformation: z.string().max(2000).default(""),
  factualDifferentials: z.string().max(2000).default(""),
  targetAudience: z.string().max(2000).default(""),
  painsAndObjections: z.string().max(2000).default(""),
  voiceTone: z.string().max(1000).default(""),
  forbiddenTerms: z.string().max(2000).default(""),
  defaultCta: z.string().max(1000).default(""),
});

export type ProjectStructuredData = z.infer<typeof projectStructuredDataSchema>;

/**
 * Schema para criação / edição de um Brand Project.
 */
export const brandProjectInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "O nome do projeto é obrigatório").max(120),
  niche: z.string().min(1, "O nicho ou segmento é obrigatório").max(120),
  sourceType: z.enum(["form", "external_prompt", "website"]).default("form"),
  structuredData: projectStructuredDataSchema.default({
    offerAndTransformation: "",
    factualDifferentials: "",
    targetAudience: "",
    painsAndObjections: "",
    voiceTone: "",
    forbiddenTerms: "",
    defaultCta: "",
  }),
  compiledDocument: z.string().max(24000).default(""),
  isDefault: z.boolean().default(false),
  capture: brandCaptureMetadataSchema.optional(),
  visualPreferences: capturedVisualPreferencesSchema.optional(),
});

export type BrandProjectInput = z.infer<typeof brandProjectInputSchema>;

export interface BrandProjectRecord {
  id: string;
  userUuid: string;
  name: string;
  niche: string;
  sourceType: "form" | "external_prompt" | "website";
  capture?: z.infer<typeof brandCaptureMetadataSchema>;
  visualPreferences?: z.infer<typeof capturedVisualPreferencesSchema>;
  structuredData: ProjectStructuredData;
  compiledDocument: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Compila os dados estruturados de calibração em um documento Markdown denso e factual.
 */
export function compileProjectDossier(name: string, niche: string, data: Partial<ProjectStructuredData>): string {
  const parts: string[] = [
    `# DOSSIÊ DE MARCA: ${name.trim()}`,
    `**Segmento / Nicho:** ${niche.trim()}`,
  ];

  if (data.offerAndTransformation?.trim()) {
    parts.push(`\n## O QUE FAZEMOS & TRANSFORMAÇÃO\n${data.offerAndTransformation.trim()}`);
  }

  if (data.factualDifferentials?.trim()) {
    parts.push(`\n## DIFERENCIAIS FACTUAIS\n${data.factualDifferentials.trim()}`);
  }

  if (data.targetAudience?.trim()) {
    parts.push(`\n## PÚBLICO-ALVO\n${data.targetAudience.trim()}`);
  }

  if (data.painsAndObjections?.trim()) {
    parts.push(`\n## DORES E OBJEÇÕES DO CLIENTE\n${data.painsAndObjections.trim()}`);
  }

  if (data.voiceTone?.trim()) {
    parts.push(`\n## POSTURA E TOM DE VOZ\n${data.voiceTone.trim()}`);
  }

  if (data.forbiddenTerms?.trim()) {
    parts.push(`\n## TERMOS E ABORDAGENS PROIBIDAS\n${data.forbiddenTerms.trim()}`);
  }

  if (data.defaultCta?.trim()) {
    parts.push(`\n## CHAMADA PARA AÇÃO (CTA PADRÃO)\n${data.defaultCta.trim()}`);
  }

  return parts.join("\n").trim();
}

/**
 * Parser resiliente para o contrato do prompt externo ou documentos Markdown livres trazidos pelo usuário.
 */
export function parseDossierContract(rawText: string): {
  success: boolean;
  name?: string;
  niche?: string;
  structuredData?: ProjectStructuredData;
  compiledDocument?: string;
  error?: string;
} {
  if (!rawText || typeof rawText !== "string") {
    return { success: false, error: "Texto vazio ou inválido." };
  }

  // Tenta extrair o bloco delimitado se existir; caso contrário, usa o texto todo
  let content = rawText;
  const startIdx = rawText.indexOf("[POSTSPARK_DOSSIER_START]");
  const endIdx = rawText.indexOf("[POSTSPARK_DOSSIER_END]");

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    content = rawText.slice(startIdx + "[POSTSPARK_DOSSIER_START]".length, endIdx).trim();
  } else if (startIdx !== -1) {
    content = rawText.slice(startIdx + "[POSTSPARK_DOSSIER_START]".length).trim();
  }

  // Função auxiliar para capturar seções com títulos ##
  const extractSection = (regex: RegExp): string => {
    const match = content.match(regex);
    return match && match[1] ? match[1].trim() : "";
  };

  const name = extractSection(/##\s*NOME_DO_PROJETO\s*\n([\s\S]*?)(?=\n##|$)/i);
  const niche = extractSection(/##\s*NICHO\s*\n([\s\S]*?)(?=\n##|$)/i);
  const offerAndTransformation = extractSection(/##\s*OFERTA_E_TRANSFORMACAO\s*\n([\s\S]*?)(?=\n##|$)/i);
  const factualDifferentials = extractSection(/##\s*DIFERENCIAIS_FACTUAIS\s*\n([\s\S]*?)(?=\n##|$)/i);
  const targetAudience = extractSection(/##\s*PUBLICO_ALVO\s*\n([\s\S]*?)(?=\n##|$)/i);
  const painsAndObjections = extractSection(/##\s*DORES_E_OBJECOES\s*\n([\s\S]*?)(?=\n##|$)/i);
  const voiceTone = extractSection(/##\s*TOM_DE_VOZ\s*\n([\s\S]*?)(?=\n##|$)/i);
  const forbiddenTerms = extractSection(/##\s*FRONTEIRAS_E_TERMOS_PROIBIDOS\s*\n([\s\S]*?)(?=\n##|$)/i);
  const defaultCta = extractSection(/##\s*CTA_PADRAO\s*\n([\s\S]*?)(?=\n##|$)/i);

  // Se encontrou as seções estruturadas do contrato
  if (name || niche || offerAndTransformation) {
    const structuredData: ProjectStructuredData = {
      offerAndTransformation,
      factualDifferentials,
      targetAudience,
      painsAndObjections,
      voiceTone,
      forbiddenTerms,
      defaultCta,
    };

    const finalName = name || "Projeto sem nome";
    const finalNiche = niche || "Geral";
    const compiledDocument = compileProjectDossier(finalName, finalNiche, structuredData);

    return {
      success: true,
      name: finalName,
      niche: finalNiche,
      structuredData,
      compiledDocument,
    };
  }

  // Fallback para documento Markdown livre trazido pelo usuário
  const trimmed = content.trim();
  if (trimmed.length >= 20) {
    // Procura primeiro título # ou ## no documento para nome do projeto
    const titleMatch = trimmed.match(/^#+\s*(.+)$/m);
    const docName = titleMatch ? titleMatch[1].replace(/[*_#]/g, "").trim() : "Projeto";

    // Procura indicação de nicho ou segmento
    const nicheMatch = trimmed.match(/(?:nicho|segmento|área|ramo|setor)\s*[:=]\s*([^\n]+)/i);
    const docNiche = nicheMatch ? nicheMatch[1].replace(/[*_#]/g, "").trim() : "Geral";

    // Pega os primeiros parágrafos não-título como síntese da oferta
    const paragraphs = trimmed
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith("#"));
    const docOffer = paragraphs.slice(0, 2).join(" ").slice(0, 1000);

    const structuredData: ProjectStructuredData = {
      offerAndTransformation: docOffer,
      factualDifferentials: "",
      targetAudience: "",
      painsAndObjections: "",
      voiceTone: "",
      forbiddenTerms: "",
      defaultCta: "",
    };

    return {
      success: true,
      name: docName.slice(0, 100) || "Projeto",
      niche: docNiche.slice(0, 100) || "Geral",
      structuredData,
      compiledDocument: trimmed.slice(0, 24000),
    };
  }

  return {
    success: false,
    error: "O texto colado é muito curto ou não contém informações reconhecíveis do projeto.",
  };
}

/**
 * Template de prompt para o usuário copiar e enviar à IA externa (ChatGPT / Claude / etc.)
 */
export const EXTERNAL_DOSSIER_PROMPT_TEMPLATE = `Você é um Estrategista de Marca e Copywriter Sênior. Preciso gerar um "Dossiê de Calibragem de Projeto" para alimentar o motor criativo do PostSpark.

Use o que você já sabe sobre o meu projeto/empresa nesta conversa (ou analise os arquivos/textos que eu anexar abaixo). Se você ainda não tiver informações suficientes sobre o meu negócio, faça até 4 perguntas diretas antes de gerar o dossiê.

Quando tiver as informações, responda EXCLUSIVAMENTE com o bloco abaixo preenchido em português, mantendo exatamente os marcadores [POSTSPARK_DOSSIER_START] e [POSTSPARK_DOSSIER_END] e os títulos das seções com "##":

[POSTSPARK_DOSSIER_START]
## NOME_DO_PROJETO
(Apenas o nome comercial da marca, empresa ou projeto)

## NICHO
(O segmento de mercado em até 6 palavras)

## OFERTA_E_TRANSFORMACAO
(O que o negócio vende na prática e qual o principal benefício real para o cliente. Seja factual, sem clichês publicitários. Máx. 4 linhas.)

## DIFERENCIAIS_FACTUAIS
(Lista em tópicos curtos apenas com fatos reais, método próprio, garantias verdadeiras ou características técnicas que provam a qualidade. Não invente dados.)

## PUBLICO_ALVO
(Quem compra, qual o momento de vida/profissional e o que valoriza.)

## DORES_E_OBJECOES
(Quais problemas reais esse público enfrenta no dia a dia e quais dúvidas ou receios impedem a compra ou adesão.)

## TOM_DE_VOZ
(Escolha até 2: Direto e Pragmático | Científico e Técnico | Acolhedor e Empático | Provocativo e Ousado | Sofisticado e Minimalista | Leve e Bem-humorado | Didático e Acessível — seguido de 1 frase explicando a postura da comunicação, sem engessar estruturas de frase.)

## FRONTEIRAS_E_TERMOS_PROIBIDOS
(Palavras, jargões, promessas exageradas ou abordagens que esta marca NUNCA usa, separados por ponto e vírgula.)

## CTA_PADRAO
(O convite natural de fechamento quando o post pedir uma ação, ex: chamar no direct, acessar link da bio, comentar.)
[POSTSPARK_DOSSIER_END]`;
