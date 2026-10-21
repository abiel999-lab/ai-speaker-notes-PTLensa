import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
test("USD indicator distinguishes zero, sub-micro amounts, partial unknown cost and unavailable telemetry", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:4310/app" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "MutationObserver", "getComputedStyle"]) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: (dom.window as any)[key] });
  }
  const originalFetch = globalThis.fetch;
  const React = await import("react"), { render, waitFor, cleanup } = await import("@testing-library/react");
  const { TokenUsage } = await import("../src/components/TokenUsage.js");
  const base = { input: 1, output: 1, total: 2, calls: 1, unreportedCalls: 0 };
  try {
    for (const [estimatedUsd, unknownCalls, expected] of [[0, 0, "$0.000000"], [.000000001, 0, "<$0.000001"], [.0003101, 1, "$0.000310 + unknown"], [null, 1, "Unknown"]] as const) {
      globalThis.fetch = (async () => Response.json({ usage: { ...base, cost: { estimatedUsd, unknownCalls, assumedCalls: 0, currency: "USD" } } })) as typeof fetch;
      render(React.createElement(TokenUsage, { active: false }));
      await waitFor(() => assert.equal(document.querySelector(".token-cost-summary strong")!.textContent, expected));
      assert.match(document.querySelector("summary")!.textContent!, /Estimated USD/);
      cleanup();
    }
    globalThis.fetch = (async () => { throw new Error("synthetic network failure"); }) as typeof fetch;
    render(React.createElement(TokenUsage, { active: false }));
    await waitFor(() => assert.equal(document.querySelector(".token-cost-summary strong")!.textContent, "Unavailable"));
  } finally {
    cleanup(); globalThis.fetch = originalFetch; dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  }
});
