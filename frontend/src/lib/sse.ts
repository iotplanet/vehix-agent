/**
 * SSE (Server-Sent Events) frame parser.
 *
 * Parses an incremental ReadableStream from fetch() into structured events.
 * The backend sends events in the format:
 *   event: <event_name>
 *   data: <json_payload>
 *
 * This parser handles partial chunks and multi-line data correctly.
 */

export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Parse a raw SSE text buffer into an array of {event, data} objects.
 * Handles partial (incomplete) frames by returning unprocessed remainder.
 */
export function parseSSEFrames(buffer: string): { events: SSEEvent[]; remainder: string } {
  const events: SSEEvent[] = [];
  const lines = buffer.split("\n");
  let currentEvent = "";
  let currentData = "";
  let lastCompleteIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      currentData += line.slice(6);
    } else if (line === "") {
      // Empty line = end of event
      if (currentEvent && currentData) {
        events.push({ event: currentEvent, data: currentData });
        lastCompleteIndex = i;
      }
      currentEvent = "";
      currentData = "";
    }
  }

  // Remainder is everything after the last complete event
  const remainder = lastCompleteIndex >= 0
    ? lines.slice(lastCompleteIndex + 1).join("\n")
    : buffer;

  return { events, remainder };
}

/**
 * Create an async generator that yields SSEEvent objects from a fetch Response.
 *
 * Usage:
 * ```ts
 * const response = await fetch("/api/agent/run", {
 *   method: "POST",
 *   body: JSON.stringify({ message }),
 * });
 * for await (const event of sseEventStream(response)) {
 *   console.log(event.event, JSON.parse(event.data));
 * }
 * ```
 */
export async function* sseEventStream(
  response: Response
): AsyncGenerator<SSEEvent, void, undefined> {
  if (!response.ok || !response.body) {
    throw new Error(`SSE connection failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, remainder } = parseSSEFrames(buffer);
    buffer = remainder;

    for (const event of events) {
      yield event;
    }
  }
}
