import sharp from "sharp";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
export function run(command, args, timeout = 120000, environment = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ["ignore", "ignore", "ignore"],
            env: { ...process.env, ...environment },
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
export async function renderPptx(file, dir, cfg, slides) {
    // Use only the checked, bundled fonts. An absolute directory avoids
    // differences in relative-font-directory handling across renderer versions.
    const bundled = fileURLToPath(new URL('../../assets/fonts/notepreso-fonts.conf', import.meta.url));
    const escape = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const template = await fs.readFile(bundled,'utf8');
    const marker = '<dir prefix="relative">.</dir>';
    if (!template.includes(marker)) throw Error('BUNDLED_FONT_CONFIG_INVALID');
    const configText = template.replace(/<include[^>]*>\/etc\/fonts\/fonts\.conf<\/include>/g,'')
        .replace(marker,'<dir>'+escape(path.dirname(bundled))+'</dir>');
    const profile = path.join(dir, "lo-profile");
    await fs.mkdir(dir, { recursive: true });
    const fonts = path.join(dir,'notepreso-fontconfig.conf');
    await fs.writeFile(fonts,configText,{mode:0o600});
    const environment = {FONTCONFIG_FILE: fonts};
    const stale = (await fs.readdir(dir)).filter((name) => /^preview-\d+\.png$/.test(name) || /^slide-\d+\.png$/.test(name));
    await Promise.all(stale.map((name) => fs.rm(path.join(dir, name), { force: true })));
    try {
        await run(cfg.soffice, [
            `-env:UserInstallation=${pathToFileURL(profile).href}`,
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            dir,
            file,
        ], 120000, environment);
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
            .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
        if (files.length !== slides)
            throw new Error("RENDER_SLIDE_COUNT");
        for (let i = 0; i < files.length; i++) {
            const preview = path.join(dir, `preview-${i}.png`);
            await fs.rename(path.join(dir, files[i]), preview);
            try {
                // Counting filenames is not enough: converters can leave a partial PNG.
                await sharp(preview, { failOn: "truncated", limitInputPixels: 3000000 }).raw().toBuffer();
            }
            catch {
                const retry = path.join(dir, `raster-retry-${i}`);
                await run(cfg.pdftoppm, ["-f", String(i + 1), "-singlefile", "-png", "-scale-to", "1440", pdf, retry]);
                await sharp(retry + ".png", { failOn: "truncated", limitInputPixels: 3000000 }).raw().toBuffer();
                await fs.rename(retry + ".png", preview);
            }
        }
    }
    finally {
        await fs.rm(profile, { recursive: true, force: true });
    }
}
