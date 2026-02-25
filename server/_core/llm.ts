import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () => {
  // Google AI Studio (OpenAI-compatible endpoint)
  if (ENV.geminiApiKey) {
    return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  }
  // Optional: custom Forge API URL from env
  if (ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0) {
    return `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }
  throw new Error("Nenhuma API configurada. Defina GEMINI_API_KEY no .env");
};

const resolveApiKey = () => ENV.geminiApiKey || ENV.forgeApiKey;

const assertApiKey = () => {
  if (!resolveApiKey()) {
    throw new Error("Nenhuma API key configurada. Defina GEMINI_API_KEY no .env");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: "gemini-2.5-flash",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 8192;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  try {
    const response = await fetch(resolveApiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${resolveApiKey()}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Gemini API failed: ${response.status} ${response.statusText} – ${errorText}`
      );
    }

    return (await response.json()) as InvokeResult;
  } catch (error) {
    console.warn("LLM invocation failed with primary API, falling back to Groq...", error);

    if (!ENV.groqApiKey) {
      console.warn("GROQ_API_KEY is not configured, cannot use fallback.");
      throw error; // Re-throw the original error
    }

    const groqPayload: Record<string, unknown> = {
      ...payload,
      model: "llama-3.3-70b-versatile",
    };

    // Groq's model doesn't support json_schema 
    if ((groqPayload.response_format as any)?.type === "json_schema") {
      const originalSchema = (groqPayload.response_format as any).json_schema.schema;
      groqPayload.response_format = { type: "json_object" };

      if (originalSchema && Array.isArray(groqPayload.messages)) {
        const sysMsg = groqPayload.messages.find((m: any) => m.role === "system");

        // We extract the descriptions from the schema to build a more semantic prompt for Groq
        const schemaInstruction = `
        
CRITICAL INSTRUCTION FOR LLM:
You MUST return a strictly valid JSON Object. No markdown, no conversational text before or after.
Your JSON must match this structure exactly, keeping all keys:
{
  "variations": [
    {
      "headline": "Título chamativo do post",
      "body": "Corpo principal do post",
      "hashtags": ["#tag1", "#tag2"],
      "callToAction": "Call to action final",
      "caption": "Legenda do post para a rede social, máximo 300 caracteres",
      "tone": "Tom do post",
      "imagePrompt": "Prompt em inglês para gerar imagem de fundo do post. Deve ser visual, artístico e relevante ao conteúdo.",
      "backgroundColor": "Cor de fundo em formato hex",
      "textColor": "Cor do texto em formato hex",
      "accentColor": "Cor de destaque em formato hex",
      "layout": "centered | left-aligned | split | minimal",
      "aspectRatio": "1:1 | 5:6 | 9:16",
      "aspectRatioOptimizations": {
        "1:1": { "layout": "...", "backgroundColor": "...", "textColor": "...", "accentColor": "...", "headlineFontSize": 1, "bodyFontSize": 1 },
        "5:6": { "layout": "...", "backgroundColor": "...", "textColor": "...", "accentColor": "...", "headlineFontSize": 1, "bodyFontSize": 1 },
        "9:16": { "layout": "...", "backgroundColor": "...", "textColor": "...", "accentColor": "...", "headlineFontSize": 1, "bodyFontSize": 1 }
      }
    }
  ]
}

Note: If generating a Carousel, you must also include a "slides" array in each variation, where each slide has:
{ "headline": "...", "body": "...", "slideNumber": 1, "isTitleSlide": true, "isCtaSlide": false }
`;

        if (sysMsg) {
          if (typeof sysMsg.content === "string") sysMsg.content += schemaInstruction;
        } else {
          groqPayload.messages.push({ role: "system", content: schemaInstruction });
        }
      }
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.groqApiKey}`,
      },
      body: JSON.stringify(groqPayload),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      throw new Error(
        `Groq fallback failed: ${groqResponse.status} ${groqResponse.statusText} – ${errorText}`
      );
    }

    return (await groqResponse.json()) as InvokeResult;
  }
}
