import React from 'react';
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline } from 'lucide-react';

interface AdvancedTextPropertyBarProps {
    styles: {
        fontSize: string;
        fontFamily: string;
        color: string;
        fontWeight: string;
        fontStyle: string;
        textDecoration: string;
        textAlign: string;
        lineHeight: string;
        opacity: string;
    };
    onChange: (property: string, value: string) => void;
    accentColor?: string;
}

export const AdvancedTextPropertyBar: React.FC<AdvancedTextPropertyBarProps> = ({
    styles,
    onChange,
    accentColor = '#a855f7'
}) => {
    return (
        <div
            className="flex items-center gap-4 px-4 py-2 bg-neutral-900 border-b border-white/10 overflow-x-auto no-scrollbar"
            style={{ minHeight: '48px' }}
        >
            {/* Font Family */}
            <div className="flex items-center gap-2">
                <select
                    value={styles.fontFamily}
                    onChange={(e) => onChange('fontFamily', e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[#a855f7] transition-colors"
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                >
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="Roboto, sans-serif">Roboto</option>
                    <option value="Playfair Display, serif">Playfair</option>
                    <option value="Montserrat, sans-serif">Montserrat</option>
                    <option value="Oswald, sans-serif">Oswald</option>
                </select>
            </div>

            <div className="w-px h-5 bg-white/10" />

            {/* Font Size */}
            <div className="flex items-center gap-1">
                <input
                    type="number"
                    value={parseInt(styles.fontSize)}
                    onChange={(e) => onChange('fontSize', `${e.target.value}px`)}
                    className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[#a855f7] text-center"
                />
                <span className="text-[10px] text-white/50">px</span>
            </div>

            <div className="w-px h-5 bg-white/10" />

            {/* Text Style Toggles (Bold, Italic, Underline) */}
            <div className="flex gap-1 bg-black/20 p-0.5 rounded-lg border border-white/5">
                <button
                    onClick={() => onChange('fontWeight', styles.fontWeight === 'bold' ? 'normal' : 'bold')}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ background: styles.fontWeight === 'bold' ? `${accentColor}20` : 'transparent', color: styles.fontWeight === 'bold' ? accentColor : 'rgba(255,255,255,0.6)' }}
                >
                    <Bold size={14} />
                </button>
                <button
                    onClick={() => onChange('fontStyle', styles.fontStyle === 'italic' ? 'normal' : 'italic')}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ background: styles.fontStyle === 'italic' ? `${accentColor}20` : 'transparent', color: styles.fontStyle === 'italic' ? accentColor : 'rgba(255,255,255,0.6)' }}
                >
                    <Italic size={14} />
                </button>
                <button
                    onClick={() => onChange('textDecoration', styles.textDecoration === 'underline' ? 'none' : 'underline')}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ background: styles.textDecoration === 'underline' ? `${accentColor}20` : 'transparent', color: styles.textDecoration === 'underline' ? accentColor : 'rgba(255,255,255,0.6)' }}
                >
                    <Underline size={14} />
                </button>
            </div>

            <div className="w-px h-5 bg-white/10" />

            {/* Text Alignment */}
            <div className="flex gap-1 bg-black/20 p-0.5 rounded-lg border border-white/5">
                <button
                    onClick={() => onChange('textAlign', 'left')}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ background: styles.textAlign === 'left' ? `${accentColor}20` : 'transparent', color: styles.textAlign === 'left' ? accentColor : 'rgba(255,255,255,0.6)' }}
                >
                    <AlignLeft size={14} />
                </button>
                <button
                    onClick={() => onChange('textAlign', 'center')}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ background: styles.textAlign === 'center' ? `${accentColor}20` : 'transparent', color: styles.textAlign === 'center' ? accentColor : 'rgba(255,255,255,0.6)' }}
                >
                    <AlignCenter size={14} />
                </button>
                <button
                    onClick={() => onChange('textAlign', 'right')}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ background: styles.textAlign === 'right' ? `${accentColor}20` : 'transparent', color: styles.textAlign === 'right' ? accentColor : 'rgba(255,255,255,0.6)' }}
                >
                    <AlignRight size={14} />
                </button>
            </div>

            <div className="w-px h-5 bg-white/10" />

            {/* Color Picker */}
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={styles.color}
                    onChange={(e) => onChange('color', e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                />
                <span className="text-[10px] text-white/50 uppercase font-mono">{styles.color}</span>
            </div>

            <div className="w-px h-5 bg-white/10" />

            {/* Opacity slider */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/50">Opac.</span>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={parseFloat(styles.opacity) || 1}
                    onChange={(e) => onChange('opacity', e.target.value)}
                    className="w-16 accent-[#a855f7]"
                />
            </div>
        </div>
    );
};
