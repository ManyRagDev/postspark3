import type { MareSelection } from "@shared/mareSelection";

export function MareSelectionPreview({
  selection,
}: {
  selection: MareSelection;
}) {
  const { width, height, layers } = selection.sourceComposition;
  return (
    <div className="mx-auto w-full max-w-64">
      <svg
        role="img"
        aria-label="Prévia das camadas selecionadas"
        viewBox={`0 0 ${width} ${height}`}
        className="max-h-64 w-full bg-neutral-800"
      >
        {layers.map((l, i) => (
          <g
            key={i}
            transform={`translate(${l.x} ${l.y}) rotate(${l.rotation ?? 0})`}
            opacity={l.opacity}
          >
            {l.kind === "text" ? (
              <foreignObject
                x={-l.width / 2}
                y={-l.height / 2}
                width={l.width}
                height={l.height}
              >
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    fontFamily: l.fontFamily,
                    fontWeight: l.fontWeight,
                    fontStyle: l.italic ? "italic" : undefined,
                    fontSize: l.fontSize,
                    lineHeight: 1.1,
                    textAlign: l.align,
                    color: l.color,
                  }}
                >
                  {l.text}
                </div>
              </foreignObject>
            ) : l.kind === "image" ? (
              <image
                href={l.url}
                x={-l.width / 2}
                y={-l.height / 2}
                width={l.width}
                height={l.height}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <rect
                x={-l.width / 2}
                y={-l.height / 2}
                width={l.width}
                height={l.height}
                fill={l.color}
              />
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
