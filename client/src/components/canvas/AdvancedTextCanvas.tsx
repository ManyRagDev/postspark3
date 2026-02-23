import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AdvancedTextNode, type AdvancedTextElement } from './AdvancedTextNode';
import { AdvancedTextSelectionBox } from './AdvancedTextSelectionBox';

interface AdvancedTextCanvasProps {
    elements: AdvancedTextElement[];
    onChange: (elements: AdvancedTextElement[]) => void;
    width: number | string;
    height: number | string;
}

export const AdvancedTextCanvas: React.FC<AdvancedTextCanvasProps> = ({
    elements,
    onChange,
    width,
    height
}) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // --- Selection & Deselection ---
    const handleSelect = (id: string, e?: React.MouseEvent | React.TouchEvent) => {
        e?.stopPropagation();
        setSelectedId(id);
    };

    const handleDeselect = () => {
        setSelectedId(null);
    };

    const selectedElement = elements.find(el => el.id === selectedId);

    // --- Text Node Updates ---
    const handleTextChange = (id: string, newText: string) => {
        onChange(elements.map(el => el.id === id ? { ...el, text: newText } : el));
    };

    // --- Resize & Rotate (Passed down to SelectionBox) ---
    const handleResize = (id: string, newWidth: number | 'auto', newHeight: number | 'auto', offset: { x: number, y: number }) => {
        onChange(elements.map(el => {
            if (el.id === id) {
                return { ...el, width: newWidth, height: newHeight, x: el.x + offset.x, y: el.y + offset.y };
            }
            return el;
        }));
    };

    const handleRotate = (id: string, newRotation: number) => {
        onChange(elements.map(el => el.id === id ? { ...el, rotation: newRotation } : el));
    };

    // --- Node Dragging (Simplified for component stub) ---
    // In a full implementation, this uses a custom hook like `useDragElement` 
    // or attaches mouse listeners during `onMouseDown` on the Node itself.

    // --- Zoom & Pan ---
    const handleWheel = useCallback((e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Zoom
            const zoomSensitivity = 0.001;
            const delta = -e.deltaY * zoomSensitivity;
            const newScale = Math.min(Math.max(0.1, scale + delta), 5);

            // Calculate pan adjustment for zooming toward cursor
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const cursorX = e.clientX - rect.left;
                const cursorY = e.clientY - rect.top;

                const scaleChange = newScale - scale;
                const newPanX = pan.x - (cursorX - pan.x) * (scaleChange / scale);
                const newPanY = pan.y - (cursorY - pan.y) * (scaleChange / scale);

                setScale(newScale);
                setPan({ x: newPanX, y: newPanY });
            }
        } else {
            // Option to Pan with scroll wheel when not holding Ctrl
            // setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
        }
    }, [scale, pan]);

    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
            return () => container.removeEventListener('wheel', handleWheel);
        }
    }, [handleWheel]);

    // Middle mouse pan
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            setIsPanning(true);
            document.body.style.cursor = 'grabbing';
        } else {
            handleDeselect();
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            setPan(prev => ({
                x: prev.x + e.movementX,
                y: prev.y + e.movementY
            }));
        }
    };

    const handleMouseUp = () => {
        if (isPanning) {
            setIsPanning(false);
            document.body.style.cursor = 'default';
        }
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full overflow-hidden bg-neutral-900 border border-white/10 rounded-2xl"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
                width,
                height,
                cursor: isPanning ? 'grabbing' : 'default'
            }}
        >
            <div
                ref={canvasRef}
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    width: '100%',
                    height: '100%'
                }}
            >
                {/* Render Text Nodes */}
                {elements.map(el => (
                    <AdvancedTextNode
                        key={el.id}
                        element={el}
                        isSelected={selectedId === el.id}
                        onSelect={(e) => handleSelect(el.id, e)}
                        onChange={handleTextChange}
                        scale={scale}
                    />
                ))}

                {/* Render Selection Box on top of the selected node */}
                {selectedElement && (
                    <AdvancedTextSelectionBox
                        element={selectedElement}
                        onResize={handleResize}
                        onRotate={handleRotate}
                        scale={scale}
                        canvasRect={canvasRef.current?.getBoundingClientRect() || null}
                    />
                )}
            </div>

            {/* Helper UI */}
            <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[10px] text-white/70 font-mono">
                {Math.round(scale * 100)}%
            </div>
        </div>
    );
};
