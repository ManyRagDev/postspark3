import { resolveReviewExecutionConfigV7 } from "../server/ai/workflows/reviewExecutionConfigV7";
import { editorialContextV7 } from "../server/ai/workflows/editorialContextV7";
import { healthyReviewV7Fixture } from "../server/ai/workflows/proposalReviewV7.fixture";
/** Local integration check: real font metrics + CanvasPostStage Chromium, no paid APIs. */
import { mkdir, writeFile } from "node:fs/promises";
import { completeDesignTestDefinitions } from "../shared/completeDesignGeneration.fixture";
import { executeProposalWorkflow } from "../server/ai/workflows/proposalGraph";
import {
  renderReviewScenes,
  closeReviewRenderer,
} from "../server/ai/workflows/proposalRenderer";
import { arsenalHash } from "../shared/arsenalContent";
import { invokeLLM } from "../server/_core/llm";
const liveReview = process.argv.includes("--live-review");
const output =
  process.argv.slice(2).find(arg => !arg.startsWith("--")) ??
  "/tmp/postspark-renderer-check";
await mkdir(output, { recursive: true });
const definition = completeDesignTestDefinitions()[0];
const captures: Array<{
  slideIndex: number;
  hash: string;
  width: number;
  height: number;
}> = [];
try {
  const result = await executeProposalWorkflow(
    {
      requestId: "00000000-0000-4000-8000-000000000002",
      reviewPolicyVersion: 7,
      reviewExecutionConfig: resolveReviewExecutionConfigV7(),
      editorialContextHash: editorialContextV7({prompt:"Café Horizonte: café coado na hora, de segunda a sexta, das 8h às 18h; convite para conhecer a cafeteria; sem prometer descontos ou menor preço."}).hash,
      runId: "00000000-0000-4000-8000-000000000002",
      proposalId: "renderer-check-1",
      slot: 0,
      selectedDefinitions: [definition, definition, definition],
      postMode: "carousel",
      prompt: "Café Horizonte: café coado na hora, de segunda a sexta, das 8h às 18h; convite para conhecer a cafeteria; sem prometer descontos ou menor preço.",
      deadlineMs: Date.now() + 60_000,
    },
    {
      actor: "00000000-0000-4000-8000-000000000001",
      generateText: async params => {
        if(liveReview && params.taskRoute === "post_evaluation") return invokeLLM(params);
        const result = {choices:[{message:{content:JSON.stringify(params.taskRoute==="post_evaluation" ? {
          outcome:"reviewed",reviewedSlides:[0,1,2],findings:[],limitation:"",
        } : {
          caption:"Café Horizonte",hashtags:["#cafe"],
          slides:["Café Horizonte","Coado na hora","Venha conhecer"].map((text,i)=>({
            values:[{fieldId:"field-0",value:text},{fieldId:"field-1",value:["Café coado na hora.","De segunda a sexta.","Das 8h às 18h."][i]}],mediaPrompts:[],
          })),
        })}}]} as any;
        if(params.taskRoute === "post_evaluation") return {choices:[{message:{content:JSON.stringify(healthyReviewV7Fixture(params))}}]} as any;
        return result;

      },
      renderReviewScenes: async input => {
        const scenes = await renderReviewScenes(input).catch(error => {
          console.error(error);
          throw error;
        });
        const repeated = await renderReviewScenes(input);
        if (
          scenes.some(
            (scene, i) =>
              arsenalHash(scene.dataUri) !== arsenalHash(repeated[i].dataUri)
          )
        )
          throw new Error(
            "Fresh browser contexts rendered different scene bytes"
          );
        for (const scene of scenes) {
          await writeFile(
            `${output}/slide-${scene.slideIndex}.png`,
            Buffer.from(scene.dataUri.split(",")[1], "base64")
          );
          captures.push({
            slideIndex: scene.slideIndex,
            hash: arsenalHash(scene.dataUri),
            width: scene.width,
            height: scene.height,
          });
        }
        return scenes;
      },
    }
  );
  console.log(
    JSON.stringify({
      status: result.status,
      reason: result.errorReason,
      diagnostics: result.diagnostics,
      captures,
      reviews: result.reviews?.map(r => ({
        policyVersion: r.policyVersion,
        status: r.status,
        slides: r.reviewedSlides,
      })),
    })
  );
  if (
    result.status !== "ready" ||
    captures.length !== 3 ||
    new Set(captures.map(c => c.hash)).size !== 3
  )
    process.exitCode = 1;
} finally {
  await closeReviewRenderer();
}
