import { marked } from "marked";

import "./agentMarkdown.css";

marked.setOptions({ breaks: true, gfm: true });

// LLMs sometimes wrap chunks of their reply in ```markdown ... ``` (or
// language-less ``` ... ```) fences. marked then renders the wrapped
// content as a literal code block — bold and bullets show up as raw
// asterisks/dashes. Strip such wrapper fences here. Keep fences that
// declare a real code language (python/json/etc.) since those are
// genuine code samples we want to preserve.
function unwrapOuterFence(src: string): string {
  return src.replace(
    /```([a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)\n?```/g,
    (full, lang: string, inner: string) => {
      const l = (lang || "").toLowerCase();
      if (l === "" || l === "markdown" || l === "md") return inner;
      return full;
    },
  );
}

/** Render an assistant chat message as HTML. Apply via dangerouslySetInnerHTML
 * inside a container whose className is "ai-md" so the shared CSS applies. */
export function renderAssistantMarkdown(src: string): string {
  try {
    return marked.parse(unwrapOuterFence(src)) as string;
  } catch {
    return src;
  }
}
