import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";

test("Account boundary redirects without a sign-in page and clears private UI after session expiry", async () => {
  // jsdom does not implement full-page navigation. Capture the navigation request;
  // real HTTP redirect behavior is independently exercised in auth.test.ts.
  const virtualConsole = new VirtualConsole();
  let navigations = 0;
  virtualConsole.on("jsdomError", error => {
    if (/navigation/i.test(error.message)) navigations++;
    else throw error;
  });
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:4310/app", virtualConsole });
  const saved: Record<string, PropertyDescriptor | undefined> = {};
  for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "MutationObserver", "sessionStorage", "Event"]) {
    saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  }
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const originalFetch = globalThis.fetch;
  let authenticated = false;
  let sentCsrf = "";
  globalThis.fetch = (async (_url: any, options: any = {}) => {
    if (String(_url).endsWith("/usage")) return Response.json({ usage: { generations: 3, ai: 2 },
      limits: { generations: 25, ai: 50 }, enforced: true });
    if (options.method === "POST") {
      sentCsrf = options.headers["X-CSRF-Token"];
      return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }
    return Response.json({ authentication: "oidc", user: authenticated ? { id: "owner", email: "owner@example.test", name: "Alice Example" } : null,
      ...(authenticated ? { csrfToken: "c".repeat(64) } : {}) });
  }) as typeof fetch;
  const React = await import("react");
  const { render, screen, waitFor, cleanup, act, fireEvent } = await import("@testing-library/react");
  const { SessionBoundary, AccountControls } = await import("../src/components/SessionBoundary");
  const { api } = await import("../src/api");
  const mount = () => render(React.createElement(SessionBoundary, { lang: "en", children:
    React.createElement("div", null, React.createElement("span", null, "Private workspace"), React.createElement(AccountControls, { lang: "en" })) }));
  try {
    mount();
    await waitFor(() => assert.equal(navigations, 1));
    assert.equal(screen.queryByRole("link", { name: "Sign in" }), null);
    assert.equal(screen.queryByText("Private workspace"), null);
    cleanup(); authenticated = true; mount();
    await screen.findByText("Private workspace");
    await screen.findByRole("button", { name: "Sign out" });
    assert.equal(document.querySelector(".account-email")?.textContent, "Alice Example");
    assert.equal(document.querySelector(".account-avatar")?.textContent, "AE");
    const details = screen.getByText("Usage").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await screen.findByText("Generations: 3 / 25");
    sessionStorage.setItem("verbatim-design:old-job", "private-draft");
    authenticated = false; // The server session has expired; recheck must redirect.
    await act(async () => { await assert.rejects(() => api("/projects", "POST", {})); });
    await waitFor(() => assert.equal(navigations, 2));
    assert.equal(screen.queryByRole("link", { name: "Sign in" }), null);
    assert.equal(sentCsrf, "c".repeat(64));
    assert.equal(screen.queryByText("Private workspace"), null);
    assert.equal(sessionStorage.getItem("verbatim-design:old-job"), null);
  } finally {
    cleanup(); globalThis.fetch = originalFetch; dom.window.close();
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
