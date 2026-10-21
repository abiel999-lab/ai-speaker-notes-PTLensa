import sharp from "sharp";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "./config.js";
export function run(command: string, args: string[], timeout = 120000) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env },
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("RENDER_TIMEOUT"));
    }, timeout);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("RENDER_UNAVAILABLE"));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error("RENDER_FAILED"));
    });
  });
}
export async function renderPptx(
  file: string,
  dir: string,
  cfg: Config,
  slides: number,
) {
  const profile = path.join(dir, "lo-profile");
  await fs.mkdir(dir, { recursive: true });
  const stale = (await fs.readdir(dir)).filter(
    (name) => /^preview-\d+\.png$/.test(name) || /^slide-\d+\.png$/.test(name),
  );
  await Promise.all(
    stale.map((name) => fs.rm(path.join(dir, name), { force: true })),
  );
  try {
    await run(cfg.soffice, [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      dir,
      file,
    ]);
    const pdf = path.join(dir, path.basename(file, ".pptx") + ".pdf");
    await fs.access(pdf);
    await run(cfg.pdftoppm, [
      "-png",
      "-scale-to",
      "1440",
      pdf,
      path.join(dir, "slide"),
    ]);
    const files = (await fs.readdir(dir))
      .filter((n) => /^slide-\d+\.png$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    if (files.length !== slides) throw new Error("RENDER_SLIDE_COUNT");
    for (let i = 0; i < files.length; i++) {
      const preview = path.join(dir, `preview-${i}.png`);
      await fs.rename(path.join(dir, files[i]), preview);
      try {
        // Counting filenames is not enough: converters can leave a partial PNG.
        await sharp(preview, { failOn: "truncated", limitInputPixels: 3000000 }).raw().toBuffer();
      } catch {
        const retry = path.join(dir, `raster-retry-${i}`);
        await run(cfg.pdftoppm, ["-f", String(i + 1), "-singlefile", "-png", "-scale-to", "1440", pdf, retry]);
        await sharp(retry + ".png", { failOn: "truncated", limitInputPixels: 3000000 }).raw().toBuffer();
        await fs.rename(retry + ".png", preview);
      }
    }
  } finally {
    await fs.rm(profile, { recursive: true, force: true });
  }
}
