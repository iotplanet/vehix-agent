import { describe, it, expect } from "vitest";
import { parseSSEFrames } from "./sse";

describe("parseSSEFrames", () => {
  it("parses a complete event", () => {
    const buffer = "event: token\ndata: {\"text\":\"hi\"}\n\n";
    const { events, remainder } = parseSSEFrames(buffer);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("token");
    expect(events[0].data).toBe('{"text":"hi"}');
    expect(remainder).toBe("");
  });

  it("keeps incomplete frame as remainder", () => {
    const buffer = "event: message\ndata: {\"partial\":";
    const { events, remainder } = parseSSEFrames(buffer);
    expect(events).toHaveLength(0);
    expect(remainder).toContain("event: message");
  });

  it("parses multiple events and leaves trailing remainder", () => {
    const buffer =
      "event: node_start\ndata: {\"node\":\"router\"}\n\n" +
      "event: token\ndata: {\"text\":\"a\"}\n\n" +
      "event: message\ndata: {\"content\"";
    const { events, remainder } = parseSSEFrames(buffer);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("node_start");
    expect(events[1].event).toBe("token");
    expect(remainder.startsWith("event: message")).toBe(true);
  });
});
