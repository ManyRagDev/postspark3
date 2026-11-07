/** Opt-in captured carousel-v2 replay. Private artifacts/fonts are deliberately
 * absent from clean checkouts; explicit opt-in fails if any evidence is missing. */
import { describe, expect, it, vi } from "vitest";
import { readAutomaticReviewReplayFixture, replayAutomaticReviewFixture } from "../../../scripts/acervo82/full/automaticReviewReplay";

describe("captured automatic review replay",()=>{
  it.runIf(process.env.POSTSPARK_CAPTURED_REVIEW_REPLAY === "1")("repairs only the positive idea/requirement namespace confusion and retains factual and completeness vetoes",async()=>{
    const external=vi.spyOn(globalThis,"fetch").mockImplementation(async()=>{throw new Error("offline_replay_blocks_network");});
    try {
      const proof=replayAutomaticReviewFixture(await readAutomaticReviewReplayFixture());
      expect(proof.results).toHaveLength(2);
      for(const review of proof.results){
        expect(review.original.status).toBe("rejected");
        expect(review.normalized.status).toBe("passed");
        expect(review.discardedFields).toHaveLength(3);
        expect(review.negativeFactualControl.status).toBe("correction_required");
        expect(review.missingUnitControl.status).not.toBe("passed");
      }
      expect(proof.unchangedReadySiblings.map(s=>s.status)).toEqual(["ready","ready"]);
      expect(proof).toMatchObject({copyUnchanged:true,artworkUnchanged:true,inputArtifactsUnchanged:true,externalCalls:0,databaseUpdates:0,originalSlotStatus:"failed"});
      expect(external).not.toHaveBeenCalled();
    } finally {external.mockRestore();}
  });
});
