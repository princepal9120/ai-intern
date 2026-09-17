import type { JSX } from "react";

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

const LINE_CLASSES: Record<LineKind, string> = {
  file: "font-bold text-[#e6edf3]",
  hunk: "text-[#4f9cf0]",
  add: "text-[#4cc38a] bg-[#4cc38a]/10 block w-full px-1 -mx-1",
  del: "text-[#f06666] bg-[#f06666]/10 block w-full px-1 -mx-1",
  context: "text-[#8b98a9]",
};

export function DiffViewer({ diff, runId }: DiffViewerProps): JSX.Element {
  if (!diff) {
    return <p className="text-xs text-[#8b98a9] italic">No file changes produced</p>;
  }
  const lines = diff.split("\n");
  return (
    <pre className="font-mono text-xs leading-[1.45] bg-[#0f1419] border border-[#2a3441] rounded-lg p-3 mt-2 max-h-72 overflow-auto whitespace-pre block w-full" aria-label={runId ? `Diff for ${runId}` : "Unified diff"}>
      <code className="block w-full">
        {lines.map((line, index) => (
          <span key={index} className={LINE_CLASSES[classifyLine(line)]}>
            {line}
            {index < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </code>
    </pre>
  );
}
