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
    scale: number;
}

export const AdvancedTextNode: React.FC<AdvancedTextNodeProps> = ({
    element,
    isSelected,
    onSelect,
    onChange,
    scale,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const editableRef = useRef<HTMLDivElement>(null);

    const handleDoubleClick = (e: React.MouseEvent | React.TouchEvent) => {
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

    return (
        <div
            className="absolute cursor-move select-none"
            style={{
                transform: transformStyle,
                transformOrigin: 'top left',
                width: element.width === 'auto' ? 'auto' : `${element.width}px`,
                height: element.height === 'auto' ? 'auto' : `${element.height}px`,
                zIndex: isSelected ? 100 : 1,
            }}
            onMouseDown={!isEditing ? onSelect : undefined}
            onTouchStart={!isEditing ? onSelect : undefined}
            onDoubleClick={handleDoubleClick}
        >
            <div
                ref={editableRef}
                contentEditable={isEditing}
                suppressContentEditableWarning={true}
                onBlur={handleBlur}
                className={`w-full h-full min-w-[20px] min-h-[20px] outline-none ${isEditing ? 'cursor-text' : 'cursor-move'}`}
                style={{
                    ...element.styles,
                    fontSize: `${parseFloat(element.styles.fontSize) * scale}px`, // Apply zoom scale
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    padding: '2px', // Slight padding for editing comfort
                    border: isEditing ? '1px dashed rgba(255,255,255,0.5)' : 'none',
                }}
            >
                {element.text}
            </div>
        </div>
    );
};
