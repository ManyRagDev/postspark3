import type { CSSProperties } from "react";
import type { AspectRatio, DesignTokens, PostVisualSnapshot } from "@shared/postspark";
import type { ThemeConfig } from "@/lib/themes";
import PostCardV2 from "@/components/views/WorkbenchV2/PostCardV2";
import { projectSnapshotForSlide } from "@/lib/variationSnapshot";
import type { PostEditorBindings } from "@/editor/integration/editorBindings";

export type PostRendererMode = "preview" | "edit" | "export";

interface PostRendererProps {
  mode: PostRendererMode;
  snapshot: PostVisualSnapshot;
  aspectRatio?: AspectRatio;
  currentSlideIndex?: number;
  theme?: ThemeConfig;
  designTokens?: DesignTokens;
  brandMeta?: { logoUrl?: string; brandName?: string; favicon?: string };
  compact?: boolean;
  isEditingCard?: boolean;
  className?: string;
  style?: CSSProperties;
  editorBindings?: PostEditorBindings;
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
  editorBindings,
}: PostRendererProps) {
  const renderSnapshot = projectSnapshotForSlide(snapshot, currentSlideIndex ?? 0);

  return (
    <div
      className={className}
      style={style}
      data-post-renderer={mode}
      data-post-id={renderSnapshot?.id}
    >
      <PostCardV2
        mode={mode}
        snapshot={renderSnapshot}
        aspectRatio={aspectRatio}
        currentSlideIndex={currentSlideIndex}
        theme={theme}
        designTokens={designTokens}
        brandMeta={brandMeta}
        compact={compact}
        isEditingCard={isEditingCard}
        editorBindings={editorBindings}
      />
    </div>
  );
}
