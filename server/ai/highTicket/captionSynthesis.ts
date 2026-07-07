import type { AngleAssignment } from "@shared/highTicket";
import type { Platform, PostMode, PostVariation } from "@shared/postspark";
import type { ContentStrategy } from "../contentStrategy";
import { synthesizeCaptionsForVariations } from "../captionSynthesis";

function angleToStrategy(angle: AngleAssignment, index: number): ContentStrategy {
  return {
    id: angle.angleId,
    title: angle.title,
    topic: angle.thesis,
    objective: "engage",
    audience: angle.audience,
    angle:
      angle.mechanism === "story"
        ? "story"
        : angle.mechanism === "objection"
          ? "objection"
          : angle.mechanism === "authority"
            ? "authority"
            : angle.mechanism === "myth"
              ? "myth"
              : angle.mechanism === "how-to"
                ? "how-to"
                : angle.mechanism === "pain"
                  ? "pain"
                  : "benefit",
    hook: angle.hook,
    promise: angle.promise,
    evidenceIds: [],
    score: {
      total: 80 - index,
      topicRelevance: 80,
      objectiveAlignment: 80,
      evidenceGrounding: 70,
      distinctiveness: 85,
    },
  };
}

export async function synthesizeHighTicketCaptions(input: {
  variations: PostVariation[];
  platform: Platform;
  postMode: PostMode;
  tone?: string;
  angles: AngleAssignment[];
}): Promise<PostVariation[]> {
  const synthesized = await synthesizeCaptionsForVariations(input.variations, {
    platform: input.platform,
    tone: input.tone,
    strategies: input.angles.map(angleToStrategy),
    isCarousel: input.postMode === "carousel",
  });
  return synthesized.map((variation, index) => ({
    ...input.variations[index],
    ...variation,
  }));
}
