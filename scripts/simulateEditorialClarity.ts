/** Exploratory, offline simulation. Does NOT change the application's observer,
 * scores, thresholds or selection. Expectations and rules are fixed before run.
 * node --import tsx scripts/simulateEditorialClarity.ts [output.json]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadAffinityBundle,
  rankEditorialProfiles,
} from "../server/ai/editorialAffinity/bundle";
import { editorialCatalogProfiles } from "../server/ai/editorialAffinity/catalogProfiles";
import { affinityHash } from "../server/ai/editorialAffinity/contracts";
import {
  EmbeddingEngineError,
  type EmbeddingInputEvidence,
} from "../server/ai/editorialAffinity/embeddingEngine";

type Level = "clear" | "indicative" | "unidentified";
type Value = { id: string; texts: string[]; maxLevel?: "indicative" };
type Aspect = { id: string; values: Value[] };
const neutral = (texts: string[]): Value => ({ id: "unspecified", texts });
const aspects: Aspect[] = [
  {
    id: "comparison",
    values: [
      {
        id: "requested",
        texts: [
          "Quero contrastar duas alternativas e entender as diferenças entre elas.",
          "Mostre as semelhanças e diferenças entre duas opções.",
          "Apresente um confronto entre as características de duas possibilidades.",
        ],
      },
      {
        id: "forbidden",
        texts: [
          "Não quero comparar alternativas. Trate somente de uma delas.",
          "Evite comparações e não coloque uma opção contra outra.",
          "Nenhum confronto entre produtos: analise apenas um produto isoladamente.",
        ],
      },
      {
        id: "suggested",
        maxLevel: "indicative",
        texts: [
          "Quem sabe comparar duas opções seja interessante; isso ainda é uma possibilidade.",
          "Penso em uma comparação, mas aceito outro caminho e ainda não decidi.",
          "Estou cogitando contrastar alternativas, sem definir a abordagem por enquanto.",
        ],
      },
      neutral([
        "Quero criar uma publicação sobre um assunto.",
        "Tenho um produto como tema e preciso de uma ideia de conteúdo.",
        "Gostaria de compartilhar algo relacionado a esse tema.",
      ]),
    ],
  },
  {
    id: "critical_angle",
    values: [
      {
        id: "requested",
        texts: [
          "Quero conhecer limitações, problemas e desvantagens de um produto.",
          "Faça uma avaliação dos defeitos e riscos de uma opção.",
          "Mostre o que pode decepcionar e quais pontos merecem atenção.",
        ],
      },
      {
        id: "forbidden",
        texts: [
          "Não aborde defeitos nem problemas; foque somente nos benefícios.",
          "Evite destacar limitações e apresente exclusivamente os pontos positivos.",
          "Não quero uma análise negativa ou crítica das desvantagens.",
        ],
      },
      neutral([
        "Quero apresentar um assunto em uma publicação.",
        "Preciso de um conteúdo a respeito de um produto.",
        "Vamos compartilhar informações sobre esse tema.",
      ]),
    ],
  },
  {
    id: "list",
    values: [
      {
        id: "requested",
        texts: [
          "Organize o conteúdo em uma lista de itens separados.",
          "Enumere os aspectos em tópicos independentes.",
          "Apresente uma relação de pontos, um item por vez.",
        ],
      },
      {
        id: "forbidden",
        texts: [
          "Escreva em texto corrido, sem lista nem tópicos.",
          "Evite enumerar itens ou usar marcadores; prefiro parágrafos contínuos.",
          "Não apresente o conteúdo como uma relação de pontos separados.",
        ],
      },
      neutral([
        "Preciso de uma publicação sobre um assunto.",
        "Quero comunicar uma ideia relacionada a este tema.",
        "Gostaria de abordar as características de um produto.",
      ]),
    ],
  },
  {
    id: "steps",
    values: [
      {
        id: "requested",
        texts: [
          "Ensine como realizar uma tarefa passo a passo, em ordem.",
          "Apresente um tutorial com etapas sucessivas para executar a atividade.",
          "Explique o procedimento em uma sequência de ações do começo ao fim.",
        ],
      },
      {
        id: "forbidden",
        texts: [
          "Não apresente um tutorial nem uma sequência de etapas.",
          "Evite passo a passo; quero apenas uma visão geral do assunto.",
          "Não ensine o procedimento de execução, apenas apresente a ideia.",
        ],
      },
      neutral([
        "Quero falar de um tema em uma publicação.",
        "Preciso de ideias para apresentar um produto.",
        "Compartilhe informações a respeito desse assunto.",
      ]),
    ],
  },
  {
    id: "tone",
    values: [
      {
        id: "formal",
        texts: [
          "Use um tom formal e institucional na redação.",
          "Quero linguagem séria, profissional e sem informalidade.",
          "Escreva com sobriedade e registro formal.",
        ],
      },
      {
        id: "playful",
        texts: [
          "Escreva de forma divertida, com humor e descontração.",
          "Use linguagem brincalhona e um tom bem-humorado.",
          "Quero uma comunicação leve, engraçada e informal.",
        ],
      },
      {
        id: "empathetic",
        texts: [
          "Adote um tom acolhedor, sensível e empático.",
          "Escreva com cuidado e compreensão pelos sentimentos do público.",
          "Quero uma mensagem humana, reconfortante e delicada.",
        ],
      },
      neutral([
        "Quero uma publicação a respeito de um assunto.",
        "Preciso de conteúdo sobre um produto.",
        "Apresente informações relacionadas a esse tema.",
      ]),
    ],
  },
  {
    id: "audience",
    values: [
      {
        id: "beginners",
        texts: [
          "O conteúdo é para pessoas iniciantes que ainda não conhecem o assunto.",
          "Escreva para quem está começando e precisa de uma introdução simples.",
          "Quero orientar pessoas sem experiência prévia neste tema.",
        ],
      },
      {
        id: "experts",
        texts: [
          "O público é composto por especialistas experientes no assunto.",
          "Escreva para profissionais avançados que já dominam o tema.",
          "Quero conteúdo dirigido a um público técnico e especializado.",
        ],
      },
      neutral([
        "Quero falar sobre um tema em uma publicação.",
        "Preciso compartilhar informações a respeito de um produto.",
        "Gostaria de criar conteúdo relacionado a esse assunto.",
      ]),
    ],
  },
];

type Expected = {
  value: string;
  level: "clear" | "indicative";
  evidence: string;
};
type Case = {
  id: string;
  prompt: string;
  group: string;
  expected: Record<string, Expected>;
};
type Detection = {
  aspect: string;
  value: string | null;
  level: Level;
  relativeMargin: number;
  rawMargin: number;
  reason:
    | "reference_not_separable"
    | "neutral_reference"
    | "small_margin"
    | "recognized";
  scores: { id: string; score: number; maxLevel?: "indicative" }[];
  evidenceQuote: null;
  evidenceNote: string;
};
type Observation = Case &
  (
    | {
        status: "scored";
        input: EmbeddingInputEvidence;
        detected: Detection[];
        partialPolicy: {
          constraints: string[];
          positiveSignals: {
            aspect: string;
            value: string | null;
            strength: Level;
          }[];
          unspecifiedAspects: string[];
          unavailableAspects: string[];
          unspecifiedContribution: number;
          excludedFamilies: string[];
          explanation: string;
        };
        currentRawRanking: ReturnType<typeof rankEditorialProfiles>;
        candidateCount: number;
      }
    | {
        status: "technical_rejection";
        reason: string;
        detected: [];
        currentRawRanking: [];
      }
  );
const clear = (value: string, evidence: string): Expected => ({
  value,
  level: "clear",
  evidence,
});
const possible = (value: string, evidence: string): Expected => ({
  value,
  level: "indicative",
  evidence,
});
const prefix =
  "Estou preparando um conteúdo automotivo e reuni anotações sobre os carros X e Y. As anotações mencionam consumo, espaço interno, manutenção, acabamento, equipamentos, conforto, preço e disponibilidade. Essas palavras são apenas o contexto que tenho em mãos; ainda não forneci dados técnicos verificados para sustentar afirmações sobre os veículos. O material também reúne opiniões de pessoas diferentes e observações feitas em momentos distintos. Não trate essa variedade de anotações como uma escolha automática de estrutura, público ou tom. A decisão editorial deste pedido está na frase final, que deve orientar a leitura do restante. ";
const cases: Case[] = [
  {
    id: "short_compare",
    group: "comparison",
    prompt: "Compare o carro X com o carro Y, lado a lado.",
    expected: { comparison: clear("requested", "Compare") },
  },
  {
    id: "short_critical",
    group: "critical",
    prompt: "Quais os pontos negativos do carro X?",
    expected: {
      critical_angle: clear("requested", "pontos negativos"),
      list: possible("requested", "pontos"),
    },
  },
  {
    id: "list_critical",
    group: "critical",
    prompt: "Liste os pontos negativos do carro X.",
    expected: {
      critical_angle: clear("requested", "pontos negativos"),
      list: clear("requested", "Liste"),
    },
  },
  {
    id: "list_no_compare",
    group: "negation",
    prompt:
      "Liste os pontos negativos do carro X. Não compare com outros carros.",
    expected: {
      critical_angle: clear("requested", "pontos negativos"),
      list: clear("requested", "Liste"),
      comparison: clear("forbidden", "Não compare"),
    },
  },
  {
    id: "compare_critical",
    group: "comparison",
    prompt: "Compare os pontos negativos do carro X e do carro Y.",
    expected: {
      critical_angle: clear("requested", "pontos negativos"),
      comparison: clear("requested", "Compare"),
      list: possible("requested", "pontos"),
    },
  },
  {
    id: "explain_no_compare",
    group: "negation",
    prompt:
      "Não compare os carros X e Y; explique apenas os pontos negativos do carro X.",
    expected: {
      critical_angle: clear("requested", "pontos negativos"),
      comparison: clear("forbidden", "Não compare"),
      list: possible("requested", "pontos"),
    },
  },
  { id: "topic_only", group: "open", prompt: "Carro X.", expected: {} },
  {
    id: "vague",
    group: "open",
    prompt: "Faça algo interessante.",
    expected: {},
  },
  {
    id: "first_car",
    group: "audience",
    prompt:
      "Crie um post sobre o carro X para quem vai comprar o primeiro carro.",
    expected: {
      audience: clear("beginners", "quem vai comprar o primeiro carro"),
    },
  },
  {
    id: "beginner",
    group: "audience",
    prompt: "Carro X para iniciantes: quero linguagem simples.",
    expected: { audience: clear("beginners", "para iniciantes") },
  },
  {
    id: "paraphrase_compare",
    group: "comparison",
    prompt: "Mostre em que o carro X e o carro Y diferem e o que têm em comum.",
    expected: {
      comparison: clear("requested", "diferem e o que têm em comum"),
    },
  },
  {
    id: "tentative_compare",
    group: "tentative",
    prompt:
      "Talvez uma comparação entre X e Y ajude, mas ainda não decidi o recorte.",
    expected: { comparison: possible("requested", "Talvez uma comparação") },
  },
  {
    id: "long_compare",
    group: "long_tail",
    prompt:
      prefix +
      "Compare os carros X e Y, lado a lado, destacando vantagens e limitações.",
    expected: {
      comparison: clear("requested", "Compare"),
      critical_angle: clear("requested", "limitações"),
      list: possible("requested", "vantagens e limitações"),
    },
  },
  {
    id: "long_no_compare",
    group: "long_tail",
    prompt:
      prefix +
      "Não compare os carros X e Y. Liste apenas os pontos negativos do carro X.",
    expected: {
      comparison: clear("forbidden", "Não compare"),
      list: clear("requested", "Liste"),
      critical_angle: clear("requested", "pontos negativos"),
    },
  },
  {
    id: "phone_compare",
    group: "same_treatment",
    prompt: "Compare o celular A com o celular B.",
    expected: { comparison: clear("requested", "Compare") },
  },
  {
    id: "courses_compare",
    group: "same_treatment",
    prompt:
      "Mostre as diferenças entre estudar presencialmente e estudar a distância.",
    expected: { comparison: clear("requested", "diferenças entre") },
  },
  {
    id: "formal",
    group: "tone",
    prompt: "Apresente o carro X em tom formal e institucional.",
    expected: { tone: clear("formal", "tom formal e institucional") },
  },
  {
    id: "playful",
    group: "tone",
    prompt: "Fale do carro X com humor e descontração.",
    expected: { tone: clear("playful", "humor e descontração") },
  },
  {
    id: "empathetic",
    group: "tone",
    prompt:
      "Fale sobre perder o primeiro carro em um tom acolhedor e empático.",
    expected: { tone: clear("empathetic", "tom acolhedor e empático") },
  },
  {
    id: "expert",
    group: "audience",
    prompt:
      "Explique a manutenção do carro X para mecânicos especialistas e experientes.",
    expected: {
      audience: clear("experts", "mecânicos especialistas e experientes"),
    },
  },
  {
    id: "steps",
    group: "structure",
    prompt: "Ensine passo a passo como verificar os pneus do carro X.",
    expected: {
      steps: clear("requested", "passo a passo"),
      list: possible("requested", "passo a passo"),
    },
  },
  {
    id: "no_list",
    group: "negation",
    prompt:
      "Explique os pontos negativos do carro X em texto corrido, sem listas.",
    expected: {
      critical_angle: clear("requested", "pontos negativos"),
      list: clear("forbidden", "sem listas"),
    },
  },
  {
    id: "no_negative",
    group: "negation",
    prompt:
      "Não fale dos pontos negativos do carro X. Destaque apenas seus benefícios.",
    expected: {
      critical_angle: clear("forbidden", "Não fale dos pontos negativos"),
    },
  },
  {
    id: "quoted",
    group: "quotation",
    prompt:
      'Um cliente comentou "compare o carro X e o carro Y". Meu pedido agora é apenas anunciar a chegada do carro X à loja.',
    expected: {},
  },
];

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};
function center(vectors: Float32Array[]) {
  const v = new Float32Array(vectors[0].length);
  for (const sample of vectors)
    for (let i = 0; i < v.length; i++) v[i] += sample[i] / vectors.length;
  const norm = Math.hypot(...Array.from(v));
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const rules = {
  clearRelativeMargin: 0.75,
  indicativeRelativeMargin: 0.25,
  neutralValue: "unspecified",
  familyCutoffs: false,
};

async function simulate(model: "minilm" | "e5") {
  const { bundle, engine } = await loadAffinityBundle(
    resolve(`.postspark-local/editorial-affinity/${model}`)
  );
  try {
    // Symmetric classification queries use the same prefix on both sides; the
    // frozen family retrieval bundle retains its original fingerprint separately.
    const anchorTexts = aspects.flatMap(a => a.values.flatMap(v => v.texts));
    const anchors = await engine.embed(anchorTexts, {
      kind: "query",
      overflow: "reject",
    });
    let cursor = 0;
    const classifiers = aspects.map(aspect => {
      const values = aspect.values.map(value => {
        const samples = anchors.vectors.slice(
          cursor,
          cursor + value.texts.length
        );
        cursor += value.texts.length;
        return { ...value, samples, centroid: center(samples) };
      });
      const calibration = values.flatMap(value =>
        value.samples.map((sample, i) => {
          const own = dot(
            sample,
            center(value.samples.filter((_, j) => i !== j))
          );
          const rival = Math.max(
            ...values
              .filter(v => v.id !== value.id)
              .map(v => dot(sample, v.centroid))
          );
          return { value: value.id, margin: own - rival };
        })
      );
      const scale = median(
        calibration.filter(v => v.value !== "unspecified").map(v => v.margin)
      );
      return { id: aspect.id, values, scale, calibration };
    });
    const observations: Observation[] = [];
    for (const item of cases) {
      try {
        const embedded = await engine.embed([item.prompt], {
          kind: "query",
          overflow: "reject",
        });
        const vector = embedded.vectors[0];
        const detected: Detection[] = classifiers.map(classifier => {
          const scores = classifier.values
            .map(value => ({
              id: value.id,
              score: dot(vector, value.centroid),
              maxLevel: value.maxLevel,
            }))
            .sort((a, b) => b.score - a.score);
          const margin = scores[0].score - scores[1].score;
          const relativeMargin =
            classifier.scale > 0 ? margin / classifier.scale : 0;
          let level: Level =
            scores[0].id === "unspecified"
              ? "unidentified"
              : relativeMargin >= rules.clearRelativeMargin
                ? "clear"
                : relativeMargin >= rules.indicativeRelativeMargin
                  ? "indicative"
                  : "unidentified";
          if (scores[0].maxLevel === "indicative" && level === "clear")
            level = "indicative";
          const winner =
            scores[0].id === "suggested" ? "requested" : scores[0].id;
          const reason =
            classifier.scale <= 0
              ? "reference_not_separable"
              : scores[0].id === "unspecified"
                ? "neutral_reference"
                : level === "unidentified"
                  ? "small_margin"
                  : "recognized";
          return {
            aspect: classifier.id,
            value: level === "unidentified" ? null : winner,
            level,
            relativeMargin,
            rawMargin: margin,
            reason,
            scores,
            evidenceQuote: null,
            evidenceNote:
              "Embedding output does not locate a supporting span; quotes below belong only to expected labels.",
          };
        });
        const baseline = rankEditorialProfiles(
          vector,
          bundle,
          editorialCatalogProfiles
        );
        observations.push({
          ...item,
          status: "scored",
          input: embedded.inputs[0],
          detected,
          partialPolicy: {
            constraints: detected
              .filter(
                d => d.level !== "unidentified" && d.value === "forbidden"
              )
              .map(d => d.aspect),
            positiveSignals: detected
              .filter(
                d => d.level !== "unidentified" && d.value !== "forbidden"
              )
              .map(d => ({
                aspect: d.aspect,
                value: d.value,
                strength: d.level,
              })),
            unspecifiedAspects: detected
              .filter(
                d =>
                  d.level === "unidentified" &&
                  d.reason !== "reference_not_separable"
              )
              .map(d => d.aspect),
            unavailableAspects: detected
              .filter(d => d.reason === "reference_not_separable")
              .map(d => d.aspect),
            unspecifiedContribution: 0,
            excludedFamilies: [],
            explanation:
              "Policy projection only: unspecified aspects add no penalty; no production ranking is modified.",
          },
          currentRawRanking: baseline.slice(0, 5),
          candidateCount: baseline.length,
        });
      } catch (error) {
        observations.push({
          ...item,
          status: "technical_rejection",
          reason:
            error instanceof EmbeddingEngineError ? error.code : "unknown",
          detected: [],
          currentRawRanking: [],
        });
      }
    }
    let clearExpected = 0,
      recognizedClearExpected = 0,
      fullyClear = 0,
      openAspects = 0,
      openOverclaims = 0,
      openClearOverclaims = 0,
      forbiddenExpected = 0,
      reversedForbiddens = 0,
      tentativeOverclaims = 0;
    let unavailableClearExpected = 0,
      unavailableOpenAspects = 0,
      polarityErrors = 0;
    const failures = [];
    for (const row of observations) {
      if (row.status !== "scored") continue;
      for (const detection of row.detected) {
        const expected = row.expected[detection.aspect];
        if (expected?.level === "clear") {
          clearExpected++;
          if (detection.reason === "reference_not_separable")
            unavailableClearExpected++;
          if (
            (expected.value === "requested" &&
              detection.value === "forbidden") ||
            (expected.value === "forbidden" && detection.value === "requested")
          )
            polarityErrors++;
          if (
            detection.value === expected.value &&
            detection.level !== "unidentified"
          )
            recognizedClearExpected++;
          else
            failures.push({
              caseId: row.id,
              aspect: detection.aspect,
              kind: "missed_or_wrong_explicit",
              expected,
              actual: detection,
            });
          if (detection.value === expected.value && detection.level === "clear")
            fullyClear++;
          if (expected.value === "forbidden") {
            forbiddenExpected++;
            if (detection.value === "requested") reversedForbiddens++;
          }
        } else if (expected?.level === "indicative") {
          if (detection.level === "clear") {
            tentativeOverclaims++;
            failures.push({
              caseId: row.id,
              aspect: detection.aspect,
              kind: "overstated_possible",
              expected,
              actual: detection,
            });
          }
        } else {
          openAspects++;
          if (detection.reason === "reference_not_separable")
            unavailableOpenAspects++;
          if (detection.level !== "unidentified") {
            openOverclaims++;
            failures.push({
              caseId: row.id,
              aspect: detection.aspect,
              kind: "filled_unspecified",
              actual: detection,
            });
          }
          if (detection.level === "clear") openClearOverclaims++;
        }
      }
    }
    const checks = [
      ["short_compare", "paraphrase_compare", "comparison"],
      ["short_compare", "tentative_compare", "comparison"],
      ["short_compare", "explain_no_compare", "comparison"],
      ["long_compare", "long_no_compare", "comparison"],
      ["short_critical", "no_negative", "critical_angle"],
      ["short_compare", "phone_compare", "comparison"],
    ].map(([leftId, rightId, aspect]) => {
      const left = observations.find(o => o.id === leftId)!,
        right = observations.find(o => o.id === rightId)!;
      return {
        leftId,
        rightId,
        aspect,
        leftStatus: left.status,
        rightStatus: right.status,
        left: left.detected.find(d => d.aspect === aspect) ?? null,
        right: right.detected.find(d => d.aspect === aspect) ?? null,
      };
    });
    return {
      model,
      modelMetadata: engine.metadata,
      familyBundleHash: bundle.hash,
      calibration: classifiers.map(c => ({
        aspect: c.id,
        referenceScale: c.scale,
        available: c.scale > 0,
        leaveOneOut: c.calibration,
      })),
      metrics: {
        cases: observations.length,
        scored: observations.filter(o => o.status === "scored").length,
        technicalRejections: observations
          .filter(o => o.status !== "scored")
          .map(o => ({ id: o.id, reason: "reason" in o ? o.reason : null })),
        clearExpectedOnScoredInputs: clearExpected,
        recognizedClearExpected,
        fullyClear,
        openAspectsOnScoredInputs: openAspects,
        openOverclaims,
        openClearOverclaims,
        forbiddenExpected,
        reversedForbiddens,
        tentativeOverclaims,
        unavailableClearExpected,
        unavailableOpenAspects,
        polarityErrors,
        clearExpectedOnAvailableAspects:
          clearExpected - unavailableClearExpected,
        openExpectedOnAvailableAspects: openAspects - unavailableOpenAspects,
      },
      checks,
      failures,
      observations,
    };
  } finally {
    await engine.dispose();
  }
}

async function main() {
  const output = resolve(
    process.argv[2] ?? "artifacts/editorial-affinity/clarity-simulation.json"
  );
  // Freeze references, expectations and heuristic BEFORE any observations.
  const plan = { version: 1, aspects, cases, rules };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output.replace(/\.json$/, "") + "-plan.json",
    JSON.stringify({ ...plan, hash: affinityHash(plan) }, null, 2) + "\n"
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network is forbidden in this offline simulation");
  };
  try {
    const models = [];
    for (const model of ["minilm", "e5"] as const)
      models.push(await simulate(model));
    const report = {
      version: 1,
      planHash: affinityHash(plan),
      measuredAt: new Date().toISOString(),
      productionChanged: false,
      labels: "engineering_expectations_not_human_validated",
      scope: "experimental_partial_clarity_with_real_local_embeddings",
      notes: [
        "Clarity levels use unvalidated reference-relative cosine margins, not calibrated probabilities.",
        "Rules and examples were frozen before inference; no threshold tuning on these cases.",
        "Absent aspects are neutral. The experiment records wrong inferences instead of deleting difficult cases.",
        "Model token-limit rejection is technical, not a semantic judgement of the prompt.",
        "Nonpositive reference scales disable an aspect. Those abstentions are a limitation of this experimental reference classifier, not successful detection of missing user intent.",
        "Aggregates include different token coverage and available aspects across models; they must not be treated as a comparative accuracy benchmark.",
        "Family lists are the existing raw offline ranking across annotated repertoires, not a production choice or a ranking adjusted by clarity.",
        "Expected evidence quotes are annotations. The embedding classifier does not extract quotes or fully understand instructions.",
      ],
      rules,
      models,
    };
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(
      JSON.stringify(
        {
          output,
          models: models.map(m => ({ model: m.model, metrics: m.metrics })),
        },
        null,
        2
      ) + "\n"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    process.stderr.write(
      String(error instanceof Error ? error.message : error) + "\n"
    );
    process.exitCode = 1;
  });
}
