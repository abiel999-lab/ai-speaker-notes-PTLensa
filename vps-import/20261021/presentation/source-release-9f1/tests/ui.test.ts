import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import type { Config } from "../server/config.js";
test("UI workflow: direct workspace → exact source → style → generation → review → English-only UI", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost:4310/app?new=1" },
  );
  const saved: any = {};
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "Node",
    "MutationObserver",
    "localStorage",
    "getComputedStyle",
  ]) {
    saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      value: (dom.window as any)[key],
      configurable: true,
      writable: true,
    });
  }
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-ui-"));
  const cfg: Config = {
    root,
    production: false,
    host: "127.0.0.1",
    port: 4310,
    render: false,
    model: "gpt-4.1-mini",
    soffice: "soffice",
    pdftoppm: "pdftoppm",
  };
  const { app } = await createApp(cfg);
  let cookie = "";
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, options: any = {}) => {
    const r = await app.inject({
      url: String(url),
      method: options.method || "GET",
      payload: options.body,
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
    });
    if (r.headers["set-cookie"])
      cookie = String(r.headers["set-cookie"]).split(";")[0];
    return new Response(Uint8Array.from(r.rawPayload).buffer, {
      status: r.statusCode,
      headers: {
        "Content-Type": String(r.headers["content-type"] || "application/json"),
      },
    });
  }) as typeof fetch;
  const React = await import("react");
  const { render, screen, fireEvent, waitFor, cleanup } = await import(
    "@testing-library/react"
  );
  const { default: App } = await import("../src/App");
  try {
    render(React.createElement(App));
    await screen.findByRole("heading", { name: "Start with your words." });
    await waitFor(() => assert.match(document.querySelector(".token-usage-bar summary")!.textContent!, /Estimated USD\s*\$0\.000000/));
    // The customer uses a top navigation, not an application sidebar.
    assert.ok(screen.getByRole("navigation", { name: "Main navigation" }));
    assert.equal(document.querySelector(".app-nav"), null);
    assert.ok(document.querySelector("header.user-topnav"));
    assert.equal(screen.getByRole("link", { name: "NotePreso PowerPoint Maker homepage" }).getAttribute("href"), "/");
    assert.equal(document.querySelector("a.user-admin-link"), null);
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    await screen.findByRole("heading", { name: "Make every word look its best." });
    fireEvent.change(screen.getByRole("textbox", { name: "Presentation source draft" }), {
      target: { value: "## Dashboard draft\nPreserved words." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to design" }));
    await screen.findByRole("heading", { name: "Start with your words." });
    assert.equal(screen.queryByRole("heading", { name: "Sign in" }), null);
    assert.equal(
      screen.queryByRole("textbox", { name: "Email address" }),
      null,
    );
    assert.equal(screen.queryByRole("button", { name: "Sign out" }), null);
    fireEvent.change(screen.getByLabelText("Presentation name"), {
      target: { value: "UI exact wording" },
    });
    const original =
      "## Original wording\nA sentence with 43,2%, punctuation—UNCHANGED.\n- A source item.";
    fireEvent.change(screen.getByRole("textbox", { name: "Source snapshot" }), {
      target: { value: original },
    });
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole("button", { name: "Choose a style" })
          .hasAttribute("disabled"),
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose a style" }));
    await screen.findByRole("heading", {
      name: "Choose the visual direction.",
    });
    fireEvent.change(screen.getByLabelText("Presentation purpose"), {
      target: { value: "executive" },
    });
    fireEvent.change(screen.getByLabelText("Brand preset name"), {
      target: { value: "Corporate test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save style" }));
    assert.ok(
      screen.getByRole("button", {
        name: "Apply brand preset Corporate test",
      }),
    );
    assert.ok(
      !localStorage.getItem("verbatim-brand-presets-v1")!.includes(original),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate presentation" }),
    );
    await screen.findByRole(
      "button",
      { name: "Layout editorial" },
      { timeout: 10000 },
    );
    assert.equal(
      screen
        .getByRole("button", { name: "Export PowerPoint" })
        .hasAttribute("disabled"),
      false,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Outline" }));
    await screen.findByRole("heading", { name: "Slide outline" });
    assert.ok(screen.getByRole("button", { name: "Outline slide 1" }));
    fireEvent.click(screen.getByRole("tab", { name: "Design" }));
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole("button", { name: "AI restyle slide" })
          .hasAttribute("disabled"),
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "AI restyle slide" }));
    await screen.findByText("Safe fallback applied");
    assert.equal(
      screen
        .getByRole("button", { name: "Export PowerPoint" })
        .hasAttribute("disabled"),
      true,
    );
    const before = (
      await app.inject({ method: "GET", url: "/api/projects" })
    ).json().projects[0];
    const beforeJobs = (
      await app.inject({ method: "GET", url: "/api/projects/" + before.id })
    ).json().history.length;
    fireEvent.click(screen.getByRole("button", { name: "Template studio" }));
    await waitFor(
      () =>
        assert.equal(
          screen
            .getByRole("button", { name: "Apply design" })
            .hasAttribute("disabled"),
          false,
        ),
      { timeout: 10000 },
    );
    assert.equal(
      screen
        .getByRole("button", { name: "Export PowerPoint" })
        .hasAttribute("disabled"),
      true,
    );
    assert.equal(
      (
        await app.inject({ method: "GET", url: "/api/projects/" + before.id })
      ).json().history.length,
      beforeJobs,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply design" }));
    await waitFor(
      () =>
        assert.equal(
          screen
            .getByRole("button", { name: "Export PowerPoint" })
            .hasAttribute("disabled"),
          false,
        ),
      { timeout: 10000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Present slides" }));
    await screen.findByRole("dialog", { name: "Presentation mode" });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      assert.equal(
        screen.queryByRole("dialog", { name: "Presentation mode" }),
        null,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    assert.equal(
      (
        (await screen.findByRole("textbox", {
          name: "Source snapshot",
        })) as HTMLTextAreaElement
      ).value,
      original,
    );
    assert.equal(screen.queryByRole("button", { name: "Language" }), null);
    assert.equal(document.documentElement.lang, "en");
    const project = (
      await app.inject({
        method: "GET",
        url: "/api/projects",
        headers: { cookie },
      })
    ).json().projects[0];
    const data = (
      await app.inject({
        method: "GET",
        url: "/api/projects/" + project.id,
        headers: { cookie },
      })
    ).json();
    assert.equal(data.project.source, original);
    assert.equal(data.history[0].report.passed, true);
    assert.equal(data.history[0].settings.intent, "executive");
  } finally {
    cleanup();
    globalThis.fetch = oldFetch;
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
    dom.window.close();
    for (const key of Object.keys(saved)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else delete (globalThis as any)[key];
    }
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
