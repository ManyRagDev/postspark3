import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import StudioCreateView from "../../client/src/pages/StudioApp/components/v2/StudioCreateViewV2B";
import "../../client/src/index.css";

function Journey() {
  const [project, setProject] = useState<string | null>(
    "11111111-1111-4111-8111-111111111111"
  );
  const [family, setFamily] = useState<string | null>(null);
  return (
    <StudioCreateView
      isLoading={false}
      declaredFamilyId={family}
      onDeclareFamily={setFamily}
      selectedProjectId={project}
      onSelectProjectId={setProject}
      initialPrompt={
        "Slide 1:\nMeu conteúdo pronto.\n\nSlide 2:\nO segundo slide."
      }
      onSubmit={(prompt, mode, options) => {
        (window as any).__identitySubmission = { prompt, mode, options };
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(<Journey />);
