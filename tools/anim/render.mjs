// Capture tools/anim/template.html frame by frame (window.setTime) into a silent H.264 video.
// usage: node render.mjs <scene.json> <out.mp4> [fps]
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const [sceneFile, out, fpsArg] = process.argv.slice(2);
const fps = Number(fpsArg || 30);
const scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
const total = scene.total;
const frames = Math.ceil(total * fps);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--allow-file-access-from-files'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((s) => { window.SCENE = s; }, scene);
  await page.goto(pathToFileURL(join(here, 'template.html')).href, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);

  const ff = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.setTime(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 90, optimizeForSpeed: true });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (fps * 5) === 0) process.stdout.write(`  frame ${i}/${frames}\n`);
  }
  ff.stdin.end();
  await done;
} finally {
  await browser.close();
}
