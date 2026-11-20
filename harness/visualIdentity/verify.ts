import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { arsenalHash } from "../../shared/arsenalContent";
import { identityFixture } from "../../shared/visualIdentity.fixture";
import { orchestratedGenerationInputSchema } from "../../shared/generationRequest";
import { INITIAL_POST } from "../../client/src/pages/CanvasLab/components/types";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "../../client/src/pages/CanvasLab/lib/saveAdapter";
import {
  putArsenalComposition,
  editArsenalContent,
} from "../../client/src/pages/CanvasLab/lib/arsenalComposition";
import { generateIdentityCanvas } from "../../server/ai/workflows/identityCanvas";
import {
  renderReviewScenes,
  closeReviewRenderer,
} from "../../server/ai/workflows/proposalRenderer";

const output =
  process.env.IDENTITY_VERIFY_OUTPUT ?? "/tmp/postspark-identity-verification";
await mkdir(output, { recursive: true });
const owner = "11111111-1111-4111-8111-111111111111";
const pages = [
  "Seu conteúdo, sua marca.\nVocê já sabe o que quer dizer. O PostSpark organiza a apresentação com a sua identidade visual.",
  "Do roteiro para a arte.\nTextos preservados, elementos editáveis e espaço para criar com liberdade.",
];
const input = orchestratedGenerationInputSchema.parse({
  ownerId: owner,
  inputType: "text",
  content: pages.join("\n"),
  platform: "instagram",
  postMode: "carousel",
  slideCount: 2,
  aspectRatio: "4:5",
  projectId: owner,
  fixedDesign: { kind: "identity", id: owner },
  idempotencyKey: "visual-identity-verification",
  creationMode: "execution",
  executionBrief: {
    creationMode: "execution",
    platform: "instagram",
    format: "carousel",
    rawInput: pages.join("\n"),
    contentSourceType: "carousel_slides",
    interventionLevel: "visual_only",
    slides: pages.map((rawText, i) => ({ slideNumber: i + 1, rawText })),
  },
});
const canvas = structuredClone(INITIAL_POST);
const identity = identityFixture({
  background: "#FAF6EF",
  text: "#181818",
  accent: "#E85D04",
  headingFont: "Montserrat",
  margin: 84,
  gap: 36,
});
const pin = {
  sourceId: "controlled-identity",
  revision: arsenalHash(canvas),
  canvas,
  identity,
};
const plan = {
  background: "#FFFFFF",
  text: "#111111",
  accent: "#226633",
  headingFont: "Inter",
  bodyFont: "Inter",
  margin: 64,
  gap: 32,
  align: "left",
  pages: [
    { layout: "stacked", decoration: "line" },
    { layout: "centered", decoration: "none" },
  ],
};
const hash = (value: string) =>
  createHash("sha256")
    .update(Buffer.from(value.split(",")[1], "base64"))
    .digest("hex");
let calls = 0;
const db = new PGlite();
try {
  // Controlled provider response; font measurement, renderer, editing and JSONB roundtrip are real.
  const post = await generateIdentityCanvas({
    pin,
    input,
    owner,
    runId: "controlled-identity-journey",
    source: input.content,
    signal: new AbortController().signal,
    deadline: Date.now() + 180000,
    operation: async (_key, work) => work(),
    generate: (async () => {
      calls++;
      return { choices: [{ message: { content: JSON.stringify(plan) } }] };
    }) as any,
  });
  const scenes = await renderReviewScenes({
    compositions: post.slides.map(s => s.composition!),
    definitions: [],
    actor: owner,
  });
  for (const [i, scene] of Array.from(scenes.entries()))
    await writeFile(
      `${output}/original-${i + 1}.png`,
      Buffer.from(scene.dataUri.split(",")[1], "base64")
    );
  const scene = post.slides[0].composition!;
  const edited = putArsenalComposition(
    post,
    editArsenalContent(scene, {
      ...scene.content,
      headline: "Sua marca, seu jeito.",
    })
  );
  const payload = canvasModelToSavePayload(edited, {
    inputType: "text",
    inputContent: input.content,
  });
  await db.exec(
    "CREATE TABLE posts(id int PRIMARY KEY, canvas_model jsonb NOT NULL);"
  );
  await db.query("INSERT INTO posts VALUES (1,$1::jsonb)", [
    JSON.stringify(payload.canvasModel),
  ]);
  const saved = (
    await db.query<{ id: number; canvas_model: any }>(
      "SELECT * FROM posts WHERE id=1"
    )
  ).rows[0];
  const reopened = savedPostToCanvasModel(saved);
  const editedScenes = await renderReviewScenes({
    compositions: edited.slides.map(s => s.composition!),
    definitions: [],
    actor: owner,
  });
  const reopenedScenes = await renderReviewScenes({
    compositions: reopened.slides.map(s => s.composition!),
    definitions: [],
    actor: owner,
  });
  for (const [i, scene] of Array.from(reopenedScenes.entries()))
    await writeFile(
      `${output}/reopened-${i + 1}.png`,
      Buffer.from(scene.dataUri.split(",")[1], "base64")
    );
  const checks = {
    literalSlides: post.slides.every(
      (s, i) =>
        s
          .composition!.elements.filter(e => e.kind === "text")
          .map(e => e.text)
          .join("") === pages[i]
    ),
    requestedColorsApplied:
      post.palette.background === identity.rules.background &&
      post.palette.accent === identity.rules.accent,
    actualFontApplied:
      post.visualIdentityUsage?.appearance.fonts.heading.applied ===
      "Montserrat",
    layoutOnlyInference: calls === 1,
    editChangesPixels:
      hash(scenes[0].dataUri) !== hash(editedScenes[0].dataUri),
    otherSlidePreserved:
      hash(scenes[1].dataUri) === hash(editedScenes[1].dataUri),
    reopenPreservesPixels: editedScenes.every(
      (scene, i) => hash(scene.dataUri) === hash(reopenedScenes[i].dataUri)
    ),
    identitySnapshotPreserved:
      arsenalHash(post.visualIdentityUsage) ===
      arsenalHash(reopened.visualIdentityUsage),
    originalIdentityNotCompleted:
      identity.rules.bodyFont === null && identity.rules.lineHeight === null,
  };
  await writeFile(`${output}/post.json`, JSON.stringify(reopened, null, 2));
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        controlledProvider: true,
        persistence: "PGlite JSONB",
        renderer: "CanvasPostStage/Chromium",
        checks,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ output, checks }));
  if (Object.values(checks).some(value => !value)) process.exitCode = 1;
} finally {
  await closeReviewRenderer();
  await db.close();
}
