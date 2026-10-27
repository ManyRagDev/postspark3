/** Test-only review responses/pixels. They never certify production renderer fidelity. */
import type { RenderReviewScenes } from "./proposalReview";
import type { InvokeResult, InvokeParams } from "../../_core/llm";
import type { ReviewCopy } from "./proposalReview";
import { narrativeCriteria, type NarrativeCheck } from "@shared/proposalReview";

/** Detector claims for unrelated tests only; does not assess story quality. */
export function narrativeChecksFixture(copy: ReviewCopy): NarrativeCheck[] {
  const count = copy.slides.length;
  return narrativeCriteria.map(criterion => {
    const indices =
      criterion === "cover_hook"
        ? [0]
        : criterion === "closing"
          ? [count - 1]
          : criterion === "cohesion"
            ? copy.slides.map((_, i) => i)
            : count === 2
              ? [1]
              : Array.from({ length: count - 2 }, (_, i) => i + 1);
    return {
      criterion,
      status: "met",
      revisionSlides: [],
      instructionQuote: "",
      explanation: "Detector fixture; semantic quality unverified",
      evidence: indices.map(slideIndex => {
        const field = copy.slides[slideIndex].values.find(v =>
          (Array.isArray(v.value) ? v.value.join(" ") : v.value).trim()
        )!;
        return {
          slideIndex,
          fieldId: field.fieldId,
          quote: (Array.isArray(field.value)
            ? field.value[0]
            : field.value
          ).slice(0, 500),
        };
      }),
    };
  });
}

/** Simulates a detector's assertion for tests of other responsibilities. It checks
 * no semantics and must not be used by coverage/omission regression tests. */
export function attachFactCoverageFixture(
  result: InvokeResult,
  params?: InvokeParams
): InvokeResult {
  if (!params || params.taskRoute !== "post_evaluation") return result;
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string") return result;
  const response = JSON.parse(content);
  const texts = params.messages.flatMap(message =>
    typeof message.content === "string"
      ? [message.content]
      : Array.isArray(message.content)
        ? message.content.flatMap(part =>
            typeof part === "object" && part.type === "text" ? [part.text] : []
          )
        : []
  );
  const payload = texts.find(text =>
    text.startsWith("DADOS DO PEDIDO E LIMITES NATIVOS:\n")
  );
  if (!payload) {
    const v5 = texts.find(text => text.startsWith('{"context":') && text.includes('"anchors":'));
    if (!v5) return result;
    const {copy,anchors,narrativeContract}=JSON.parse(v5);
    const facts = copy.editorialPlan?.mode === "compose" ? copy.editorialPlan.facts : [];
    const coverage = facts.map((f:any)=>({factId:f.id,status:"covered",evidenceIds:[(anchors[0].anchorId ?? anchors[0].alias)],missingSourceQuote:"",explanation:"Fixture only; no semantic evaluation",materiality:"essential",materialityReason:"Fixture source fact"}));
    const next = {...response,factCoverage:coverage,sourceCoverage:coverage.map((c:any,i:number)=>({...c,sourceQuote:facts[i].sourceQuote,meaning:facts[i].meaning})),...(narrativeContract?{narrativeChecks:narrativeCriteria.map(criterion=>({criterion,status:"met",revisionSlides:[],instructionQuote:"",explanation:"Fixture only",effect:"advisory",evidenceIds:Array.from(new Map(anchors.map((a:any)=>[a.slideIndex,a])).values()).filter((a:any)=>criterion==="cover_hook"?a.slideIndex===0:criterion==="closing"?a.slideIndex===copy.slides.length-1:true).map((a:any)=>a.anchorId ?? a.alias)}))}:{})};
    return {...result,choices:result.choices.map((choice,index)=>index?choice:{...choice,message:{...choice.message,content:JSON.stringify(next)}})};
  }
  const { copy } = JSON.parse(payload.slice(payload.indexOf("\n") + 1)) as {
    copy: ReviewCopy;
  };
  const factCoverage =
    response.factCoverage ??
    (copy.editorialPlan?.mode !== "compose"
      ? []
      : copy.editorialPlan.facts.map(fact => {
          const slideIndex = copy.editorialPlan!.slides.find(slide =>
            slide.factIds.includes(fact.id)
          )!.slideIndex;
          const field = copy.slides[slideIndex].values.find(row =>
            (Array.isArray(row.value) ? row.value.join("\n") : row.value).trim()
          );
          const quote = field
            ? (Array.isArray(field.value) ? field.value[0] : field.value).slice(
                0,
                500
              )
            : "";
          return {
            factId: fact.id,
            status: quote ? "covered" : "uncertain",
            evidence:
              quote && field
                ? [{ slideIndex, fieldId: field.fieldId, quote }]
                : [],
            missingSourceQuote: "",
            explanation:
              "Detector fixture for an unrelated test; semantic equivalence unverified",
          };
        }));
  const sourceCoverage =
    response.sourceCoverage ??
    factCoverage.map((coverage: any) => {
      const fact = copy.editorialPlan!.facts.find(
        f => f.id === coverage.factId
      )!;
      return {
        ...coverage,
        sourceQuote: fact.sourceQuote,
        meaning: fact.meaning,
      };
    });
  return {
    ...result,
    choices: result.choices.map((choice, index) =>
      index
        ? choice
        : {
            ...choice,
            message: {
              ...choice.message,
              content: JSON.stringify({
                ...response,
                factCoverage,
                sourceCoverage,
                ...(copy.editorialPlan?.version === 2 &&
                !response.narrativeChecks
                  ? { narrativeChecks: narrativeChecksFixture(copy) }
                  : {}),
              }),
            },
          }
    ),
  };
}

export const renderReviewFixtureScenes: RenderReviewScenes = async ({
  compositions,
}) =>
  compositions.map((_composition, slideIndex) => ({
    slideIndex,
    renderer: "CanvasPostStage",
    width: 864,
    height: 1080,
    dataUri: "data:image/png;base64,aW1hZ2U=",
  }));

export function acceptedReviewFixture(
  slideCount = 1,
  params?: InvokeParams
): InvokeResult {
  return attachFactCoverageFixture(
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              outcome: "reviewed",
              reviewedSlides: Array.from(
                { length: slideCount },
                (_, index) => index
              ),
              findings: [],
              limitation: "",
            }),
          },
        },
      ],
    } as InvokeResult,
    params
  );
}
