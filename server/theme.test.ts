import { describe, expect, it } from "vitest";
import { THEMES, getTheme, getThemesByCategory, createBrandTheme, applyThemeStyles } from "../client/src/lib/themes";
import { generateCardThemeVariations } from "./chameleon";

describe("ThemeEngine", () => {
  it("should have 8 themes defined", () => {
    expect(THEMES).toHaveLength(8);
  });

  it("should have correct theme IDs", () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids).toContain("cyber-core");
    expect(ids).toContain("morning-paper");
    expect(ids).toContain("swiss-modern");
    expect(ids).toContain("bold-hype");
    expect(ids).toContain("y2k-glitch");
    expect(ids).toContain("eco-zen");
    expect(ids).toContain("dark-academia");
    expect(ids).toContain("velvet-noir");
  });

  it("should get theme by ID", () => {
    const theme = getTheme("cyber-core");
    expect(theme).toBeDefined();
    expect(theme?.label).toBe("Cyber Core");
    expect(theme?.colors.bg).toBe("#000000");
    expect(theme?.colors.text).toBe("#00FF41");
  });

  it("should return undefined for non-existent theme", () => {
    const theme = getTheme("non-existent");
    expect(theme).toBeUndefined();
  });

  it("should get themes by category", () => {
    const brandThemes = getThemesByCategory("brand");
    expect(brandThemes.length).toBeGreaterThan(0);
    expect(brandThemes.every((t) => t.category === "brand")).toBe(true);

    const disruptiveThemes = getThemesByCategory("disruptive");
    expect(disruptiveThemes.length).toBeGreaterThan(0);
    expect(disruptiveThemes.every((t) => t.category === "disruptive")).toBe(true);
  });

  it("should create custom brand theme", () => {
    const customTheme = createBrandTheme(
      { primary: "#FF0000", secondary: "#00FF00" },
      "sans"
    );

    expect(customTheme.id).toBe("brand-custom");
    expect(customTheme.colors.accent).toBe("#FF0000");
    expect(customTheme.colors.bg).toBe("#00FF00");
  });

  it("should apply theme styles correctly", () => {
    const theme = getTheme("cyber-core")!;
    const styles = applyThemeStyles(theme);

    expect(styles.backgroundColor).toBe("#000000");
    expect(styles.color).toBe("#00FF41");
    expect(styles.textAlign).toBe("left");
    expect(styles.borderRadius).toBe("0");
  });

  it("should have correct typography for each theme", () => {
    const themes = THEMES;
    themes.forEach((theme) => {
      expect(theme.typography.headingFont).toBeDefined();
      expect(theme.typography.bodyFont).toBeDefined();
      expect(theme.typography.headingSize).toBeDefined();
      expect(theme.typography.bodySize).toBeDefined();
    });
  });

  it("should have color properties for each theme", () => {
    const themes = THEMES;
    themes.forEach((theme) => {
      expect(theme.colors.bg).toBeDefined();
      expect(theme.colors.text).toBeDefined();
      expect(theme.colors.accent).toBeDefined();
      expect(theme.colors.surface).toBeDefined();
    });
  });
});

describe("ChameleonProtocol", () => {
  it("should generate 3 card theme variations", () => {
    const brandAnalysis = {
      brandColors: { primary: "#FF0000", secondary: "#FFFFFF" },
      fontCategory: "sans" as const,
      summary: "Test brand",
      brandName: "Test",
    };

    const variations = generateCardThemeVariations(brandAnalysis);
    expect(variations).toHaveLength(3);
  });

  it("should have correct variation types", () => {
    const brandAnalysis = {
      brandColors: { primary: "#FF0000", secondary: "#FFFFFF" },
      fontCategory: "sans" as const,
      summary: "Test brand",
      brandName: "Test",
    };

    const variations = generateCardThemeVariations(brandAnalysis);
    expect(variations[0].type).toBe("brand-match");
    expect(variations[1].type).toBe("remix-safe");
    expect(variations[2].type).toBe("remix-disruptive");
  });

  it("should assign correct theme IDs to variations", () => {
    const brandAnalysis = {
      brandColors: { primary: "#FF0000", secondary: "#FFFFFF" },
      fontCategory: "sans" as const,
      summary: "Test brand",
      brandName: "Test",
    };

    const variations = generateCardThemeVariations(brandAnalysis);
    expect(variations[0].themeId).toBe("brand-custom");
    expect(variations[1].themeId).toBe("swiss-modern");
    expect(variations[2].themeId).toBe("cyber-core");
  });
});
