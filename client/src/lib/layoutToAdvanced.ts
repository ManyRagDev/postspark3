import type { AdvancedLayoutSettings } from "@/types/editor";

export function layoutToAdvanced(
  layout: string | undefined
): AdvancedLayoutSettings {
  switch (layout) {
    case "centered":
      return {
        headline: { position: "center", textAlign: "center" },
        body: { position: "bottom-center", textAlign: "center" },
        accentBar: {
          position: "top-center",
          textAlign: "center",
          width: 10,
        },
        badge: { position: "top-center", textAlign: "center" },
        sticker: { position: "bottom-center", textAlign: "center" },
        carouselArrow: {
          position: "bottom-right",
          textAlign: "right",
          width: 12,
        },
        card: { position: "center", textAlign: "center" },
        padding: 24,
      };
    case "split":
      return {
        headline: { position: "center-left", textAlign: "left" },
        body: { position: "bottom-left", textAlign: "left" },
        accentBar: {
          position: "top-left",
          textAlign: "left",
          width: 10,
        },
        badge: { position: "top-right", textAlign: "right" },
        sticker: { position: "bottom-right", textAlign: "right" },
        carouselArrow: {
          position: "bottom-right",
          textAlign: "right",
          width: 12,
        },
        card: { position: "center-left", textAlign: "left" },
        padding: 24,
      };
    case "minimal":
      return {
        headline: { position: "center", textAlign: "center" },
        body: { position: "bottom-center", textAlign: "center" },
        accentBar: {
          position: "top-center",
          textAlign: "center",
          width: 15,
        },
        badge: { position: "top-center", textAlign: "center" },
        sticker: { position: "bottom-center", textAlign: "center" },
        carouselArrow: {
          position: "bottom-right",
          textAlign: "right",
          width: 12,
        },
        card: { position: "center", textAlign: "center" },
        padding: 24,
      };
    case "left-aligned":
    default:
      return {
        headline: { position: "center-left", textAlign: "left" },
        body: { position: "bottom-left", textAlign: "left" },
        accentBar: {
          position: "top-left",
          textAlign: "left",
          width: 10,
        },
        badge: { position: "top-right", textAlign: "right" },
        sticker: { position: "bottom-right", textAlign: "right" },
        carouselArrow: {
          position: "bottom-right",
          textAlign: "right",
          width: 12,
        },
        card: { position: "center-left", textAlign: "left" },
        padding: 24,
      };
  }
}
