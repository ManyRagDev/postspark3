/**
 * useExtractedStyles: Manage extracted styles from websites
 * Provides state management for temporary themes extracted from URLs
 */

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import type { TemporaryTheme, StyleExtractionResult } from "@shared/postspark";

interface UseExtractedStylesReturn {
    /** Extracted temporary themes */
    extractedThemes: TemporaryTheme[];

    /** The source URL for current themes */
    sourceUrl: string | null;

    /** Whether extraction is in progress */
    isExtracting: boolean;

    /** Whether a fallback was used (extraction failed) */
    fallbackUsed: boolean;

    /** Selected extracted theme IDs */
    selectedThemeIds: string[];

    /** Extract Brand DNA from a URL */
    extractStyles: (url: string) => Promise<{ brandDNA: any; themes: TemporaryTheme[]; fallbackUsed: boolean } | undefined>;

    /** Select/deselect a theme */
    toggleThemeSelection: (themeId: string) => void;

    /** Clear all extracted styles */
    clearExtractedStyles: () => void;

    /** Get selected themes */
    getSelectedThemes: () => TemporaryTheme[];
}

export function useExtractedStyles(): UseExtractedStylesReturn {
    const [extractedThemes, setExtractedThemes] = useState<TemporaryTheme[]>([]);
    const [sourceUrl, setSourceUrl] = useState<string | null>(null);
    const [fallbackUsed, setFallbackUsed] = useState(false);
    const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);

    // Use new Brand DNA extractor instead of old extractStyles
    const extractStylesMutation = trpc.post.extractBrandDNA.useMutation();

    const extractStyles = useCallback(async (url: string) => {
        // Normalize URL: add https:// if missing
        const normalizedUrl = url.startsWith('http://') || url.startsWith('https://')
            ? url
            : `https://${url}`;

        console.log("[useExtractedStyles] Starting extraction for:", normalizedUrl, "(original:", url, ")");

        // Clear previous themes immediately to avoid showing stale data
        setExtractedThemes([]);
        setSelectedThemeIds([]);
        setFallbackUsed(false);

        try {
            setSourceUrl(normalizedUrl);
            const result = await extractStylesMutation.mutateAsync({ url: normalizedUrl });

            console.log("[useExtractedStyles] Brand DNA extraction result:", {
                themesCount: result.themes.length,
                fallbackUsed: result.fallbackUsed,
                firstTheme: result.themes[0]?.label,
                brandDNA: result.brandDNA?.brandName,
            });

            setExtractedThemes(result.themes);
            setFallbackUsed(result.fallbackUsed);

            // Auto-select the first (highest confidence) theme
            if (result.themes.length > 0) {
                setSelectedThemeIds([result.themes[0].id]);
                console.log("[useExtractedStyles] Auto-selected theme:", result.themes[0].id);
            }
            return result;
        } catch (error) {
            console.error("[useExtractedStyles] Style extraction failed:", error);
            setExtractedThemes([]);
            setFallbackUsed(true);
            throw error;
        }
    }, [extractStylesMutation]);

    const toggleThemeSelection = useCallback((themeId: string) => {
        setSelectedThemeIds(prev => {
            if (prev.includes(themeId)) {
                return prev.filter(id => id !== themeId);
            }
            return [...prev, themeId];
        });
    }, []);

    const clearExtractedStyles = useCallback(() => {
        setExtractedThemes([]);
        setSourceUrl(null);
        setFallbackUsed(false);
        setSelectedThemeIds([]);
    }, []);

    const getSelectedThemes = useCallback(() => {
        return extractedThemes.filter(theme => selectedThemeIds.includes(theme.id));
    }, [extractedThemes, selectedThemeIds]);

    return {
        extractedThemes,
        sourceUrl,
        isExtracting: extractStylesMutation.isPending,
        fallbackUsed,
        selectedThemeIds,
        extractStyles,
        toggleThemeSelection,
        clearExtractedStyles,
        getSelectedThemes,
    };
}