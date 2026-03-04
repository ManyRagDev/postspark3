/**
 * CopyEditorPanel — Editor for copy angles (Dor, Benefício, Objeção, Autoridade, Escassez).
 * Each variation's copyAngle can be edited: badge, stickerText, headline, subheadline.
 */

import React from "react";
import type { PostVariation, CopyAngle, CopyAngleType } from "@shared/postspark";
import { COPY_ANGLE_LABELS } from "@shared/postspark";
import { Tag, Sticker, Heading, FileText, Sparkles } from "lucide-react";
import { ANGLE_TEMPLATES } from "@/lib/copyAngleTemplates";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ANGLE_COLORS: Record<CopyAngleType, string> = {
  dor: "#ef4444",
  beneficio: "#22c55e",
  objecao: "#f59e0b",
  autoridade: "#6366f1",
  escassez: "#ec4899",
  storytelling: "#a855f7",
  mito_vs_verdade: "#06b6d4"
};

function InputField({ icon, label, value, onChange, placeholder, multiline = false }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-white/50 text-[10px] flex items-center gap-1">
        {icon} {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white/90 text-xs resize-none placeholder:text-white/20"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white/90 text-xs placeholder:text-white/20"
        />
      )}
    </label>
  );
}

// ─── CopyEditorPanel ──────────────────────────────────────────────────────────

interface CopyEditorPanelProps {
  variation: PostVariation;
  onChange: (updated: Partial<PostVariation>) => void;
}

export default function CopyEditorPanel({ variation, onChange }: CopyEditorPanelProps) {
  const angle = variation.copyAngle;
  const angleType = angle?.type ?? "beneficio";
  const angleColor = ANGLE_COLORS[angleType];

  const updateAngle = (patch: Partial<CopyAngle>) => {
    const current: CopyAngle = angle ?? {
      type: "beneficio",
      label: COPY_ANGLE_LABELS.beneficio,
      badge: "",
      stickerText: "",
    };

    const newAngle = { ...current, ...patch };

    // Smart Suggestion: If type changed, apply templates
    if (patch.type && patch.type !== current.type) {
      const template = ANGLE_TEMPLATES[patch.type];
      if (template) {
        newAngle.badge = template.badge;
        newAngle.stickerText = template.stickerText;

        // If headline is empty or very short, suggest a prefix
        if (template.headlinePrefix && (!variation.headline || variation.headline.length < 5)) {
          onChange({
            copyAngle: newAngle,
            headline: template.headlinePrefix
          });
          return;
        }
      }
    }

    onChange({ copyAngle: newAngle });
  };

  const updateHeadline = (headline: string) => onChange({ headline });
  const updateBody = (body: string) => onChange({ body });

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Angle type selector */}
      <div className="flex flex-col gap-1">
        <span className="text-white/60 text-[10px]">Ângulo de Copy</span>
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(COPY_ANGLE_LABELS) as CopyAngleType[]).map((type) => (
            <button
              key={type}
              onClick={() => updateAngle({ type, label: COPY_ANGLE_LABELS[type] })}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${angleType === type
                ? "text-white border"
                : "text-white/40 bg-white/5 border border-transparent hover:border-white/10"
                }`}
              style={
                angleType === type
                  ? { backgroundColor: `${ANGLE_COLORS[type]}25`, borderColor: `${ANGLE_COLORS[type]}60` }
                  : undefined
              }
            >
              {COPY_ANGLE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Separator with angle color */}
      <div className="h-px" style={{ backgroundColor: `${angleColor}30` }} />

      {/* Badge */}
      <InputField
        icon={<Tag size={10} />}
        label="Badge"
        value={angle?.badge ?? ""}
        onChange={(v) => updateAngle({ badge: v })}
        placeholder="Ex: Cozinha IA"
      />

      {/* Sticker */}
      <InputField
        icon={<Sticker size={10} />}
        label="Sticker Decorativo"
        value={angle?.stickerText ?? ""}
        onChange={(v) => updateAngle({ stickerText: v })}
        placeholder="Ex: Magia, Prático"
      />

      {/* Headline */}
      <InputField
        icon={<Heading size={10} />}
        label="Headline"
        value={variation.headline}
        onChange={updateHeadline}
        placeholder="Gancho principal (5 palavras max)"
        multiline
      />

      {/* Body / Subheadline */}
      <InputField
        icon={<FileText size={10} />}
        label="Corpo / Subheadline"
        value={variation.body ?? ""}
        onChange={updateBody}
        placeholder="Explicação de apoio"
        multiline
      />
    </div>
  );
}
