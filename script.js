// Shipped projects have a url; the rest are listed under "Not public yet".
const projects = [
  {
    name: "AI Mini-MBA",
    status: "Interactive course",
    image: "assets/project-ai-mini-mba.webp",
    url: "ai-mini-mba-interactive-course.html",
    summary:
      "A self-paced executive course for building working AI judgment, not just collecting AI vocabulary.",
  },
  {
    name: "Tanks AiLOT",
    status: "Live game",
    image: "assets/project-tanks-ailot.webp",
    url: "tanks-ailot/",
    summary:
      "A browser simulation for stress-testing AI behavior in a small tactical world with clear rules.",
  },
  {
    name: "Signal Scouts",
    status: "Live game",
    image: "signalscouts/art/porchlight.webp",
    url: "signalscouts/",
    summary:
      "A spooky tower-defense adventure with 15 cases, an expanding crew, signal-chain tactics, and a final boss.",
  },
  {
    name: "Meridian Studio",
    status: "In development",
    summary:
      "A decision workspace for turning research, tradeoffs, and stakeholder context into usable briefs.",
  },
];

// Newest first. The top entry also feeds the "Now" line in the hero.
const buildLog = [
  {
    date: "2026-06-11",
    title: "Site redesign + playable Tanks embed",
    tried: "Rebuilt the site around the game: dark telemetry theme, card grid, trailer/play toggle.",
    broke: "The hidden attribute lost to a CSS display rule, so the trailer sat on top of the game.",
    stuck: "Lazy-loading the live game in an iframe — visitors can play without leaving the page.",
  },
  {
    date: "2026-05-24",
    title: "Tanks AiLOT marketing revamp",
    tried: "Cut a 20-second trailer for the updated build and wired it into the homepage.",
    broke: "First export was 30MB — fine on desktop wifi, brutal everywhere else.",
    stuck: "Re-encoded at CRF 27: same 1080p, 78% smaller, instant start.",
  },
  {
    date: "2026-05-23",
    title: "Launched Greg Does AI",
    tried: "Shipped a single-page index for the experiments instead of waiting for them to be finished.",
    broke: "Nothing yet — launch day optimism.",
    stuck: "The data-driven project list, so new work is one array entry away.",
  },
];

// All markup below is built from the constants above (author-owned, no user
// input), so string templates are safe here.

/* ---------- Projects ---------- */

function projectRow(project) {
  const shipped = Boolean(project.url);
  const title = shipped
    ? `<a href="${project.url}">${project.name}</a>`
    : project.name;
  const thumb = shipped
    ? `
      <a class="project-row__thumb" href="${project.url}" tabindex="-1" aria-hidden="true">
        <img src="${project.image}" alt="" width="1672" height="941" loading="lazy" />
      </a>
    `
    : "";

  return `
    <li class="project-row${shipped ? " project-row--shipped" : ""}">
      ${thumb}
      <div>
        <h3>${title}</h3>
        <p>${project.summary}</p>
      </div>
      <span class="project-row__status">${project.status}</span>
    </li>
  `;
}

function renderProjects() {
  const shipped = document.querySelector("#project-list");
  const upcoming = document.querySelector("#project-list-upcoming");

  if (!shipped || !upcoming) {
    return;
  }

  shipped.innerHTML = projects.filter((p) => p.url).map(projectRow).join("");
  upcoming.innerHTML = projects.filter((p) => !p.url).map(projectRow).join("");
}

/* ---------- Build log ---------- */

function renderBuildLog() {
  const feed = document.querySelector("#build-log-feed");
  const now = document.querySelector("[data-now]");

  if (feed) {
    feed.innerHTML = buildLog
      .map(
        (entry) => `
          <li class="log-entry" id="log-${entry.date}">
            <a class="log-entry__date" href="#log-${entry.date}">
              <time datetime="${entry.date}">${entry.date}</time>
            </a>
            <div>
              <h3>${entry.title}</h3>
              <dl class="log-entry__lines">
                <div><dt>Tried</dt><dd>${entry.tried}</dd></div>
                <div><dt>Broke</dt><dd>${entry.broke}</dd></div>
                <div><dt>Stuck</dt><dd>${entry.stuck}</dd></div>
              </dl>
            </div>
          </li>
        `,
      )
      .join("");
  }

  if (now && buildLog[0]) {
    const latest = buildLog[0];
    now.insertAdjacentHTML(
      "beforeend",
      `<time datetime="${latest.date}">${latest.date}</time>
       <a href="#log-${latest.date}">${latest.title}</a>`,
    );
  }
}

/* ---------- Tanks game stage ---------- */

function bindGameStage() {
  const media = document.querySelector("#game-media");
  const toggles = document.querySelectorAll("[data-game-mode]");

  if (!media || !toggles.length) {
    return;
  }

  const trailer = media.querySelector("#game-trailer");
  const loading = media.querySelector("#game-loading");
  const fallback = media.querySelector("#game-fallback");
  let frame = null;
  let fallbackTimer = null;

  function setMode(mode) {
    toggles.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.gameMode === mode),
      );
    });

    media.classList.toggle("is-playing", mode === "play");

    if (mode === "play") {
      trailer.pause();
      trailer.hidden = true;

      if (!frame) {
        loading.hidden = false;
        fallbackTimer = window.setTimeout(() => {
          fallback.hidden = false;
        }, 8000);

        frame = document.createElement("iframe");
        frame.src = media.dataset.gameSrc;
        frame.title = "Tanks AiLOT — playable game";
        frame.loading = "lazy";
        frame.allow = "fullscreen";
        frame.addEventListener("load", () => {
          loading.hidden = true;
          window.clearTimeout(fallbackTimer);
        });
        media.append(frame);
      }

      frame.hidden = false;
    } else {
      if (frame) {
        frame.hidden = true;
      }

      loading.hidden = true;
      trailer.hidden = false;
    }
  }

  toggles.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.gameMode));
  });
}

renderProjects();
renderBuildLog();
bindGameStage();
