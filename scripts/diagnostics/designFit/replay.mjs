import assert from "node:assert/strict";
import { componentCardV1Schema } from "../../../shared/componentAssembly.ts";
import { buildFamilySelectionCandidates } from "../../../shared/designFamilySelection.ts";
import {
  resolveDesignFamilyRepertoires,
  materializeDesignFamilyOffer,
} from "../../../shared/designRepertoire.ts";
import { repertoireMeetsMedia } from "../../../shared/generationPlan.ts";
import { proposalSelectionHistory } from "../../../shared/familyNeutrality.ts";
import {
  buildHeuristicGenerationPlan,
  deliveryProposalReserves,
} from "../../../server/ai/workflows/heuristicPlanBuilder.ts";
import { retrieveFamilyCandidates } from "../../../server/designCatalog/familyRetrieval.ts";
import { arsenalHash } from "../../../shared/arsenalContent.ts";
import { runs, save, profiles, hash } from "./inputs.mjs";
import { pathToFileURL } from "node:url";

export function prepare(run, request = run.r.input.content) {
  const { r, op } = run;
  const { planning, imageObligation, selectedDefinitions } = r.prepared;
  const slideCount = selectedDefinitions[0].length;
  const cards = op["prepare:catalog"].cards.map(c =>
    componentCardV1Schema.parse(c)
  );
  const eligible = resolveDesignFamilyRepertoires(cards, {
    slideCount,
    contentMode: "compose",
    instructions: request,
  }).filter(rep => repertoireMeetsMedia(rep, imageObligation));
  const families = buildFamilySelectionCandidates(
    eligible,
    planning.editorialCatalog,
    true,
    true
  );
  const history = op["prepare:recent_selections"];
  const shortlist = { evaluated: planning.ranking };
  const input = {
    intent: planning.intent,
    slideCount,
    imageObligation,
    familyFirst: true,
    shortlist,
    neutrality: op["prepare:selection_input"].familyNeutrality,
    recentSelections: proposalSelectionHistory(
      history.selections,
      history.parentSelection
    ),
    eligible: eligible.filter(rep =>
      planning.selectorIds.includes(rep.defaultOffer.offerId)
    ),
  };
  return { input, families, eligible };
}
export function elect(input, eligible, reserveInput = input) {
  const observations = [];
  const start = performance.now();
  const { slots } = buildHeuristicGenerationPlan({
    ...input,
    observeDecision: o => observations.push(o),
  });
  const offers = slots.map(slot =>
    slot.status === "viable"
      ? materializeDesignFamilyOffer(
          input.eligible.find(
            rep => rep.defaultOffer.offerId === slot.candidateId
          ),
          slot.pages.map(page => page.componentId)
        )
      : null
  );
  const reserves = deliveryProposalReserves(
    { ...reserveInput, eligible },
    offers
  );
  return {
    slots,
    offers,
    reserves,
    observations,
    ms: performance.now() - start,
  };
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const controls = await Promise.all(
    runs.map(async run => {
      const { r, op, jev, round } = run;
      const planning = r.prepared.planning;
      const { input, eligible, families } = prepare(run);
      assert.deepEqual(
        families.map(f => [f.id, arsenalHash(f.profile)]),
        planning.familyElection.candidates.map(c => [c.id, c.profileHash])
      );
      const retrieval = op["prepare:family_retrieval"];
      assert.deepEqual(
        await retrieveFamilyCandidates({
          families,
          intent: planning.intent,
          catalog: planning.editorialCatalog,
          neutrality: input.neutrality,
          automaticSemantic: {
            revision: String(r.catalog_revision),
            query: retrieval.query,
            lexicalOnly: true,
          },
        }),
        retrieval
      );
      const result = elect(input, eligible);
      assert.deepEqual(result.slots, planning.slots);
      assert.deepEqual(result.slots, buildHeuristicGenerationPlan(input).slots);
      assert.deepEqual(result.reserves, planning.deliveryReserves);
      assert.deepEqual(
        result.offers.map(o => o.slides.map(s => s.componentHash)),
        r.prepared.selectedDefinitions.map(ds => ds.map(d => d.hash))
      );
      const expected = Object.fromEntries(
        planning.familyElection.ranking.map(row => [
          row.id,
          [row.score, row.confidence],
        ])
      );
      assert.deepEqual(
        Object.fromEntries(
          Object.entries(jev.returned.answers).map(([id, a]) => [
            id,
            [a.score, a.confidence],
          ])
        ),
        expected
      );
      return {
        request: r.id,
        receiptHash: run.receiptHash,
        revision: r.catalog_revision,
        mode: r.input.postMode,
        media: input.imageObligation,
        seed: input.neutrality.seed,
        neutrality: input.neutrality,
        historyHash: hash(input.recentSelections),
        jevHash: jev.trace.promptHash,
        eligible: families.map(f => f.family),
        assessed: Object.keys(expected),
        slots: result.offers.map((o, i) => ({
          initial: o.family,
          pages: o.slides.map(s => [s.componentId, s.componentHash]),
          reserves: result.reserves[i].map(o => o.family),
          used: run.ops
            .filter(
              x =>
                x.operation_key.startsWith(
                  r.proposals[i].proposalId + ":delivery_recovery:"
                ) && x.result?.plan
            )
            .map(x => x.result.plan.pages[0].componentId),
          delivered: r.proposals[i].bundle?.family ?? null,
        })),
        calls: round.calls.length,
      };
    })
  );
  save("controle", controls);
  save("fichas", Object.fromEntries(profiles));
  console.log(controls.length, "pedidos verificados");
}
