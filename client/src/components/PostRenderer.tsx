import type { CSSProperties } from "react";
import type { AspectRatio, DesignTokens, PostVariation } from "@shared/postspark";
import type { ThemeConfig } from "@/lib/themes";
import PostCardV2 from "@/components/views/WorkbenchV2/PostCardV2";

export type PostRendererMode = "preview" | "edit" | "export";

interface PostRendererProps {
  mode: PostRendererMode;
  snapshot?: PostVariation;
  aspectRatio?: AspectRatio;
  currentSlideIndex?: number;
  theme?: ThemeConfig;
  designTokens?: DesignTokens;
  brandMeta?: { logoUrl?: string; brandName?: string; favicon?: string };
  compact?: boolean;
  isEditingCard?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function PostRenderer({
  mode,
  snapshot,
  aspectRatio,
  currentSlideIndex,
  theme,
  designTokens,
  brandMeta,
  compact = false,
  isEditingCard = false,
  className,
  style,
}: PostRendererProps) {
  return (
    <div
      className={className}
      style={style}
      data-post-renderer={mode}
      data-post-id={snapshot?.id}
    >
      <PostCardV2
        mode={mode}
        snapshot={snapshot}
        aspectRatio={aspectRatio}
        currentSlideIndex={currentSlideIndex}
        theme={theme}
        designTokens={designTokens}
        brandMeta={brandMeta}
        compact={compact}
        isEditingCard={isEditingCard}
      />
    </div>
  );
}
