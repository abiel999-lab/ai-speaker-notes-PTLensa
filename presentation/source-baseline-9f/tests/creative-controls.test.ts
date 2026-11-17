import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { DEFAULT_SETTINGS } from "../src/studio/types.js";

test("Creative controls expose only Luna and preserve the selected motion setting", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:4310/app" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "MutationObserver", "getComputedStyle"]) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: (dom.window as any)[key] });
  }
  const React = await import("react"), { render, screen, fireEvent, cleanup } = await import("@testing-library/react");
  const { DesignStep } = await import("../src/components/DesignStep.js");
  function Harness() {
    const [settings, setSettings] = React.useState(DEFAULT_SETTINGS);
    return React.createElement(DesignStep, { lang: "en", back: () => {}, studio: { settings, setSettings, caps: { ai: true },
      draft: { source: "# Complete source" }, analysis: { words: 2, blocks: [] }, active: false, busy: false, start: () => {} } as any });
  }
  try {
    render(React.createElement(Harness));
    fireEvent.click(screen.getByRole("button", { name: /^Creative AI/ }));
    assert.equal(screen.queryByLabelText("Creative quality"), null);
    assert.ok(screen.getByText("GPT-6 Luna · fixed model"));
    assert.ok(!document.body.textContent!.includes("Astra"));
    assert.equal((screen.getByLabelText("PowerPoint motion") as HTMLSelectElement).value, "keynote");
    assert.ok(screen.getByText(/Web previews and PDF are static/));
    fireEvent.change(screen.getByLabelText("Creative target slide count"), { target: { value: "10" } });
    assert.equal((screen.getByLabelText("Creative target slide count") as HTMLInputElement).value, "10");
    assert.equal(screen.getByRole("switch", { name: "Interactive topic and quiz links" }).getAttribute("aria-checked"), "true");
    fireEvent.click(screen.getByRole("switch", { name: "Interactive topic and quiz links" }));
    assert.equal(screen.getByRole("switch", { name: "Interactive topic and quiz links" }).getAttribute("aria-checked"), "false");
    assert.ok(screen.getByLabelText("Upload creative images"));
    fireEvent.change(screen.getByLabelText("PowerPoint motion"), { target: { value: "none" } });
    fireEvent.click(screen.getByRole("button", { name: /^Creative AI/ }));
    assert.equal((screen.getByLabelText("PowerPoint motion") as HTMLSelectElement).value, "none");
    assert.ok(screen.getByText(/Creative composition uses GPT-6 Luna/));
    fireEvent.click(screen.getByRole("button", { name: /^Template/ }));
    assert.equal(screen.queryByLabelText("PowerPoint motion"), null);
  } finally {
    cleanup(); dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
    }
  }
});
