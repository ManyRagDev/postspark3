import { useState } from "react";
import {
  canvasTemporalSourceSchema,
  type CanvasTemporalSource,
} from "@shared/canvasTemporalMedia";

type Props = {
  source: CanvasTemporalSource;
  disabled: boolean;
  onApply: (source: CanvasTemporalSource) => void;
};
export function TemporalMediaControls({ source, disabled, onApply }: Props) {
  const [error, setError] = useState("");
  return (
    <form
      className="grid grid-cols-2 gap-2 text-xs"
      onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const number = (key: string) => {
          const value = String(data.get(key) ?? "").trim();
          return value ? Number(value) : undefined;
        };
        const parsed = canvasTemporalSourceSchema.safeParse({
          ...source,
          start: number("start"),
          trimIn: number("from"),
          trimOut: number("to"),
          volume: number("volume"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        setError("");
        onApply(parsed.data);
      }}
    >
      {(
        [
          ["start", "Início no slide (s)", source.start ?? 0],
          ["from", "Início no vídeo (s)", source.trimIn ?? 0],
          ["to", "Fim no vídeo (s)", source.trimOut ?? ""],
          ["volume", "Volume (0 a 1)", source.volume ?? 1],
        ] as const
      ).map(([key, label, value]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            name={key}
            min="0"
            max={key === "volume" ? 1 : undefined}
            step="any"
            defaultValue={value}
            placeholder={key === "to" ? "Duração original" : undefined}
            disabled={disabled}
            className="block min-h-11 w-full rounded border border-white/20 bg-slate-900 p-2"
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="col-span-2 text-amber-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={disabled}
        className="col-span-2 min-h-11 rounded border border-white/20 p-2"
      >
        Aplicar trecho e volume
      </button>
    </form>
  );
}
