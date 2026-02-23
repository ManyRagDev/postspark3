import React, { useRef, useEffect } from 'react';
import type { AdvancedTextElement } from './AdvancedTextNode';

interface AdvancedTextSelectionBoxProps {
    element: AdvancedTextElement;
    onResize: (id: string, newWidth: number | 'auto', newHeight: number | 'auto', offset: { x: number, y: number }) => void;
    onRotate: (id: string, newRotation: number) => void;
    scale: number;
    canvasRect: DOMRect | null;
}

export const AdvancedTextSelectionBox: React.FC<AdvancedTextSelectionBoxProps> = ({
    element,
    onResize,
    onRotate,
    scale,
    canvasRect
}) => {
    const boxRef = useRef<HTMLDivElement>(null);

    // Use the same coordinate system and rotation as the text node
    const transformStyle = `translate(${element.x}px, ${element.y}px) rotate(${element.rotation}deg)`;

    // Base handles for resizing based on the original snippet
    const handles = [
        { id: 'tl', cursor: 'nwse-resize', style: { top: -6, left: -6 } },
        { id: 'tm', cursor: 'ns-resize', style: { top: -6, left: '50%', transform: 'translateX(-50%)' } },
        { id: 'tr', cursor: 'nesw-resize', style: { top: -6, right: -6 } },
        { id: 'ml', cursor: 'ew-resize', style: { top: '50%', left: -6, transform: 'translateY(-50%)' } },
        { id: 'mr', cursor: 'ew-resize', style: { top: '50%', right: -6, transform: 'translateY(-50%)' } },
        { id: 'bl', cursor: 'nesw-resize', style: { bottom: -6, left: -6 } },
        { id: 'bm', cursor: 'ns-resize', style: { bottom: -6, left: '50%', transform: 'translateX(-50%)' } },
        { id: 'br', cursor: 'nwse-resize', style: { bottom: -6, right: -6 } }
    ];

    const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, handleId: string) => {
        e.stopPropagation();
        e.preventDefault();

        // In a full implementation, this would track mouse moves on the document
        // and calculate delta width/height based on the handle pulled, accounting for rotation.
        // This is a placeholder for the complex math required for rotated box resizing.
        console.log(`Started resizing from ${handleId}`);

        // Simulating a simple width change for demonstration
        // onResize(element.id, typeof element.width === 'number' ? element.width + 10 : 100, element.height, {x:0, y:0});
    };

    const handleRotateStart = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        e.preventDefault();

        // Placeholder for rotation math. Calculate angle between box center and mouse position.
        console.log('Started rotating');
        // onRotate(element.id, element.rotation + 15);
    };

    return (
        <div
            ref={boxRef}
            className="absolute pointer-events-none z-[101]"
            style={{
                transform: transformStyle,
                transformOrigin: 'top left',
                width: element.width === 'auto' ? 'auto' : `${element.width}px`,
                height: element.height === 'auto' ? 'auto' : `${element.height}px`,
                border: '2px solid #a855f7', // accentColor
                boxSizing: 'border-box'
            }}
        >
            {/* Rotation Handle Line */}
            <div
                className="absolute w-[2px] h-6 bg-[#a855f7]"
                style={{ top: -24, left: '50%', transform: 'translateX(-50%)' }}
            />

            {/* Rotation Handle */}
            <div
                className="absolute w-4 h-4 rounded-full bg-white border-2 border-[#a855f7] cursor-crosshair pointer-events-auto"
                style={{ top: -30, left: '50%', transform: 'translateX(-50%)' }}
                onMouseDown={handleRotateStart}
                onTouchStart={handleRotateStart}
            />

            {/* Resize Handles */}
            {handles.map(handle => (
                <div
                    key={handle.id}
                    className="absolute w-3 h-3 rounded-full bg-white border-2 border-[#a855f7] pointer-events-auto"
                    style={{
                        ...handle.style,
                        cursor: handle.cursor
                    }}
                    onMouseDown={(e) => handleResizeStart(e, handle.id)}
                    onTouchStart={(e) => handleResizeStart(e, handle.id)}
                />
            ))}
        </div>
    );
};
