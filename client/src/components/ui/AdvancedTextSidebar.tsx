import React from 'react';
import { Type, Image as ImageIcon, Briefcase, Layers, ArrowUpToLine, ArrowDownToLine, Trash2, GripHorizontal } from 'lucide-react';

interface AdvancedTextSidebarProps {
    onAddText: () => void;
    onLayerUp: () => void;
    onLayerDown: () => void;
    onDelete: () => void;
    hasSelection: boolean;
    accentColor?: string;
}

export const AdvancedTextSidebar: React.FC<AdvancedTextSidebarProps> = ({
    onAddText,
    onLayerUp,
    onLayerDown,
    onDelete,
    hasSelection,
    accentColor = '#a855f7'
}) => {
    return (
        <div className="w-14 py-3 flex flex-col items-center gap-3">
            {/* Handle Drag */}
            <div className="w-full h-4 flex items-center justify-center text-white/20 mb-1">
                <GripHorizontal size={14} />
            </div>

            {/* Creation Tools */}
            <button
                onClick={onAddText}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/10"
                title="Adicionar Texto"
            >
                <Type size={18} className="text-white" />
            </button>

            <div className="w-8 h-px bg-white/10 my-2" />

            {/* Layer Controls (Contextual) */}
            <button
                onClick={onLayerUp}
                disabled={!hasSelection}
                className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${hasSelection ? 'hover:bg-white/10 text-white' : 'opacity-30 cursor-not-allowed text-white/50'
                    }`}
                title="Trazer para Frente"
            >
                <ArrowUpToLine size={16} />
            </button>

            <button
                onClick={onLayerDown}
                disabled={!hasSelection}
                className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${hasSelection ? 'hover:bg-white/10 text-white' : 'opacity-30 cursor-not-allowed text-white/50'
                    }`}
                title="Enviar para Fundo"
            >
                <ArrowDownToLine size={16} />
            </button>

            {/* Destructive Actions */}
            <button
                onClick={onDelete}
                disabled={!hasSelection}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${hasSelection ? 'hover:bg-red-500/20 text-red-400' : 'opacity-30 cursor-not-allowed text-white/50'
                    }`}
                title="Excluir Selecionado (Del)"
            >
                <Trash2 size={18} />
            </button>
        </div>
    );
};
