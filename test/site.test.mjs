import { readFile, stat } from "node:fs/promises";
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

test("site includes a contact page that emails Greg", async () => {
  const html = await read("index.html");
  const contact = await read("contact.html");
  const contactScript = await read("contact.js");

  assert.match(html, /href="contact\.html">Contact/);
  assert.match(contact, /<title>Contact Greg \| Greg Does AI<\/title>/);
  assert.match(html, /href="tanks-ailot\/">Tanks/);
  assert.match(contact, /href="tanks-ailot\/">Tanks/);
  assert.match(contact, /action="mailto:gregthedinosaur@gmail\.com"/);
  assert.match(contact, /data-contact-form/);
  assert.match(contact, /class="contact-stage"/);
  assert.match(contact, /Let’s compare notes on the next useful build/);
  assert.match(contact, /name="firstName"/);
  assert.match(contact, /name="topic"/);
  assert.match(contact, /Open email draft/);
  assert.match(contactScript, /const contactAddress = "gregthedinosaur@gmail\.com"/);
  assert.match(contactScript, /mailto:\$\{contactAddress\}/);
  assert.match(contactScript, /Greg Does AI:/);
});

test("contact form mailto encodes spaces correctly", async () => {
  const contactScript = await read("contact.js");

  // URL.searchParams form-encodes spaces as "+", which mail clients render
  // literally — the draft must be built with encodeURIComponent instead.
  assert.match(contactScript, /encodeURIComponent/);
  assert.doesNotMatch(contactScript, /searchParams\.set/);
});

test("contact page uses the organized scene and inquiry layout", async () => {
  const contact = await read("contact.html");
  const css = await read("styles.css");

  assert.match(contact, /class="contact-scene"/);
  assert.match(contact, /class="contact-panel"/);
  assert.match(contact, /class="contact-card__icon"/);
  assert.match(contact, /class="contact-form__header"/);
  assert.match(contact, /First name \*/);
  assert.match(contact, /Write a message \*/);
  assert.match(css, /\.contact-stage/);
  assert.match(css, /\.contact-scene/);
  assert.match(css, /\.contact-panel/);
  assert.match(css, /border-bottom: 2px solid/);
});

test("hero uses the Greg Does AI positioning and candid learning line", async () => {
  const html = await read("index.html");

  assert.match(html, /<title>Greg Does AI \| Figuring It Out in Public<\/title>/);
  assert.match(html, /id="hero-title" class="hero-title"/);
  assert.match(html, /Learning the machinery while everyone else is still reading the\s+memo/);
  assert.match(html, /making ambiguity easier to use/);
});

test("hero runs a live agent simulation with a decision log", async () => {
  const html = await read("index.html");
  const css = await read("styles.css");
  const script = await read("script.js");

  assert.match(html, /id="hero-sim"/);
  assert.match(html, /id="hero-log"/);
  assert.match(html, /data-sim-decisions/);
  assert.match(html, /<dt>Agent decisions<\/dt>/);
  assert.match(css, /\.hero-sim/);
  assert.match(css, /\.hero-log/);
  assert.match(script, /startHeroSim/);
  assert.match(script, /requestAnimationFrame/);
  assert.match(script, /prefers-reduced-motion/);
});

test("homepage features the updated Tanks AiLOT game with trailer and playable embed", async () => {
  const html = await read("index.html");
  const script = await read("script.js");
  const trailer = await stat(
    new URL("../assets/tanks-ailot-trailer.mp4", import.meta.url),
  );

  assert.match(html, /id="game"/);
  assert.match(html, /href="tanks-ailot\/">Play Tanks AiLOT/);
  assert.match(html, /Tanks AiLOT marketing video/);
  assert.match(html, /assets\/tanks-ailot-trailer\.mp4/);
  assert.match(html, /poster="assets\/project-tanks-ailot\.webp"/);
  assert.match(html, /data-game-src="https:\/\/tanks-ailot\.pages\.dev"/);
  assert.match(html, /data-game-mode="trailer"/);
  assert.match(html, /data-game-mode="play"/);
  assert.match(html, /aria-pressed/);
  assert.match(html, /id="game-loading"/);
  assert.match(html, /id="game-fallback"/);
  assert.match(html, /Open dedicated page/);
  assert.match(script, /bindGameStage/);
  assert.match(script, /document\.createElement\("iframe"\)/);
  assert.match(script, /frame\.src = media\.dataset\.gameSrc/);
  assert.ok(trailer.size > 0);
  // Cloudflare Pages rejects files over 25MB; the trailer should stay light.
  assert.ok(trailer.size < 10 * 1024 * 1024, "trailer should be under 10MB");
});

test("Tanks AiLOT is hosted as a dedicated Greg Does AI page", async () => {
  const html = await read("index.html");
  const script = await read("script.js");
  const contact = await read("contact.html");
  const tanks = await read("tanks-ailot/index.html");

  assert.match(html, /href="tanks-ailot\/">Play Tanks AiLOT/);
  assert.match(html, /href="tanks-ailot\/">Tanks/);
  assert.match(contact, /href="tanks-ailot\/">Tanks/);
  assert.match(script, /url: "tanks-ailot\/"/);
  assert.match(script, /data-no-new-tab/);
  assert.match(html, /https:\/\/tanks-ailot\.pages\.dev/);

  assert.match(tanks, /<title>Tanks AiLOT \| Greg Does AI<\/title>/);
  assert.match(tanks, /href="\/"/);
  assert.match(tanks, /src="https:\/\/tanks-ailot\.pages\.dev"/);
  assert.match(tanks, /title="Tanks AiLOT playable game"/);
  assert.match(tanks, /Open full screen/);
  assert.match(tanks, /class="tanks-page"/);
});

test("homepage has a build log with dated entries", async () => {
  const html = await read("index.html");
  const script = await read("script.js");
  const css = await read("styles.css");

  assert.match(html, /id="log"/);
  assert.match(html, /id="build-log-feed"/);
  assert.match(html, /href="#log">Build log/);
  assert.match(script, /const buildLog = \[/);
  assert.match(script, /renderBuildLog/);
  assert.match(script, /date: "2026-05-23"/);
  assert.match(css, /\.build-log__entry/);
});

test("bio portrait is wired as a local deployable asset", async () => {
  const html = await read("index.html");

  assert.match(html, /assets\/greg-kitchen-bio\.webp/);
  assert.match(html, /alt="Portrait of Greg Kitchen"/);
});

test("bio portrait reveals the AI humanoid variant on hover or focus", async () => {
  const html = await read("index.html");
  const css = await read("styles.css");

  assert.match(html, /class="bio-media__stack"/);
  assert.match(html, /assets\/greg-kitchen-ai-humanoid\.webp/);
  assert.match(html, /class="bio-media__ai"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(css, /\.bio-media__stack:hover \.bio-media__ai/);
  assert.match(css, /\.bio-media__stack:focus-visible \.bio-media__ai/);
  assert.match(css, /prefers-reduced-motion/);
});

test("keyboard focus is visible site-wide", async () => {
  const css = await read("styles.css");

  assert.match(css, /:focus-visible \{\n  outline: 2px solid var\(--color-accent-2\);/);
  // No rule should suppress the focus ring.
  assert.doesNotMatch(css, /outline: none/);
});

test("pages carry social sharing metadata", async () => {
  const html = await read("index.html");
  const contact = await read("contact.html");

  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(contact, /property="og:title"/);
});

test("dark brand tokens are centralized in CSS", async () => {
  const css = await read("styles.css");

  assert.match(css, /--color-bg:\s*#070A12;/);
  assert.match(css, /--color-accent:\s*#5B9DFF;/);
  assert.match(css, /--font-display:\s*"Space Grotesk"/);
  assert.match(css, /--font-body:\s*"DM Sans"/);
});

test("favicon uses the robot mark with red and blue eyes", async () => {
  const favicon = await read("favicon.svg");

  assert.match(favicon, /Greg Does AI robot icon/);
  assert.match(favicon, /fill="#2563EB"/);
  assert.match(favicon, /fill="#EF4444"/);
});

test("project details are data driven so more work can be added later", async () => {
  const script = await read("script.js");

  assert.match(script, /const projects = \[/);
  assert.match(script, /renderProjects\(\)/);
  assert.match(script, /project-card/);
});

test("project copy explains product value, not only generic AI activity", async () => {
  const script = await read("script.js");

  assert.match(script, /browser-based learning product/);
  assert.match(script, /small tactical world with clear rules/);
  assert.match(script, /actionable watchlist/);
  assert.match(script, /turning research, tradeoffs, and stakeholder context into usable briefs/);
});

test("projects are ordered with optimized local images and Tanks AiLOT link", async () => {
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

  assert.match(script, /assets\/project-ai-mini-mba\.webp/);
  assert.match(script, /assets\/project-tanks-ailot\.webp/);
  assert.match(script, /assets\/project-signal-scouts\.webp/);
  assert.match(script, /assets\/project-meridian-studio\.webp/);
  // Card images declare dimensions to avoid layout shift.
  assert.match(script, /width="1672"/);
  assert.match(script, /height="941"/);
  assert.match(script, /ai-mini-mba-interactive-course\.html/);
  assert.match(script, /url: "tanks-ailot\/"/);
  assert.match(script, /data-no-new-tab/);
});

test("optimized webp assets exist and are small", async () => {
  for (const name of [
    "project-ai-mini-mba",
    "project-tanks-ailot",
    "project-signal-scouts",
    "project-meridian-studio",
    "greg-kitchen-bio",
    "greg-kitchen-ai-humanoid",
  ]) {
    const file = await stat(new URL(`../assets/${name}.webp`, import.meta.url));
    assert.ok(file.size > 0, `${name}.webp should exist`);
    assert.ok(file.size < 200 * 1024, `${name}.webp should be under 200KB`);
  }
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
