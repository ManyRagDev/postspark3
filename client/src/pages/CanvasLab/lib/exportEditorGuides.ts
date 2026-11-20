type Guide = {
  visible: (value?: boolean) => boolean | unknown;
  hide: () => void;
};
type ExportStage = {
  find: (selector: string) => Guide[];
  getLayers: () => Array<{ draw: () => void }>;
};

/** Capture never includes selection, media placeholders or alignment guides. Restore even on failure. */
export function withoutEditorGuides<T>(
  stage: ExportStage,
  capture: () => T
): T {
  const nodes = [
    ...stage.find("Transformer"),
    ...stage.find(".editor-media-guide"),
  ];
  const snapshot = nodes.map(node => ({
    node,
    visible: Boolean(node.visible()),
  }));
  snapshot.forEach(({ node }) => node.hide());
  stage.getLayers().forEach(layer => layer.draw());
  try {
    return capture();
  } finally {
    snapshot.forEach(({ node, visible }) => node.visible(visible));
    stage.getLayers().forEach(layer => layer.draw());
  }
}
