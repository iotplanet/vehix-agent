/**
 * Lightweight Markdown renderer.
 * Handles: tables, code blocks, inline code, bold.
 */

import React from "react";

interface Props {
  content: string;
  className?: string;
}

export default function Markdown({ content, className }: Props) {
  const nodes = parseMarkdown(content);
  return <div className={className}>{nodes}</div>;
}

function parseMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];
  const nodes: React.ReactNode[] = [];

  const parts = text.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    if (part.startsWith("```") && part.endsWith("```")) {
      const code = part.replace(/```\w*\n?/, "").replace(/```$/, "");
      nodes.push(
        <pre key={nodes.length} className="bg-background rounded-lg p-3 my-2 overflow-x-auto text-xs text-foreground border border-divider">
          <code>{code.trim()}</code>
        </pre>
      );
    } else if (part.trim()) {
      for (const seg of splitTables(part)) {
        if (typeof seg === "string") {
          const paras = seg.split("\n\n").filter(Boolean);
          for (const block of paras) {
            for (const line of block.split("\n")) {
              if (!line.trim()) continue;
              // Bullet list
              const li = line.match(/^[-*]\s+(.+)/);
              if (li) {
                nodes.push(<li key={nodes.length} className="ml-4 mb-0.5 text-foreground list-disc">{renderInline(li[1])}</li>);
                continue;
              }
              // Heading: ### Title
              const h = line.match(/^(#{1,4})\s+(.+)/);
              if (h) {
                const sizes: Record<number, string> = {1:"text-lg font-bold",2:"text-base font-bold",3:"text-sm font-semibold",4:"text-xs font-semibold"};
                nodes.push(<h3 key={nodes.length} className={`${sizes[h[1].length]||"text-sm"} text-zinc-100 mt-2 mb-1`}>{renderInline(h[2])}</h3>);
                continue;
              }
              nodes.push(<p key={nodes.length} className="mb-1 last:mb-0">{renderInline(line)}</p>);
            }
          }
        } else {
          nodes.push(renderTable(seg, nodes.length));
        }
      }
    }
  }
  return nodes;
}

function splitTables(text: string): (string | string[][])[] {
  const lines = text.split("\n");
  const result: (string | string[][])[] = [];
  let buf: string[] = [];
  let tableRows: string[] = [];

  for (const line of lines) {
    const isTable = line.trim().startsWith("|") && line.trim().endsWith("|");
    if (isTable) {
      if (buf.length > 0) { result.push(buf.join("\n")); buf = []; }
      tableRows.push(line.trim());
    } else {
      if (tableRows.length > 0) {
        result.push(parseTableRows(tableRows));
        tableRows = [];
      }
      buf.push(line);
    }
  }
  if (tableRows.length > 0) result.push(parseTableRows(tableRows));
  if (buf.length > 0) result.push(buf.join("\n"));
  return result;
}

function parseTableRows(rows: string[]): string[][] {
  return rows
    .filter((r) => !/^\|[\s\-:|]+\|$/.test(r))
    .map((r) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
}

function renderTable(data: string[][], key: number) {
  if (data.length === 0) return null;
  const [header, ...body] = data;
  return (
    <div key={key} className="my-2 overflow-x-auto">
      {/* w-max: hug content, scroll horizontally when wide (no column stretching) */}
      <table className="w-max text-xs border-collapse">
        <thead><tr className="border-b border-zinc-600">{header.map((h, i) => <th key={i} className="text-left text-foreground font-medium p-1.5 truncate max-w-[20rem]">{h}</th>)}</tr></thead>
        <tbody>{body.map((row, ri) => <tr key={ri} className="border-b border-divider">{row.map((c, ci) => <td key={ci} className="text-default-500 p-1.5 truncate max-w-[20rem]">{renderInline(c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  return text.split(/(`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="bg-content2 text-blue-300 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
    }
    return part.split(/(\*\*[^*]+\*\*)/g).map((bp, j) => {
      if (bp.startsWith("**") && bp.endsWith("**")) {
        return <strong key={`${i}-${j}`} className="font-semibold text-zinc-100">{bp.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={`${i}-${j}`}>{bp}</React.Fragment>;
    });
  });
}
