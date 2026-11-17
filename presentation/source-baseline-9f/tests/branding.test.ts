import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createApp } from "../server/app.js";
import os from "node:os";
import path from "node:path";

 test("Product branding includes bundled Lensa logo; no standalone admin or fake login", async () => {
  const html = await fs.readFile("index.html", "utf8");
  assert.match(html, /NotePreso \| PowerPoint Maker/);
  assert.match(html, /lensa-logo\.png/);
  const logo = await fs.readFile("public/lensa-logo.png");
  assert.equal(logo.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const appText = await fs.readFile("src/App.tsx", "utf8");
  assert.doesNotMatch(appText, /components\/Admin/);
  assert.doesNotMatch(appText, /login\.notepreso\.com/); // No live SSO without validated OIDC.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "np-branding-"));
  const { app } = await createApp({root, production:false,host:"127.0.0.1",port:4310,model:"gpt-4.1-mini",render:false,soffice:"soffice",pdftoppm:"pdftoppm"});
  try {
    assert.equal((await app.inject({url:"/api/admin/overview"})).statusCode, 404);
    assert.equal((await app.inject({url:"/api/capabilities"})).json().localAdmin, false);
  } finally {
    await app.close();
    await fs.rm(root,{recursive:true,force:true});
  }
});
