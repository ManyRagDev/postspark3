import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { FONT_CATALOG, loadFontByName } from '@/lib/fonts';

interface FontDropdownProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
}

export function FontDropdown({ value, onChange, label }: FontDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Pre-load current font
    useEffect(() => {
        if (value) {
            loadFontByName(value);
        }
    }, [value]);

    // Load remaining fonts when opened, to avoid FOUC
    useEffect(() => {
        if (isOpen) {
            Object.values(FONT_CATALOG).flat().forEach((font) => {
                loadFontByName(font.name);
            });
        }
    }, [isOpen]);

    // Find selected label
    let selectedLabel = value;
    for (const group of Object.values(FONT_CATALOG)) {
        const found = group.find((f: { name: string; label: string }) => f.name === value);
        if (found) {
            selectedLabel = found.label;
            break;
        }
    }

    // Flatten the catalog for easier rendering or keep groups
    const fontGroups = [
        { label: "Sans-Serif", fonts: FONT_CATALOG.sansSerif },
        { label: "Serifadas", fonts: FONT_CATALOG.serif },
        { label: "Display", fonts: FONT_CATALOG.display },
        { label: "Mono", fonts: FONT_CATALOG.mono },
    ];

    return (
        <div className="flex flex-col gap-1 w-full relative" ref={dropdownRef}>
            {label && <span className="text-white/60 text-xs">{label}</span>}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between bg-white/5 border border-white/10 rounded px-3 py-2 text-white/90 text-sm hover:bg-white/10 transition-colors w-full text-left"
                style={{ fontFamily: value }}
            >
                <span className="truncate">{selectedLabel}</span>
                <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 z-50 w-full mt-1 bg-[#1a1c23] border border-white/10 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {fontGroups.map((group) => (
                        <div key={group.label}>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider sticky top-0 bg-[#1a1c23]/95 backdrop-blur-sm z-10">
                                {group.label}
                            </div>
                            {group.fonts.map((f) => (
                                <button
                                    key={f.name}
                                    onClick={() => {
                                        onChange(f.name);
                                        setIsOpen(false);
                                    }}
                                    className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors ${value === f.name ? "text-[#a855f7]" : "text-white/80"
                                        }`}
                                    style={{ fontFamily: f.name }}
                                >
                                    <span className="truncate">{f.label}</span>
                                    {value === f.name && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
