/**
 * Syntax-highlighted unified diff viewer. Renders the diff inside a
 * pre/code block with per-line coloring: additions green, deletions red,
 * hunk headers blue, file headers bold.
 */
import type { CSSProperties, JSX } from "react";

export interface DiffViewerProps {
  diff: string;
  runId?: string;
}

type LineKind = "file" | "hunk" | "add" | "del" | "context";

function classifyLine(line: string): LineKind {
  if (
    line.startsWith("diff --git") ||
    line.startsWith("+++") ||
    line.startsWith("---") ||
    line.startsWith("index ")
  ) {
    return "file";
  }
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("+")) {
    return "add";
  }
  if (line.startsWith("-")) {
    return "del";
  }
  return "context";
}

const LINE_STYLES: Record<LineKind, CSSProperties> = {
  file: { fontWeight: 700, color: "var(--text, #e6edf3)" },
  hunk: { color: "#4f9cf0" },
  add: { color: "#4cc38a", backgroundColor: "rgba(76, 195, 138, 0.08)" },
  del: { color: "#f06666", backgroundColor: "rgba(240, 102, 102, 0.08)" },
  context: { color: "var(--muted, #8b98a9)" },
};

export function DiffViewer({ diff, runId }: DiffViewerProps): JSX.Element {
  if (!diff) {
    return <p className="muted">No file changes produced</p>;
  }
  const lines = diff.split("\n");
  return (
    <pre className="diff" aria-label={runId ? `Diff for ${runId}` : "Unified diff"}>
      <code>
        {lines.map((line, index) => (
          <span key={index} style={LINE_STYLES[classifyLine(line)]}>
            {line}
            {index < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </code>
    </pre>
  );
}
