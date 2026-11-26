import { Rect, Shape } from "react-konva";
import { isDarkColor, type CanvasBackgroundTreatment } from "./types";

interface NativeBackgroundTreatmentProps {
  treatment: CanvasBackgroundTreatment;
  color: string;
  width: number;
  height: number;
}

export function NativeBackgroundTreatment({ treatment, color, width, height }: NativeBackgroundTreatmentProps) {
  const { kind, tint, texture } = treatment;
  const focus = { x: treatment.x * width, y: treatment.y * height };
  const opposite = Math.abs(treatment.x - 0.5) + Math.abs(treatment.y - 0.5) < 0.05
    ? { x: width, y: height }
    : { x: width - focus.x, y: height - focus.y };
  const textureInk = isDarkColor(color) ? "255,255,255" : "0,0,0";

  return (
    <>
      {kind === "linear" ? (
        <Rect name="canvas-bg" width={width} height={height} fillLinearGradientStartPoint={focus}
          fillLinearGradientEndPoint={opposite} fillLinearGradientColorStops={[0, tint, 1, color]} />
      ) : kind === "spotlight" ? (
        <Rect name="canvas-bg" width={width} height={height} fillRadialGradientStartPoint={focus}
          fillRadialGradientEndPoint={focus} fillRadialGradientStartRadius={0}
          fillRadialGradientEndRadius={Math.hypot(width, height) * 0.7}
          fillRadialGradientColorStops={[0, tint, 1, color]} />
      ) : <Rect name="canvas-bg" width={width} height={height} fill={color} />}
      {texture !== "none" && (
        <Shape width={width} height={height} listening={false}
          fill={`rgba(${textureInk},${texture === "grain" ? 0.09 : 0.14})`}
          stroke={`rgba(${textureInk},0.12)`} strokeWidth={0.5}
          sceneFunc={(context, shape) => {
            context.beginPath();
            if (texture === "grid") {
              for (let x = 12; x < width; x += 24) {
                context.moveTo(x, 0);
                context.lineTo(x, height);
              }
              for (let y = 12; y < height; y += 24) {
                context.moveTo(0, y);
                context.lineTo(width, y);
              }
              context.strokeShape(shape);
              return;
            }
            const grain = texture === "grain";
            const step = grain ? 7 : 14;
            const radius = grain ? 0.45 : 0.8;
            for (let row = 0; (row + 1) * step < height; row++) {
              for (let column = 0; (column + 1) * step < width; column++) {
                const x = column * step + (grain ? 1 + (column * 7 + row * 11) % 5 : step / 2);
                const y = row * step + (grain ? 1 + (column * 13 + row * 7) % 5 : step / 2);
                context.moveTo(x + radius, y);
                context.arc(x, y, radius, 0, Math.PI * 2);
              }
            }
            context.fillShape(shape);
          }}
        />
      )}
    </>
  );
}
