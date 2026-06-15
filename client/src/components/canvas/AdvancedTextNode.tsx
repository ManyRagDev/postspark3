import React, { useState, useRef, useEffect } from 'react';

export interface AdvancedTextElement {
    id: string;
    text: string;
    x: number;
    y: number;
    width: number | 'auto';
    height: number | 'auto';
    rotation: number;
    styles: {
        fontSize: string;
        fontFamily: string;
        color: string;
        fontWeight: string;
        fontStyle: string;
        textDecoration: string;
        textAlign: any;
        lineHeight: string;
        opacity: string;
    };
}

interface AdvancedTextNodeProps {
    element: AdvancedTextElement;
    isSelected: boolean;
    onSelect: (e: React.MouseEvent | React.TouchEvent) => void;
    onChange: (id: string, newText: string) => void;
    onElementChange?: (id: string, patch: Partial<AdvancedTextElement>) => void;
    scale: number;
    editable?: boolean;
}

export const AdvancedTextNode: React.FC<AdvancedTextNodeProps> = ({
    element,
    isSelected,
    onSelect,
    onChange,
    onElementChange,
    scale,
    editable = true,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const nodeRef = useRef<HTMLDivElement>(null);
    const editableRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef<{
        type: 'drag' | 'resize';
        pointerId: number;
        startX: number;
        startY: number;
        elementX: number;
        elementY: number;
        width: number;
        height: number;
        renderScale: number;
        parentWidth: number;
        parentHeight: number;
    } | null>(null);

    const handleDoubleClick = (e: React.MouseEvent | React.TouchEvent) => {
        if (!editable) return;
        e.stopPropagation();
        setIsEditing(true);

        // Set focus and move caret to end
        setTimeout(() => {
            if (editableRef.current) {
                editableRef.current.focus();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(editableRef.current);
                range.collapse(false);
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
        }, 0);
    };

    const handleBlur = () => {
        setIsEditing(false);
        if (editableRef.current) {
            onChange(element.id, editableRef.current.innerText || 'Texto');
        }
    };

    useEffect(() => {
        if (!isSelected && isEditing) {
            setIsEditing(false);
            if (editableRef.current) {
                onChange(element.id, editableRef.current.innerText || 'Texto');
            }
        }
    }, [isSelected, isEditing, element.id, onChange]);

    const transformStyle = `translate(${element.x}px, ${element.y}px) rotate(${element.rotation}deg)`;

    const startInteraction = (event: React.PointerEvent<HTMLDivElement>, type: 'drag' | 'resize') => {
        if (!editable || isEditing) return;
        event.stopPropagation();
        onSelect(event as unknown as React.MouseEvent);
        if (!onElementChange) return;
        nodeRef.current?.setPointerCapture(event.pointerId);
        const bounds = editableRef.current?.getBoundingClientRect();
        const offsetParent = nodeRef.current?.offsetParent as HTMLElement | null;
        const parentBounds = offsetParent?.getBoundingClientRect();
        const renderScale = offsetParent?.clientWidth && parentBounds
            ? parentBounds.width / offsetParent.clientWidth
            : scale;
        interactionRef.current = {
            type,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            elementX: element.x,
            elementY: element.y,
            width: element.width === 'auto' ? (bounds?.width ?? 80) / (renderScale || 1) : element.width,
            height: element.height === 'auto' ? (bounds?.height ?? 32) / (renderScale || 1) : element.height,
            renderScale: renderScale || 1,
            parentWidth: offsetParent?.clientWidth ?? Number.POSITIVE_INFINITY,
            parentHeight: offsetParent?.clientHeight ?? Number.POSITIVE_INFINITY,
        };
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const interaction = interactionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId || !onElementChange) return;
        const deltaX = (event.clientX - interaction.startX) / interaction.renderScale;
        const deltaY = (event.clientY - interaction.startY) / interaction.renderScale;

        if (interaction.type === 'drag') {
            onElementChange(element.id, {
                x: Math.min(
                    Math.max(0, interaction.parentWidth - interaction.width),
                    Math.max(0, interaction.elementX + deltaX),
                ),
                y: Math.min(
                    Math.max(0, interaction.parentHeight - interaction.height),
                    Math.max(0, interaction.elementY + deltaY),
                ),
            });
            return;
        }

        onElementChange(element.id, {
            width: Math.min(
                interaction.parentWidth - interaction.elementX,
                Math.max(24, interaction.width + deltaX),
            ),
            height: Math.min(
                interaction.parentHeight - interaction.elementY,
                Math.max(20, interaction.height + deltaY),
            ),
        });
    };

    const finishInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
        if (interactionRef.current?.pointerId === event.pointerId) {
            interactionRef.current = null;
            if (nodeRef.current?.hasPointerCapture(event.pointerId)) {
                nodeRef.current.releasePointerCapture(event.pointerId);
            }
        }
    };

    return (
        <div
            ref={nodeRef}
            data-layout-id={`textElement:${element.id}`}
            className={`absolute select-none ${editable ? 'pointer-events-auto cursor-move' : 'pointer-events-none'}`}
            style={{
                transform: transformStyle,
                transformOrigin: 'top left',
                width: element.width === 'auto' ? 'auto' : `${element.width}px`,
                height: element.height === 'auto' ? 'auto' : `${element.height}px`,
                zIndex: isSelected ? 100 : 1,
            }}
            onDoubleClick={handleDoubleClick}
            onPointerDown={(event) => startInteraction(event, 'drag')}
            onPointerMove={handlePointerMove}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
        >
            <div
                ref={editableRef}
                contentEditable={editable && isEditing}
                suppressContentEditableWarning={true}
                onBlur={handleBlur}
                className={`w-full h-full min-w-[20px] min-h-[20px] outline-none ${isEditing ? 'cursor-text' : editable ? 'cursor-move' : 'cursor-default'}`}
                style={{
                    ...element.styles,
                    fontSize: `${parseFloat(element.styles.fontSize) * scale}px`, // Apply zoom scale
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    padding: '2px', // Slight padding for editing comfort
                    border: isEditing || isSelected ? '1px dashed rgba(255,255,255,0.65)' : 'none',
                }}
            >
                {element.text}
            </div>
            {editable && onElementChange && isSelected && !isEditing && (
                <div
                    role="presentation"
                    data-resize-handle
                    className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm border border-black/60 bg-white shadow"
                    style={{ cursor: 'nwse-resize' }}
                    onPointerDown={(event) => startInteraction(event, 'resize')}
                />
            )}
        </div>
    );
};
