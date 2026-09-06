import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Check, Type, X } from "lucide-react";
import { FONT_CATALOG, loadCatalogFonts, loadFontByName, type FontEntry } from "@/lib/fonts";

interface FontPickerDropdownProps {
  value: string;
  onChange: (fontName: string) => void;
  uploadedFontName?: string | null;
  className?: string;
}

type CategoryTab = "all" | "serif" | "display" | "sansSerif" | "mono" | "upload";

const CATEGORY_TABS: Array<{ id: CategoryTab; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "serif", label: "Serifadas" },
  { id: "display", label: "Display" },
  { id: "sansSerif", label: "Sans-Serif" },
  { id: "mono", label: "Mono" },
];

export default function FontPickerDropdown({
  value,
  onChange,
  uploadedFontName,
  className = "",
}: FontPickerDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Preload catalog fonts so all previews render crisp immediately
  useEffect(() => {
    loadCatalogFonts();
  }, []);

  // Preload currently selected font
  useEffect(() => {
    if (value) {
      loadFontByName(value);
    }
  }, [value]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch("");
      setActiveTab("all");
    }
  }, [isOpen]);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Build unified font list
  const allFonts = useMemo(() => {
    const list: Array<FontEntry & { category: CategoryTab; categoryLabel: string }> = [];

    if (uploadedFontName) {
      list.push({
        name: uploadedFontName,
        label: uploadedFontName,
        category: "upload",
        categoryLabel: "Própria",
      });
    }

    FONT_CATALOG.serif.forEach((f) =>
      list.push({ ...f, category: "serif", categoryLabel: "Serifada" })
    );
    FONT_CATALOG.display.forEach((f) =>
      list.push({ ...f, category: "display", categoryLabel: "Display" })
    );
    FONT_CATALOG.sansSerif.forEach((f) =>
      list.push({ ...f, category: "sansSerif", categoryLabel: "Sans-Serif" })
    );
    FONT_CATALOG.mono.forEach((f) =>
      list.push({ ...f, category: "mono", categoryLabel: "Mono" })
    );

    return list;
  }, [uploadedFontName]);

  // Current font info
  const currentFontInfo = useMemo(() => {
    const match = allFonts.find((f) => f.name.toLowerCase() === value.toLowerCase());
    if (match) return match;
    return {
      name: value || "Inter",
      label: value || "Inter",
      category: "sansSerif" as CategoryTab,
      categoryLabel: "Padrão",
    };
  }, [allFonts, value]);

  // Filtered fonts
  const filteredFonts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allFonts.filter((f) => {
      const matchesCategory = activeTab === "all" || f.category === activeTab;
      const matchesSearch =
        !query ||
        f.label.toLowerCase().includes(query) ||
        f.categoryLabel.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [allFonts, activeTab, search]);

  const handleSelect = (fontName: string) => {
    loadFontByName(fontName);
    onChange(fontName);
    setIsOpen(false);
  };

  const tabs = useMemo(() => {
    if (uploadedFontName) {
      return [...CATEGORY_TABS, { id: "upload" as CategoryTab, label: "Próprias" }];
    }
    return CATEGORY_TABS;
  }, [uploadedFontName]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* ── Trigger Button ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border border-white/10 bg-[#12141A] hover:bg-white/6 transition-all text-left cursor-pointer group focus:outline-none focus:border-[oklch(0.78_0.22_48)]"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/50 group-hover:text-[oklch(0.78_0.22_48)] transition-colors">
            <Type size={13} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              style={{ fontFamily: currentFontInfo.name }}
              className="text-sm text-white font-medium truncate tracking-wide"
            >
              {currentFontInfo.label}
            </span>
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">
              {currentFontInfo.categoryLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            style={{ fontFamily: currentFontInfo.name }}
            className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded-md bg-white/5 border border-white/8 text-white/50"
          >
            Aa 123
          </span>
          <ChevronDown
            size={14}
            className={`text-white/50 transition-transform duration-200 ${
              isOpen ? "rotate-180 text-[oklch(0.78_0.22_48)]" : "group-hover:text-white"
            }`}
          />
        </div>
      </button>

      {/* ── Floating Dropdown Popover ── */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl bg-[#0f1118]/98 border border-white/15 shadow-2xl backdrop-blur-2xl p-2.5 space-y-2 max-h-[380px] flex flex-col animate-in fade-in zoom-in-95 duration-150">
          {/* Campo de Busca */}
          <div className="relative shrink-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tipografia..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)] transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Abas / Filtros de Categoria */}
          <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1 shrink-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? "bg-[oklch(0.78_0.22_48)] text-black font-semibold shadow-sm"
                      : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Lista de Fontes com Pré-Visualização */}
          <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-0.5">
            {filteredFonts.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/40 italic">
                Nenhuma tipografia encontrada para "{search}".
              </div>
            ) : (
              filteredFonts.map((font) => {
                const isSelected =
                  font.name.toLowerCase() === value.toLowerCase();

                return (
                  <button
                    key={font.name}
                    type="button"
                    onClick={() => handleSelect(font.name)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl transition-all text-left cursor-pointer group ${
                      isSelected
                        ? "bg-[oklch(0.78_0.22_48)]/15 border border-[oklch(0.78_0.22_48)]/40 text-white"
                        : "hover:bg-white/8 text-white/85 border border-transparent"
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span
                        style={{ fontFamily: font.name }}
                        className="text-[15px] font-normal tracking-wide text-white group-hover:text-[oklch(0.78_0.22_48)] transition-colors truncate"
                      >
                        {font.label}
                      </span>
                      <span className="text-[9px] text-white/40 font-mono uppercase tracking-wider">
                        {font.categoryLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        style={{ fontFamily: font.name }}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 border border-white/8 text-white/45 group-hover:text-white/80 transition-colors"
                      >
                        Ag 123
                      </span>
                      {isSelected && (
                        <Check size={14} className="text-[oklch(0.78_0.22_48)] shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
