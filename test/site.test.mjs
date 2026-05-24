import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("home page includes the required AI project showcase", async () => {
  const html = await read("index.html");
  const script = await read("script.js");
  const combined = `${html}\n${script}`;

  for (const project of [
    "AI Mini-MBA",
    "Meridian Studio",
    "Signal Scouts",
    "Tanks AiLOT",
  ]) {
    assert.match(combined, new RegExp(project, "i"));
  }

  assert.match(html, /id="projects"/);
  assert.match(html, /id="about"/);
});

test("hero uses the Greg Does AI positioning and candid learning line", async () => {
  const html = await read("index.html");

  assert.match(html, /<title>Greg Does AI \| Figuring It Out in Public<\/title>/);
  assert.match(html, /<h1 id="hero-title" class="hero-title">Greg Does AI<\/h1>/);
  assert.match(html, /Learning the machinery while everyone else is still reading the\s+memo/);
  assert.match(html, /making ambiguity easier to use/);
});

test("hero uses dark portfolio styling with portrait and proof stats", async () => {
  const html = await read("index.html");
  const css = await read("styles.css");

  assert.match(html, /class="hero-portrait"/);
  assert.match(html, /assets\/greg-kitchen-bio\.png/);
  assert.match(html, /<dt>Projects<\/dt>\s+<dd>4<\/dd>/);
  assert.match(html, /<dt>Live build<\/dt>\s+<dd>1<\/dd>/);
  assert.match(css, /--color-dark-bg:\s*#0A0D14;/);
  assert.match(css, /\.hero-portrait img/);
});

test("bio portrait is wired as a local deployable asset", async () => {
  const html = await read("index.html");

  assert.match(html, /assets\/greg-kitchen-bio\.png/);
  assert.match(html, /alt="Portrait of Greg Kitchen"/);
});

test("bio portrait subtly crossfades into an AI humanoid variant", async () => {
  const html = await read("index.html");
  const css = await read("styles.css");

  assert.match(html, /class="bio-media__stack"/);
  assert.match(html, /assets\/greg-kitchen-ai-humanoid\.png/);
  assert.match(html, /class="bio-media__ai"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(css, /@keyframes bio-ai-fade/);
  assert.match(css, /animation:\s*bio-ai-fade 18s ease-in-out infinite/);
  assert.match(css, /\.bio-media__ai/);
  assert.match(css, /prefers-reduced-motion/);
});

test("light-mode Greg brand tokens are centralized in CSS", async () => {
  const css = await read("styles.css");

  assert.match(css, /--color-bg:\s*#F5F8FF;/);
  assert.match(css, /--color-accent:\s*#2563EB;/);
  assert.match(css, /--font-display:\s*"Playfair Display"/);
  assert.match(css, /--font-body:\s*"DM Sans"/);
});

test("project details are data driven so more work can be added later", async () => {
  const script = await read("script.js");

  assert.match(script, /const projects = \[/);
  assert.match(script, /addEventListener\("click"/);
  assert.match(script, /aria-selected/);
});

test("projects are reverse ordered with local images and Tanks AiLOT link", async () => {
  const script = await read("script.js");
  const mbaIndex = script.indexOf('name: "AI Mini-MBA"');
  const tanksIndex = script.indexOf('name: "Tanks AiLOT"');
  const signalIndex = script.indexOf('name: "Signal Scouts"');
  const meridianIndex = script.indexOf('name: "Meridian Studio"');

  assert.ok(mbaIndex > -1);
  assert.ok(tanksIndex > -1);
  assert.ok(signalIndex > -1);
  assert.ok(meridianIndex > -1);
  assert.ok(mbaIndex < tanksIndex);
  assert.ok(tanksIndex < signalIndex);
  assert.ok(signalIndex < meridianIndex);

  assert.match(script, /assets\/project-ai-mini-mba\.png/);
  assert.match(script, /assets\/project-tanks-ailot\.png/);
  assert.match(script, /assets\/project-signal-scouts\.png/);
  assert.match(script, /assets\/project-meridian-studio\.png/);
  assert.match(script, /ai-mini-mba-interactive-course\.html/);
  assert.match(script, /https:\/\/tanks-ailot\.gregthedinosaur\.workers\.dev/);
  assert.match(script, /target="_blank"/);
});

test("AI Mini-MBA course is hosted locally and persists progress", async () => {
  const course = await read("ai-mini-mba-interactive-course.html");

  assert.match(course, /<title>AI Mini-MBA — Interactive Course<\/title>/);
  assert.match(course, /const STORAGE_KEY = "ai-mini-mba-progress-v1"/);
  assert.match(course, /window\.localStorage\.setItem\(STORAGE_KEY, str\)/);
  assert.match(course, /window\.localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(course, /progress: state\.progress/);
  assert.match(course, /capstone: state\.capstone/);
  assert.match(course, /operator: state\.operator/);
  assert.match(course, /p\.completed = !p\.completed/);
  assert.match(course, /state\.progress\[state\.view\]\.notes = rbox\.value/);
});
