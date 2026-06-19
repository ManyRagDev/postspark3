/**
 * ImageElementBlock — Componente para imagens draggable no canvas.
 *
 * Funcionalidades:
 * - Arrasto livre via pointer events
 * - Redimensionamento com 8 handles (4 cantos + 4 bordas)
 * - Lixeira visual quando selecionado
 * - Outline e feedback visual
 */

import React, { useRef, useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

export interface ImageElement {
    id: string;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number | 'auto';
    rotation: number;
    source?: 'upload' | 'url';
}

interface ImageElementBlockProps {
    element: ImageElement;
    isSelected: boolean;
    onSelect: () => void;
    onDeselect: () => void;
    onUpdate: (patch: Partial<ImageElement>) => void;
    onDelete: () => void;
    containerRef: React.RefObject<HTMLElement>;
    accentColor: string;
}

const HANDLE_SIZE = 10;
const HANDLE_OFFSET = HANDLE_SIZE / 2;

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const ImageElementBlock: React.FC<ImageElementBlockProps> = ({
    element,
    isSelected,
    onSelect,
    onDeselect,
    onUpdate,
    onDelete,
    containerRef,
    accentColor,
}) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        elementX: number;
        elementY: number;
        width: number;
        height: number;
        direction: ResizeDirection;
        parentWidth: number;
        parentHeight: number;
    } | null>(null);

    const [currentSize, setCurrentSize] = useState<{ width: number; height: number }>({
        width: element.width,
        height: typeof element.height === 'number' ? element.height : element.width,
    });

    // Recalcular tamanho quando o elemento muda
    useEffect(() => {
        setCurrentSize({
            width: element.width,
            height: typeof element.height === 'number' ? element.height : element.width,
        });
    }, [element.width, element.height]);

    // Click outside to deselect
    useEffect(() => {
        if (!isSelected) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Ignorar cliques em elementos interativos (botões, inputs, etc.)
            if (target.closest('button, input, textarea, select, [data-resize-handle]')) {
                return;
            }
            // Verificar se o clique foi fora deste elemento
            if (nodeRef.current && !nodeRef.current.contains(target)) {
                onDeselect();
            }
        };

        // Usar mousedown para capturar antes de outros eventos
        document.addEventListener('mousedown', handleClickOutside, true); // capture phase
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [isSelected, onDeselect]);

    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        // Não propagar para não acionar outros handlers
        event.stopPropagation();
        // Se já estiver selecionado, não precisa fazer nada
        if (isSelected) return;
        onSelect();
    };

    const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (!isSelected) {
            onSelect();
        }
        nodeRef.current?.setPointerCapture(event.pointerId);

        const offsetParent = nodeRef.current?.offsetParent as HTMLElement | null;
        interactionRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            elementX: element.x,
            elementY: element.y,
            width: currentSize.width,
            height: currentSize.height,
            direction: 'e', // placeholder para drag
            parentWidth: offsetParent?.clientWidth ?? Number.POSITIVE_INFINITY,
            parentHeight: offsetParent?.clientHeight ?? Number.POSITIVE_INFINITY,
        };
    };

    const startResize = (event: React.PointerEvent<HTMLDivElement>, direction: ResizeDirection) => {
        event.stopPropagation();
        onSelect();
        nodeRef.current?.setPointerCapture(event.pointerId);

        const offsetParent = nodeRef.current?.offsetParent as HTMLElement | null;
        interactionRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            elementX: element.x,
            elementY: element.y,
            width: currentSize.width,
            height: currentSize.height,
            direction,
            parentWidth: offsetParent?.clientWidth ?? Number.POSITIVE_INFINITY,
            parentHeight: offsetParent?.clientHeight ?? Number.POSITIVE_INFINITY,
        };
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const interaction = interactionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        // DRAG: mover elemento
        if (interaction.direction === 'e') {
            const newX = interaction.elementX + deltaX;
            const newY = interaction.elementY + deltaY;

            onUpdate({
                x: Math.max(0, Math.min(interaction.parentWidth - currentSize.width, newX)),
                y: Math.max(0, Math.min(interaction.parentHeight - currentSize.height, newY)),
            });
            return;
        }

        // RESIZE: redimensionar basedo na direção
        const minWidth = 40;
        const minHeight = 40;

        let newWidth = interaction.width;
        let newHeight = interaction.height;
        let newX = interaction.elementX;
        let newY = interaction.elementY;

        // Processar redimensionamento baseado na direção
        if (interaction.direction.includes('e')) {
            newWidth = Math.max(minWidth, interaction.width + deltaX);
        }
        if (interaction.direction.includes('w')) {
            newWidth = Math.max(minWidth, interaction.width - deltaX);
            newX = interaction.elementX + (interaction.width - newWidth);
        }
        if (interaction.direction.includes('s')) {
            newHeight = Math.max(minHeight, interaction.height + deltaY);
        }
        if (interaction.direction.includes('n')) {
            newHeight = Math.max(minHeight, interaction.height - deltaY);
            newY = interaction.elementY + (interaction.height - newHeight);
        }

        // Limitar às bordas do parent
        if (newX < 0) {
            newWidth += newX;
            newX = 0;
        }
        if (newY < 0) {
            newHeight += newY;
            newY = 0;
        }

        setCurrentSize({ width: newWidth, height: newHeight });

        const update: Partial<ImageElement> = { width: newWidth };
        if (element.height !== 'auto') {
            update.height = newHeight;
        }
        if (newX !== interaction.elementX) {
            update.x = newX;
        }
        if (newY !== interaction.elementY) {
            update.y = newY;
        }

        onUpdate(update);
    };

    const finishInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
        if (interactionRef.current?.pointerId === event.pointerId) {
            interactionRef.current = null;
            if (nodeRef.current?.hasPointerCapture(event.pointerId)) {
                nodeRef.current.releasePointerCapture(event.pointerId);
            }
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete();
    };

    const transformStyle = `translate(${element.x}px, ${element.y}px) rotate(${element.rotation}deg)`;

    // Configurações dos 8 handles
    const handles: { dir: ResizeDirection; cursor: string; position: React.CSSProperties }[] = [
        // Cantos
        { dir: 'nw', cursor: 'nw-resize', position: { top: -HANDLE_OFFSET, left: -HANDLE_OFFSET } },
        { dir: 'ne', cursor: 'ne-resize', position: { top: -HANDLE_OFFSET, right: -HANDLE_OFFSET } },
        { dir: 'se', cursor: 'se-resize', position: { bottom: -HANDLE_OFFSET, right: -HANDLE_OFFSET } },
        { dir: 'sw', cursor: 'sw-resize', position: { bottom: -HANDLE_OFFSET, left: -HANDLE_OFFSET } },
        // Bordas
        { dir: 'n', cursor: 'n-resize', position: { top: -HANDLE_OFFSET, left: '50%', transform: 'translateX(-50%)' } },
        { dir: 's', cursor: 's-resize', position: { bottom: -HANDLE_OFFSET, left: '50%', transform: 'translateX(-50%)' } },
        { dir: 'w', cursor: 'w-resize', position: { top: '50%', left: -HANDLE_OFFSET, transform: 'translateY(-50%)' } },
        { dir: 'e', cursor: 'e-resize', position: { top: '50%', right: -HANDLE_OFFSET, transform: 'translateY(-50%)' } },
    ];

    return (
        <div
            ref={nodeRef}
            data-layout-id={`imageElement:${element.id}`}
            className="absolute select-none"
            style={{
                transform: transformStyle,
                transformOrigin: 'top left',
                left: '0',
                top: '0',
                width: `${currentSize.width}px`,
                height: typeof currentSize.height === 'number' ? `${currentSize.height}px` : 'auto',
                zIndex: isSelected ? 100 : 10,
                pointerEvents: 'auto',
            }}
            onClick={handleClick}
            onPointerDown={startDrag}
            onPointerMove={handlePointerMove}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
        >
            {/* Container da imagem */}
            <div
                className="relative w-full h-full overflow-hidden"
                style={{
                    outline: isSelected ? `2px solid ${accentColor}` : 'none',
                    outlineOffset: '2px',
                    borderRadius: '4px',
                }}
            >
                <img
                    src={element.url}
                    alt="Elemento de imagem"
                    className="w-full h-full object-contain pointer-events-none"
                    draggable={false}
                    style={{
                        display: 'block',
                        userSelect: 'none',
                    }}
                />

                {/* Handles de redimensionamento (8 handles quando selecionado) */}
                {isSelected && (
                    <>
                        {handles.map(({ dir, cursor, position }) => (
                            <div
                                key={dir}
                                data-resize-handle={dir}
                                className="absolute"
                                style={{
                                    width: `${HANDLE_SIZE}px`,
                                    height: `${HANDLE_SIZE}px`,
                                    background: accentColor,
                                    border: '2px solid white',
                                    borderRadius: '2px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                    cursor,
                                    ...position,
                                }}
                                onPointerDown={(e) => startResize(e, dir)}
                            />
                        ))}
                    </>
                )}

                {/* Lixeira (apenas quando selecionado) */}
                {isSelected && (
                    <button
                        onClick={handleDelete}
                        className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-red-500
                                  flex items-center justify-center shadow-lg
                                  hover:bg-red-600 transition-colors z-50"
                        style={{
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            border: '2px solid white',
                        }}
                        title="Remover imagem"
                    >
                        <Trash2 size={12} color="#fff" />
                    </button>
                )}
            </div>
        </div>
    );
};
