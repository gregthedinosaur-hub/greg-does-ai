import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/* ---------- Home page ---------- */

test("home page lists every project and keeps the section anchors", async () => {
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

  for (const id of ["play", "log", "projects", "about"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("nav is Play · Log · Projects · About · Contact on every page", async () => {
  const home = await read("index.html");
  const contact = await read("contact.html");
  const tanks = await read("tanks-ailot/index.html");

  assert.match(home, /href="tanks-ailot\/">Play<\/a>\s*<a href="#log">Log<\/a>\s*<a href="#projects">Projects<\/a>\s*<a href="#about">About<\/a>\s*<a class="site-nav__cta" href="contact.html">Contact/);
  assert.match(contact, /href="tanks-ailot\/">Play/);
  assert.match(contact, /href="index\.html#log">Log/);
  assert.match(tanks, /href="\/tanks-ailot\/" aria-current="page">Play/);
  assert.match(tanks, /href="\/#log">Log/);
});

test("hero keeps the positioning line and puts the game beside it", async () => {
  const html = await read("index.html");

  assert.match(html, /<title>Greg Does AI \| Figuring It Out in Public<\/title>/);
  assert.match(html, /id="hero-title" class="hero-title">Greg Does AI</);
  assert.match(html, /Learning the machinery while everyone else is still reading the\s+memo/);
  // The game stage lives inside the hero, not in a separate featured section.
  const heroStart = html.indexOf('class="hero"');
  const heroEnd = html.indexOf('id="log"');
  const stage = html.indexOf('class="game-stage" id="play"');
  assert.ok(heroStart < stage && stage < heroEnd, "game stage should be inside the hero");
  // Retired hero furniture stays retired.
  assert.doesNotMatch(html, /hero-stats|hero-log|hero-sim|hero-portrait/);
});

test("hero shows a Now line fed by the newest log entry", async () => {
  const html = await read("index.html");
  const script = await read("script.js");

  assert.match(html, /class="hero__now" data-now/);
  assert.match(script, /querySelector\("\[data-now\]"\)/);
  assert.match(script, /buildLog\[0\]/);
});

test("build log comes before projects and entries are linkable", async () => {
  const html = await read("index.html");
  const script = await read("script.js");
  const css = await read("styles.css");

  assert.ok(html.indexOf('id="log"') < html.indexOf('id="projects"'));
  assert.match(html, /id="build-log-feed"/);
  assert.match(script, /const buildLog = \[/);
  assert.match(script, /date: "2026-05-23"/);
  assert.match(script, /id="log-\$\{entry\.date\}"/);
  assert.match(script, /href="#log-\$\{entry\.date\}"/);
  assert.match(css, /\.log-entry:target/);
});

test("projects render as a list, split into shipped and not-public-yet", async () => {
  const html = await read("index.html");
  const script = await read("script.js");

  assert.match(html, /id="project-list"/);
  assert.match(html, /id="project-list-upcoming"/);
  assert.match(html, /Not public yet/);
  assert.match(script, /projects\.filter\(\(p\) => p\.url\)/);
  assert.match(script, /projects\.filter\(\(p\) => !p\.url\)/);
  // Only shipped work carries a url and a thumbnail.
  assert.match(script, /url: "ai-mini-mba-interactive-course\.html"/);
  assert.match(script, /url: "tanks-ailot\/"/);
  assert.match(script, /url: "signalscouts\/"/);
  assert.match(script, /signalscouts\/art\/porchlight\.webp/);
  assert.match(script, /assets\/project-ai-mini-mba\.webp/);
  assert.match(script, /assets\/project-tanks-ailot\.webp/);
  assert.doesNotMatch(script, /project-signal-scouts|project-meridian-studio/);
  // Thumbnails declare dimensions to avoid layout shift.
  assert.match(script, /width="1672" height="941"/);
});

test("Tanks AiLOT trailer and playable embed are wired in the hero stage", async () => {
  const html = await read("index.html");
  const script = await read("script.js");
  const trailer = await stat(
    new URL("../assets/tanks-ailot-trailer.mp4", import.meta.url),
  );

  assert.match(html, /Tanks AiLOT marketing video/);
  assert.match(html, /assets\/tanks-ailot-trailer\.mp4/);
  assert.match(html, /poster="assets\/project-tanks-ailot\.webp"/);
  assert.match(html, /data-game-src="https:\/\/tanks-ailot\.pages\.dev"/);
  assert.match(html, /data-game-mode="trailer"/);
  assert.match(html, /data-game-mode="play"/);
  assert.match(html, /aria-pressed/);
  assert.match(html, /id="game-loading"/);
  assert.match(html, /id="game-fallback"/);
  assert.match(script, /bindGameStage/);
  assert.match(script, /document\.createElement\("iframe"\)/);
  assert.match(script, /frame\.src = media\.dataset\.gameSrc/);
  assert.ok(trailer.size > 0);
  // Cloudflare Pages rejects files over 25MB; the trailer should stay light.
  assert.ok(trailer.size < 10 * 1024 * 1024, "trailer should be under 10MB");
});

test("about shows one portrait and points at contact", async () => {
  const html = await read("index.html");

  assert.equal(html.match(/greg-kitchen-bio\.webp/g).length, 1, "portrait appears once");
  assert.match(html, /alt="Portrait of Greg Kitchen"/);
  assert.doesNotMatch(html, /greg-kitchen-ai-humanoid/);
  assert.match(html, /<a href="contact\.html">Get in touch<\/a>/);
});

/* ---------- Dedicated Tanks page ---------- */

test("Tanks AiLOT is hosted as a dedicated Greg Does AI page", async () => {
  const tanks = await read("tanks-ailot/index.html");

  assert.match(tanks, /<title>Tanks AiLOT \| Greg Does AI<\/title>/);
  assert.match(tanks, /href="\/"/);
  assert.match(tanks, /src="https:\/\/tanks-ailot\.pages\.dev"/);
  assert.match(tanks, /title="Tanks AiLOT playable game"/);
  assert.match(tanks, /Open full screen/);
  assert.match(tanks, /class="tanks-page"/);
});

/* ---------- Contact page ---------- */

test("site includes a contact page that emails Greg", async () => {
  const html = await read("index.html");
  const contact = await read("contact.html");
  const contactScript = await read("contact.js");

  assert.match(html, /href="contact\.html">Contact/);
  assert.match(contact, /<title>Contact Greg \| Greg Does AI<\/title>/);
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

/* ---------- Cross-cutting ---------- */

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

test("brand tokens are centralized and the type stack is two web fonts", async () => {
  const css = await read("styles.css");

  assert.match(css, /--color-bg:\s*#0F1114;/);
  assert.match(css, /--color-accent:\s*#5B9DFF;/);
  assert.match(css, /--font-display:\s*"Space Grotesk"/);
  assert.match(css, /--font-body:\s*system-ui/);
  assert.match(css, /--page-max:\s*1240px;/);
  // No gradient text, no third typeface.
  assert.doesNotMatch(css, /background-clip: text/);
  for (const page of ["index.html", "contact.html", "tanks-ailot/index.html"]) {
    const html = await read(page);
    assert.doesNotMatch(html, /DM\+Sans/, `${page} should not load DM Sans`);
    assert.match(html, /Space\+Grotesk/);
    assert.match(html, /JetBrains\+Mono/);
  }
});

test("favicon uses the robot mark with red and blue eyes", async () => {
  const favicon = await read("favicon.svg");

  assert.match(favicon, /Greg Does AI robot icon/);
  assert.match(favicon, /fill="#2563EB"/);
  assert.match(favicon, /fill="#EF4444"/);
});

test("optimized webp assets exist and are small", async () => {
  for (const name of [
    "project-ai-mini-mba",
    "project-tanks-ailot",
    "greg-kitchen-bio",
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
