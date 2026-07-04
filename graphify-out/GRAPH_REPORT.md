# Graph Report - client  (2026-07-03)

## Corpus Check
- Large corpus: 328 files · ~2,061,082 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1288 nodes · 2932 edges · 73 communities (66 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Empty State Components|UI Empty State Components]]
- [[_COMMUNITY_UI Accordion Components|UI Accordion Components]]
- [[_COMMUNITY_Dashboard Layout Components|Dashboard Layout Components]]
- [[_COMMUNITY_Tab Composition Components|Tab Composition Components]]
- [[_COMMUNITY_Canvas Editor Components|Canvas Editor Components]]
- [[_COMMUNITY_UI Form Components|UI Form Components]]
- [[_COMMUNITY_UI Navigation Components|UI Navigation Components]]
- [[_COMMUNITY_UI Button Components|UI Button Components]]
- [[_COMMUNITY_UI Dialog Components|UI Dialog Components]]
- [[_COMMUNITY_Text Editor Components|Text Editor Components]]
- [[_COMMUNITY_Component Group 10|Component Group 10]]
- [[_COMMUNITY_Component Group 11|Component Group 11]]
- [[_COMMUNITY_Component Group 12|Component Group 12]]
- [[_COMMUNITY_Component Group 13|Component Group 13]]
- [[_COMMUNITY_Component Group 14|Component Group 14]]
- [[_COMMUNITY_Component Group 15|Component Group 15]]
- [[_COMMUNITY_Component Group 16|Component Group 16]]
- [[_COMMUNITY_Component Group 17|Component Group 17]]
- [[_COMMUNITY_Component Group 18|Component Group 18]]
- [[_COMMUNITY_Component Group 19|Component Group 19]]
- [[_COMMUNITY_Component Group 20|Component Group 20]]
- [[_COMMUNITY_Component Group 21|Component Group 21]]
- [[_COMMUNITY_Component Group 22|Component Group 22]]
- [[_COMMUNITY_Component Group 23|Component Group 23]]
- [[_COMMUNITY_Component Group 24|Component Group 24]]
- [[_COMMUNITY_Component Group 25|Component Group 25]]
- [[_COMMUNITY_Component Group 26|Component Group 26]]
- [[_COMMUNITY_Component Group 27|Component Group 27]]
- [[_COMMUNITY_Component Group 28|Component Group 28]]
- [[_COMMUNITY_Component Group 29|Component Group 29]]
- [[_COMMUNITY_Component Group 30|Component Group 30]]
- [[_COMMUNITY_Component Group 31|Component Group 31]]
- [[_COMMUNITY_Component Group 32|Component Group 32]]
- [[_COMMUNITY_Component Group 33|Component Group 33]]
- [[_COMMUNITY_Component Group 34|Component Group 34]]
- [[_COMMUNITY_Component Group 35|Component Group 35]]
- [[_COMMUNITY_Component Group 36|Component Group 36]]
- [[_COMMUNITY_Component Group 37|Component Group 37]]
- [[_COMMUNITY_Component Group 38|Component Group 38]]
- [[_COMMUNITY_Component Group 39|Component Group 39]]
- [[_COMMUNITY_Component Group 40|Component Group 40]]
- [[_COMMUNITY_Component Group 41|Component Group 41]]
- [[_COMMUNITY_Component Group 42|Component Group 42]]
- [[_COMMUNITY_Component Group 43|Component Group 43]]
- [[_COMMUNITY_Component Group 44|Component Group 44]]
- [[_COMMUNITY_Component Group 45|Component Group 45]]
- [[_COMMUNITY_Component Group 46|Component Group 46]]
- [[_COMMUNITY_Component Group 47|Component Group 47]]
- [[_COMMUNITY_Component Group 48|Component Group 48]]
- [[_COMMUNITY_Component Group 49|Component Group 49]]
- [[_COMMUNITY_Component Group 50|Component Group 50]]
- [[_COMMUNITY_Component Group 51|Component Group 51]]
- [[_COMMUNITY_Component Group 52|Component Group 52]]
- [[_COMMUNITY_Component Group 53|Component Group 53]]
- [[_COMMUNITY_Component Group 54|Component Group 54]]
- [[_COMMUNITY_Component Group 55|Component Group 55]]
- [[_COMMUNITY_Component Group 56|Component Group 56]]
- [[_COMMUNITY_Component Group 57|Component Group 57]]
- [[_COMMUNITY_Component Group 58|Component Group 58]]
- [[_COMMUNITY_Component Group 59|Component Group 59]]
- [[_COMMUNITY_Component Group 60|Component Group 60]]
- [[_COMMUNITY_Component Group 61|Component Group 61]]
- [[_COMMUNITY_Component Group 62|Component Group 62]]
- [[_COMMUNITY_Component Group 63|Component Group 63]]
- [[_COMMUNITY_Component Group 64|Component Group 64]]
- [[_COMMUNITY_Component Group 65|Component Group 65]]
- [[_COMMUNITY_Component Group 66|Component Group 66]]
- [[_COMMUNITY_Component Group 67|Component Group 67]]
- [[_COMMUNITY_Component Group 68|Component Group 68]]
- [[_COMMUNITY_Component Group 69|Component Group 69]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 282 edges
2. `documentRect` - 43 edges
3. `useEditorStore` - 36 edges
4. `elementGeometry` - 25 edges
5. `useAuth()` - 22 edges
6. `Button()` - 20 edges
7. `documentSize` - 19 edges
8. `finiteNumber()` - 19 edges
9. `trpc` - 19 edges
10. `screenRect` - 18 edges

## Surprising Connections (you probably didn't know these)
- `TrinityLayout()` --calls--> `cn()`  [EXTRACTED]
  src/components/layout/TrinityLayout.tsx → src/lib/utils.ts
- `AlertDialogOverlay()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert-dialog.tsx → src/lib/utils.ts
- `AlertDialogContent()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert-dialog.tsx → src/lib/utils.ts
- `AlertDialogHeader()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert-dialog.tsx → src/lib/utils.ts
- `AlertDialogFooter()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert-dialog.tsx → src/lib/utils.ts

## Import Cycles
- 1-file cycle: `src/components/ui/sonner.tsx -> src/components/ui/sonner.tsx`
- 1-file cycle: `src/components/ui/input-otp.tsx -> src/components/ui/input-otp.tsx`
- 3-file cycle: `src/editor/adapters/layoutPositionAdapter.ts -> src/editor/interaction/index.ts -> src/editor/interaction/interactionReducer.ts -> src/editor/adapters/layoutPositionAdapter.ts`
- 4-file cycle: `src/editor/adapters/layoutPositionAdapter.ts -> src/editor/interaction/index.ts -> src/editor/interaction/interactionController.ts -> src/editor/interaction/interactionReducer.ts -> src/editor/adapters/layoutPositionAdapter.ts`

## Communities (73 total, 7 thin omitted)

### Community 0 - "UI Empty State Components"
Cohesion: 0.05
Nodes (53): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle(), Field() (+45 more)

### Community 1 - "UI Accordion Components"
Cohesion: 0.06
Nodes (43): Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), Alert(), AlertDescription(), AlertTitle(), alertVariants (+35 more)

### Community 2 - "Dashboard Layout Components"
Cohesion: 0.06
Nodes (48): DashboardLayoutContent(), DashboardLayoutContentProps, menuItems, DashboardLayoutSkeleton(), Avatar(), AvatarFallback(), AvatarImage(), Sheet() (+40 more)

### Community 3 - "Tab Composition Components"
Cohesion: 0.06
Nodes (40): CompositionTab(), CompositionTabProps, itemVariants, LAYOUT_OPTIONS, POSITIONS, DesignTab(), DesignTabProps, itemVariants (+32 more)

### Community 4 - "Canvas Editor Components"
Cohesion: 0.09
Nodes (28): AdvancedTextNode(), AdvancedTextNodeProps, DraggableBlock(), DraggableBlockProps, GRID_SNAP_POSITIONS, resolveLayoutStyle(), ImageElementBlock(), ImageElementBlockProps (+20 more)

### Community 5 - "UI Form Components"
Cohesion: 0.06
Nodes (31): BASE_SHAPES, BrandOverlay(), BrandOverlayProps, getShapeOpacity(), getShapesForStyle(), PLATFORM_ICONS, ShapeConfig, AdvancedTextElement (+23 more)

### Community 6 - "UI Navigation Components"
Cohesion: 0.12
Nodes (38): centerOfRect(), documentRectToPercentageCenter(), normalizeRotationDegrees(), percentageCenterToDocumentRect(), rectFromCenter(), rotatedRectBounds(), unionRects(), clamp() (+30 more)

### Community 7 - "UI Button Components"
Cohesion: 0.09
Nodes (28): BLOBS, OrganicBackground(), OrganicBackgroundProps, SparkLogo(), COLORS, Particle, BACKGROUND_CARDS, GenerationStatusDock() (+20 more)

### Community 8 - "UI Dialog Components"
Cohesion: 0.09
Nodes (19): FakeCapture, createTransientInteractionStore(), IDLE_INTERACTION_STATE, TransientInteractionStore, BeginInteractionInput, CreateInteractionControllerOptions, InteractionCancelReason, InteractionCommitPort (+11 more)

### Community 9 - "Text Editor Components"
Cohesion: 0.10
Nodes (19): PresetSelectorProps, StyleSelectorProps, getBrightness(), getCardStyleProps(), ThemePreviewProps, ThemeRenderer(), ThemeRendererProps, HoloDeckProps (+11 more)

### Community 10 - "Component Group 10"
Cohesion: 0.16
Nodes (25): EditorGeometryCommit, FixedLayoutGeometryTarget, canRedo(), canUndo(), clearHistory(), createHistoryStack(), DocumentTransaction, getLatestTransaction() (+17 more)

### Community 11 - "Component Group 11"
Cohesion: 0.08
Nodes (4): InteractiveGeometryTarget, CanvasInteractionContextValue, ElementRegistry, InteractionController

### Community 12 - "Component Group 12"
Cohesion: 0.07
Nodes (26): description, icon, images, label, description, icon, images, label (+18 more)

### Community 13 - "Component Group 13"
Cohesion: 0.10
Nodes (16): CREATION_MODE_OPTIONS, EXECUTION_THEME, POST_MODE_OPTIONS, SmartInput(), SmartInputProps, TYPE_CONFIG, HoloDeck(), RATIOS (+8 more)

### Community 14 - "Component Group 14"
Cohesion: 0.16
Nodes (24): translateRect(), clampDragRectPreservingInitialOverflow(), clampRectToBounds(), clampRotatedRectToBounds(), resizeRectProportionally(), documentRect, canvasBounds(), commitFor() (+16 more)

### Community 15 - "Component Group 15"
Cohesion: 0.10
Nodes (19): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay(), AlertDialogTitle() (+11 more)

### Community 16 - "Component Group 16"
Cohesion: 0.18
Nodes (12): Button(), elevationStyles, GlassCard(), GlassCardProps, GlassElevation, GlassMode, modeStyles, Tabs() (+4 more)

### Community 17 - "Component Group 17"
Cohesion: 0.21
Nodes (18): commit(), commitFor(), createCanvasViewport(), relativeScaleDifference(), canvasViewport, documentSize, elementGeometry, positiveNumber() (+10 more)

### Community 18 - "Component Group 18"
Cohesion: 0.14
Nodes (18): Badge(), badgeVariants, Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader() (+10 more)

### Community 19 - "Component Group 19"
Cohesion: 0.19
Nodes (15): layoutToAdvanced(), applyAspectRatioToVariation(), applyDesignTokensToSnapshot(), buildVariationSnapshot(), createPostVisualSnapshot(), hasManualSectionLayouts(), ICON_FALLBACKS, normalizeImageSettings() (+7 more)

### Community 20 - "Component Group 20"
Cohesion: 0.12
Nodes (14): TrinityLayout(), TrinityLayoutProps, ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Checkbox(), Separator() (+6 more)

### Community 21 - "Component Group 21"
Cohesion: 0.15
Nodes (14): PostRendererMode, CarouselMobileArrows(), CarouselScopeControl(), CarouselSlideNavigator(), MagnetControl(), CanvasGridOverlay(), CanvasGridOverlayProps, CanvasLoadingOverlay() (+6 more)

### Community 22 - "Component Group 22"
Cohesion: 0.14
Nodes (16): GeometryAdapter, imageElementFromCommit(), imageElementsEqual(), imageGeometryAdapter, ImageGeometryTarget, isImageGeometryTarget(), isTextGeometryTarget(), readImageGeometry() (+8 more)

### Community 23 - "Component Group 23"
Cohesion: 0.14
Nodes (11): AdminRoute(), AppInner(), ProtectedRoute(), PublicLandingRoute(), RootEntry(), AuthGate(), AuthGateProps, DashboardLayout() (+3 more)

### Community 24 - "Component Group 24"
Cohesion: 0.14
Nodes (12): DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut() (+4 more)

### Community 25 - "Component Group 25"
Cohesion: 0.21
Nodes (11): DesignBlock(), ElementContentBlock(), fieldClassName(), TextElement, FontColorBlock(), LeftSidebar(), LeftSidebarProps, WorkbenchV2() (+3 more)

### Community 26 - "Component Group 26"
Cohesion: 0.20
Nodes (14): AuthMode, CardVisualState, clamp(), getCardVisualState(), getCollisionFactor(), getHeadlineClasses(), getOptimizedUnsplashUrl(), getTextBlockClasses() (+6 more)

### Community 27 - "Component Group 27"
Cohesion: 0.25
Nodes (14): compactText(), describeElement(), elText(), formatArg(), formatArgs(), getInputValueSafe(), installUiEventListeners(), isSensitiveField() (+6 more)

### Community 28 - "Component Group 28"
Cohesion: 0.12
Nodes (11): ContextMenu(), ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut() (+3 more)

### Community 29 - "Component Group 29"
Cohesion: 0.23
Nodes (8): AuthMode, LoginModalProps, exchangeSupabaseSession(), refreshBridgeFromCurrentSession(), isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl

### Community 30 - "Component Group 30"
Cohesion: 0.19
Nodes (9): ManusDialogProps, Dialog(), DialogCompositionContext, DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogTitle() (+1 more)

### Community 31 - "Component Group 31"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 32 - "Component Group 32"
Cohesion: 0.24
Nodes (11): snapToGrid(), geometryCenterPercent(), GRID_SNAP_COORDINATES, isLayoutGeometryTarget(), LAYOUT_GEOMETRY_TARGETS, layoutPositionFromCommit(), layoutPositionsEqual(), nearestGridCoordinate() (+3 more)

### Community 33 - "Component Group 33"
Cohesion: 0.18
Nodes (12): Item(), ItemActions(), ItemContent(), ItemDescription(), ItemFooter(), ItemGroup(), ItemHeader(), ItemMedia() (+4 more)

### Community 34 - "Component Group 34"
Cohesion: 0.21
Nodes (4): DeferredScheduler, FakeScheduler, FrameHandle, FrameScheduler

### Community 35 - "Component Group 35"
Cohesion: 0.20
Nodes (6): BackgroundPickerProps, COLOR_PRESETS, TabId, TABS, EditorSliderProps, Slider()

### Community 36 - "Component Group 36"
Cohesion: 0.24
Nodes (6): PostRenderer(), PostRendererProps, PostCardV2Props, PostEditorBindings, projectSnapshotForSlide(), LayoutTarget

### Community 37 - "Component Group 37"
Cohesion: 0.23
Nodes (10): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue, FormLabel() (+2 more)

### Community 38 - "Component Group 38"
Cohesion: 0.22
Nodes (8): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), THEMES, useChart()

### Community 39 - "Component Group 39"
Cohesion: 0.31
Nodes (8): DialogContent(), useDialogComposition(), Input(), Textarea(), TimerResponse, useComposition(), UseCompositionOptions, UseCompositionReturn

### Community 40 - "Component Group 40"
Cohesion: 0.18
Nodes (5): CONTENT_SOURCE_OPTIONS, ExecutionBriefProps, INTERVENTION_OPTIONS, OBJECTIVE_OPTIONS, PLATFORM_OPTIONS

### Community 41 - "Component Group 41"
Cohesion: 0.33
Nodes (9): isSnapshotV1(), isSnapshotV2(), isSnapshotV3(), migrateToLatest(), migrateV1ToV2(), migrateV2ToV3(), SnapshotV1, SnapshotV2 (+1 more)

### Community 42 - "Component Group 42"
Cohesion: 0.20
Nodes (4): filterByTime(), History(), StatusFilter, TimeFilter

### Community 43 - "Component Group 43"
Cohesion: 0.24
Nodes (8): ConsentModal(), ConsentModalProps, ConsentRecord, useConsent(), CookieBanner(), CookieConsentRecord, useCookieConsent(), PrivacySettingsPage()

### Community 44 - "Component Group 44"
Cohesion: 0.22
Nodes (7): Footer(), FooterProps, BillingCycle, cardVariants, containerVariants, PaidPlan, PLANS

### Community 45 - "Component Group 45"
Cohesion: 0.24
Nodes (8): Detent, DETENTS, MobileEditSheet(), MobileEditSheetProps, ORDER, UserTopMenu(), MobileEditorUIState, useMobileEditorUI

### Community 46 - "Component Group 46"
Cohesion: 0.24
Nodes (8): BackgroundGallery(), BackgroundGalleryProps, BackgroundManifest, useBackgroundManifest(), BG_TABS, BLEND_MODES, ImageBlock(), ImageBlockProps

### Community 47 - "Component Group 47"
Cohesion: 0.20
Nodes (4): CaptionPreview(), CaptionPreviewProps, CaptionBlock(), CanvasInteractionProvider()

### Community 48 - "Component Group 48"
Cohesion: 0.20
Nodes (9): Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator() (+1 more)

### Community 49 - "Component Group 49"
Cohesion: 0.31
Nodes (7): PACKAGES, UpgradePromptModal(), UpgradePromptModalProps, useUpgradePrompt(), useExtractedStyles(), UseExtractedStylesReturn, Home()

### Community 50 - "Component Group 50"
Cohesion: 0.20
Nodes (4): analytics, AnalyticsEvent, AnalyticsEvents, PageViewEvent

### Community 51 - "Component Group 51"
Cohesion: 0.20
Nodes (8): BillingCycle, cardVariants, containerVariants, PaidPlan, PLAN_COLORS, PLAN_LABELS, PLAN_MONTHLY_SPARKS, PLANS

### Community 52 - "Component Group 52"
Cohesion: 0.22
Nodes (4): BORDER_OPTIONS, BORDER_RADIUS_OPTIONS, BOX_SHADOW_OPTIONS, ChameleonPanelProps

### Community 53 - "Component Group 53"
Cohesion: 0.31
Nodes (6): getSparkColor(), PLAN_MONTHLY_SPARKS, SparkBalance(), trpc, queryClient, trpcClient

### Community 54 - "Component Group 54"
Cohesion: 0.28
Nodes (8): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea()

### Community 55 - "Component Group 55"
Cohesion: 0.22
Nodes (8): Toaster(), Theme, ThemeContext, ThemeContextType, ThemeProvider(), ThemeProviderProps, useTheme(), ComponentsShowcase()

### Community 56 - "Component Group 56"
Cohesion: 0.33
Nodes (8): CheckSeverity, checkTypographyHierarchy(), contrastRatio(), DesignCheckItem, hexToRgbNorm(), LAYOUT_OBJECTIVE_MAP, relativeLuminance(), validateDesignChecklist()

### Community 57 - "Component Group 57"
Cohesion: 0.29
Nodes (4): ANGLE_COLORS, CopyEditorPanelProps, ANGLE_TEMPLATES, AngleTemplates

### Community 58 - "Component Group 58"
Cohesion: 0.32
Nodes (5): MapView(), MapViewProps, Window, noop, usePersistFn()

### Community 59 - "Component Group 59"
Cohesion: 0.29
Nodes (5): RatioIcon(), RatioIconProps, PlatformBlock(), PLATFORMS, RATIO_LABELS

### Community 60 - "Component Group 60"
Cohesion: 0.29
Nodes (7): ArcDrawerState, DEFAULT_STATE, DrawerHeight, getHeightInVh(), TabId, useArcDrawer(), UseArcDrawerReturn

### Community 61 - "Component Group 61"
Cohesion: 0.33
Nodes (5): AIChatBox(), AIChatBoxProps, Message, ScrollArea(), ScrollBar()

### Community 62 - "Component Group 62"
Cohesion: 0.29
Nodes (3): ErrorBoundary, Props, State

## Knowledge Gaps
- **248 isolated node(s):** `label`, `description`, `icon`, `images`, `label` (+243 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `UI Empty State Components` to `UI Accordion Components`, `Dashboard Layout Components`, `Tab Composition Components`, `Component Group 15`, `Component Group 16`, `Component Group 18`, `Component Group 20`, `Component Group 24`, `Component Group 28`, `Component Group 30`, `Component Group 31`, `Component Group 33`, `Component Group 35`, `Component Group 37`, `Component Group 38`, `Component Group 39`, `Component Group 48`, `Component Group 54`, `Component Group 58`, `Component Group 61`, `Component Group 62`?**
  _High betweenness centrality (0.250) - this node is a cross-community bridge._
- **Why does `useEditorStore` connect `Component Group 25` to `Tab Composition Components`, `Canvas Editor Components`, `Component Group 10`, `Component Group 13`, `Component Group 46`, `Component Group 47`, `Component Group 17`, `Component Group 49`, `Component Group 19`, `Component Group 21`, `Component Group 59`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `trpc` connect `Component Group 53` to `Component Group 35`, `Component Group 42`, `Component Group 44`, `Component Group 46`, `Component Group 16`, `Component Group 49`, `Component Group 18`, `Component Group 19`, `Component Group 51`, `Component Group 24`, `Component Group 25`, `Component Group 29`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `label`, `description`, `icon` to the rest of the system?**
  _248 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Empty State Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05407925407925408 - nodes in this community are weakly interconnected._
- **Should `UI Accordion Components` be split into smaller, more focused modules?**
  _Cohesion score 0.058445353594389245 - nodes in this community are weakly interconnected._
- **Should `Dashboard Layout Components` be split into smaller, more focused modules?**
  _Cohesion score 0.056866303690260134 - nodes in this community are weakly interconnected._