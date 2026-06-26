/**
 * FloatingImageMenu — Menu flutuante para upload de imagens no canvas.
 *
 * Posicionado sobre o canvas, permite ao usuário fazer upload de imagens
 * que se tornam elementos draggable.
 */

import React, { useRef } from 'react';
import { ImagePlus } from 'lucide-react';

interface FloatingImageMenuProps {
    onUpload: (file: File) => void;
    accentColor: string;
}

export const FloatingImageMenu: React.FC<FloatingImageMenuProps> = ({
    onUpload,
    accentColor,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar que é uma imagem
        if (!file.type.startsWith('image/')) {
            console.warn('Por favor, selecione um arquivo de imagem válido.');
            return;
        }

        onUpload(file);

        // Reset para permitir selecionar o mesmo arquivo novamente
        e.target.value = '';
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="pointer-events-auto">

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
            />
            <button
                onClick={handleClick}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold
                          transition-all duration-300 hover:scale-105 active:scale-95
                          shadow-lg backdrop-blur-md"
                style={{
                    background: `${accentColor}15`,
                    border: `1px solid ${accentColor}40`,
                    color: accentColor,
                    boxShadow: `0 4px 12px ${accentColor}20`,
                }}
                title="Adicionar imagem ao canvas"
            >
                <ImagePlus size={14} />
                <span>Adicionar Imagem</span>
            </button>
        </div>
    );
};
