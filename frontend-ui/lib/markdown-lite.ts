/**
 * Lightweight Markdown-to-HTML parser for chat messages.
 * Supports: bold (**), italic (*), ordered lists, line breaks, and basic links.
 * No external dependencies. Safe for dangerouslySetInnerHTML.
 */
export function markdownToHtml(text: string): string {
  if (!text) return "";

  // Escape HTML entities to prevent XSS from raw < > &
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Parse links: [text](url)
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-cyan-300 underline hover:text-cyan-200">$1</a>'
  );

  // Split into blocks (paragraphs / lists) by double newlines
  const blocks = html.split(/\n\n+/);

  const processedBlocks = blocks.map((block) => {
    const lines = block.split("\n");

    // Detect ordered list: lines starting with "1. ", "2. ", etc.
    const isOrderedList = lines.every((line) => /^\d+\.\s/.test(line.trim()));

    if (isOrderedList && lines.length > 0) {
      const listItems = lines
        .map((line) => {
          const content = line.replace(/^\d+\.\s*/, "").trim();
          const formatted = formatInline(content);
          return `<li class="text-sm leading-6 text-slate-100">${formatted}</li>`;
        })
        .join("");
      return `<ol class="mb-2 list-decimal space-y-1 pl-5 text-sm text-slate-100 last:mb-0">${listItems}</ol>`;
    }

    // Detect unordered list: lines starting with "- " or "* "
    const isUnorderedList = lines.every(
      (line) => line.trim().startsWith("- ") || line.trim().startsWith("* ")
    );

    if (isUnorderedList && lines.length > 0) {
      const listItems = lines
        .map((line) => {
          const content = line.replace(/^[\-*]\s*/, "").trim();
          const formatted = formatInline(content);
          return `<li class="text-sm leading-6 text-slate-100">${formatted}</li>`;
        })
        .join("");
      return `<ul class="mb-2 list-disc space-y-1 pl-5 text-sm text-slate-100 last:mb-0">${listItems}</ul>`;
    }

    // Regular paragraph (preserve single line breaks as <br>)
    const withBreaks = block
      .split("\n")
      .map((line) => formatInline(line))
      .join("<br>");

    return `<p class="mb-2 text-sm leading-6 text-slate-100 last:mb-0">${withBreaks}</p>`;
  });

  return processedBlocks.join("\n");
}

function formatInline(text: string): string {
  // Bold: **text**
  text = text.replace(
    /\*\*([^\*]+)\*\*/g,
    '<strong class="font-semibold text-white">$1</strong>'
  );

  // Italic: *text* (but not already processed bold)
  text = text.replace(
    /\*([^\*]+)\*/g,
    '<em class="italic text-slate-200">$1</em>'
  );

  // Inline code: `text`
  text = text.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-white/10 px-1 py-0.5 text-xs font-medium text-orange-200">$1</code>'
  );

  return text;
}
