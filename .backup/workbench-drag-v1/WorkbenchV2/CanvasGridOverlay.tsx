import { GRID_SNAP_COORDINATES } from "@/editor/adapters";

interface CanvasGridOverlayProps {
    accentColor: string;
}

export function CanvasGridOverlay({ accentColor }: CanvasGridOverlayProps) {
    return (
        <div
            aria-hidden
            data-canvas-grid-overlay
            className="pointer-events-none absolute inset-0 z-[40] overflow-hidden rounded-2xl"
        >
            {GRID_SNAP_COORDINATES.map(coordinate => (
                <div key={`lines-${coordinate}`}>
                    <div
                        data-canvas-grid-line="vertical"
                        className="absolute top-0 h-full w-px"
                        style={{ left: `${coordinate}%`, backgroundColor: `${accentColor}26` }}
                    />
                    <div
                        data-canvas-grid-line="horizontal"
                        className="absolute left-0 h-px w-full"
                        style={{ top: `${coordinate}%`, backgroundColor: `${accentColor}26` }}
                    />
                </div>
            ))}
            {GRID_SNAP_COORDINATES.flatMap(x =>
                GRID_SNAP_COORDINATES.map(y => (
                    <span
                        key={`${x}-${y}`}
                        data-canvas-grid-point
                        className="absolute h-1.5 w-1.5 rounded-full"
                        style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            transform: "translate(-50%, -50%)",
                            backgroundColor: `${accentColor}80`,
                            boxShadow: `0 0 8px ${accentColor}66`,
                        }}
                    />
                )),
            )}
        </div>
    );
}
