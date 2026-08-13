/**
 * StreamingMarkdown — incremental Markdown renderer backed by a Web Worker.
 *
 * Receives the full accumulated text (growing every token) but only
 * sends the *new* portion to the worker.  The worker incrementally
 * parses completed blocks via `marked` while keeping the trailing
 * incomplete block "live".  A `requestAnimationFrame` throttle
 * merges rapid worker responses into a single React render.
 */

import { useState, useEffect, useRef } from "react";

interface WorkerResult {
  stableBlocks: string[];
  streamingHtml: string;
  isCodeBlock: boolean;
}

interface Props {
  content: string;
  className?: string;
}

export default function StreamingMarkdown({ content, className }: Props) {
  const [stableBlocks, setStableBlocks] = useState<string[]>([]);
  const [streamingHtml, setStreamingHtml] = useState("");
  const [isCodeBlock, setIsCodeBlock] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const lastLenRef = useRef(0);
  const pendingRef = useRef<WorkerResult | null>(null);
  const rafRef = useRef<number | null>(null);

  // ── Bootstrap / teardown the worker ─────────────────────────
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("./markdown-worker.ts", import.meta.url),
      { type: "module" },
    );

    workerRef.current.onmessage = (e: MessageEvent<WorkerResult>) => {
      // Overwrite with latest — RAF will pick it up
      pendingRef.current = e.data;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          const latest = pendingRef.current;
          if (latest) {
            setStableBlocks(latest.stableBlocks);
            setStreamingHtml(latest.streamingHtml);
            setIsCodeBlock(latest.isCodeBlock);
            pendingRef.current = null;
          }
          rafRef.current = null;
        });
      }
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // ── Feed new text to the worker ─────────────────────────────
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    // Content was cleared (stream ended) → reset
    if (content.length === 0) {
      if (lastLenRef.current > 0) {
        worker.postMessage({ type: "finish" });
        worker.postMessage({ type: "reset" });
        lastLenRef.current = 0;
        setStableBlocks([]);
        setStreamingHtml("");
        setIsCodeBlock(false);
      }
      return;
    }

    // Send only the new suffix
    if (content.length > lastLenRef.current) {
      const chunk = content.slice(lastLenRef.current);
      lastLenRef.current = content.length;
      worker.postMessage({ type: "append", data: chunk });
    }
  }, [content]);

  // ── Render ──────────────────────────────────────────────────
  if (stableBlocks.length === 0 && !streamingHtml) return null;

  return (
    <div className={`streaming-markdown ${className ?? ""}`}>
      {stableBlocks.map((html, i) => (
        <div
          key={`sb-${i}`}
          className="stable-block"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ))}
      {streamingHtml && (
        <div
          key="streaming"
          className={`streaming-block${isCodeBlock ? " code-block" : ""}`}
          dangerouslySetInnerHTML={{ __html: streamingHtml }}
        />
      )}
    </div>
  );
}
