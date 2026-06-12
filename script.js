const projects = [
  {
    name: "AI Mini-MBA",
    status: "Interactive course",
    mode: "Persistent learning system",
    image: "assets/project-ai-mini-mba.webp",
    imageAlt:
      "Interactive AI Mini-MBA course overview with module progress and learning controls",
    url: "ai-mini-mba-interactive-course.html",
    ctaLabel: "Open AI Mini-MBA",
    summary:
      "A self-paced executive course for building working AI judgment, not just collecting AI vocabulary.",
    description:
      "The course packages ten modules, quizzes, reflections, a 30-day sprint, and a capstone worksheet into one browser-based learning product. It helps a busy operator turn AI concepts into practical decisions, visible artifacts, and a reusable personal operating system for continuing the work.",
    focus: ["Resume anytime", "Decision practice", "Career artifact"],
  },
  {
    name: "Tanks AiLOT",
    status: "Live game",
    mode: "Applied AI testbed",
    image: "assets/project-tanks-ailot.webp",
    imageAlt:
      "Minimal cobalt tactical simulation board with small tanks and path lines",
    video: "assets/tanks-ailot-trailer.mp4",
    videoLabel: "Tanks AiLOT marketing video",
    url: "https://tanks-ailot.gregthedinosaur.workers.dev",
    ctaLabel: "Open Tanks AiLOT",
    summary:
      "A browser simulation for stress-testing AI behavior in a small tactical world with clear rules.",
    description:
      "Tanks AiLOT turns agent experimentation into something observable: tanks, decisions, movement, outcomes, and repeatable scenarios. The product value is speed to learning: test how an AI agent reasons under constraints before applying similar patterns to messier business workflows.",
    focus: ["Agent behavior", "Repeatable trials", "Transferable lessons"],
  },
  {
    name: "Signal Scouts",
    status: "Prototype",
    mode: "Market sensing",
    image: "assets/project-signal-scouts.webp",
    imageAlt:
      "Minimal cobalt signal map with markers feeding an attention queue",
    summary:
      "A market-sensing workflow for turning scattered observations into an actionable watchlist.",
    description:
      "Signal Scouts is designed for teams that notice important market moves before they have a home. It gives early observations a place to land, a vocabulary for tagging them, and a simple path from raw signal to watchlist, brief, or next action.",
    focus: ["Capture", "Triage", "Briefing path"],
  },
  {
    name: "Meridian Studio",
    status: "In development",
    mode: "Research system",
    image: "assets/project-meridian-studio.webp",
    imageAlt:
      "Minimal cobalt decision studio interface with a clear route line",
    summary:
      "A decision workspace for turning research, tradeoffs, and stakeholder context into usable briefs.",
    description:
      "Meridian Studio is the place between research and action: collect inputs, map options, document the logic, and package the decision in a format people can actually use. It is built for moments when the hard part is not having more information, but knowing what to do with it.",
    focus: ["Context map", "Tradeoff view", "Brief output"],
  },
];

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

/* ---------- Project cards ---------- */

function renderProjects() {
  const grid = document.querySelector("#project-grid");

  if (!grid) {
    return;
  }

  grid.innerHTML = projects
    .map((project) => {
      const visualMarkup = project.image
        ? `
          <figure class="project-card__visual">
            <img
              src="${project.image}"
              alt="${project.imageAlt}"
              width="1672"
              height="941"
              loading="lazy"
            />
          </figure>
        `
        : "";
      const linkMarkup = project.url
        ? `
          <a
            class="button button--project"
            href="${project.url}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${project.ctaLabel}
          </a>
        `
        : "";

      return `
        <article class="project-card">
          ${visualMarkup}
          <div class="project-card__body">
            <div class="project-card__meta">
              <span class="meta-chip">${project.status}</span>
              <span class="meta-chip">${project.mode}</span>
            </div>
            <h3>${project.name}</h3>
            <p class="project-card__summary">${project.summary}</p>
            <p class="project-card__description">${project.description}</p>
            <ul class="project-card__focus">
              ${project.focus.map((item) => `<li>${item}</li>`).join("")}
            </ul>
            ${linkMarkup}
          </div>
        </article>
      `;
    })
    .join("");
}

/* ---------- Build log ---------- */

function renderBuildLog() {
  const feed = document.querySelector("#build-log-feed");

  if (!feed) {
    return;
  }

  feed.innerHTML = buildLog
    .map(
      (entry) => `
        <li class="build-log__entry">
          <time class="build-log__date" datetime="${entry.date}">${entry.date}</time>
          <div class="build-log__body">
            <h3>${entry.title}</h3>
            <dl class="build-log__lines">
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

/* ---------- Hero agent simulation ---------- */

function startHeroSim() {
  const canvas = document.querySelector("#hero-sim");
  const logEl = document.querySelector("#hero-log");
  const counterEl = document.querySelector("[data-sim-decisions]");

  if (!canvas || !canvas.getContext) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const COLORS = ["#5B9DFF", "#38D9F5", "#3F6FD8", "#7FB5FF"];
  const ACTIONS = [
    "repositioning",
    "lost line-of-sight → scanning",
    "target acquired → tracking",
    "flanking left",
    "holding position",
    "low cover → rerouting",
    "patrolling sector",
  ];

  let width = 0;
  let height = 0;
  let decisions = 0;
  const logLines = [];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();

  const tanks = COLORS.map((color, index) => ({
    id: `T-0${index + 1}`,
    color,
    x: Math.random() * width,
    y: Math.random() * height,
    heading: Math.random() * Math.PI * 2,
    target: null,
    trail: [],
  }));

  function pickTarget(tank) {
    tank.target = {
      x: 30 + Math.random() * Math.max(width - 60, 60),
      y: 30 + Math.random() * Math.max(height - 60, 60),
    };
    decisions += 1;

    const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    logLines.unshift(`[${tank.id}] ${action}`);
    logLines.length = Math.min(logLines.length, 3);

    if (counterEl) {
      counterEl.textContent = String(decisions);
    }

    if (logEl) {
      logEl.innerHTML = logLines
        .map((line, lineIndex) =>
          lineIndex === 0
            ? `<span class="hero-log__line hero-log__line--latest">${line}<span class="hero-log__cursor"></span></span>`
            : `<span class="hero-log__line">${line}</span>`,
        )
        .join("");
    }
  }

  tanks.forEach(pickTarget);

  function drawTank(tank) {
    // Trail
    if (tank.trail.length > 1) {
      ctx.strokeStyle = `${tank.color}33`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(tank.trail[0].x, tank.trail[0].y);
      tank.trail.forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.heading);

    // Vision cone
    const cone = ctx.createLinearGradient(0, 0, 64, 0);
    cone.addColorStop(0, `${tank.color}2E`);
    cone.addColorStop(1, `${tank.color}00`);
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 64, -0.42, 0.42);
    ctx.closePath();
    ctx.fill();

    // Body + turret
    ctx.fillStyle = tank.color;
    ctx.fillRect(-7, -5, 14, 10);
    ctx.strokeStyle = tank.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();

    ctx.restore();
  }

  function step() {
    tanks.forEach((tank) => {
      const dx = tank.target.x - tank.x;
      const dy = tank.target.y - tank.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 6) {
        pickTarget(tank);
        return;
      }

      const desired = Math.atan2(dy, dx);
      let delta = desired - tank.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      tank.heading += delta * 0.06;
      tank.x += Math.cos(tank.heading) * 0.55;
      tank.y += Math.sin(tank.heading) * 0.55;

      tank.trail.push({ x: tank.x, y: tank.y });
      if (tank.trail.length > 60) {
        tank.trail.shift();
      }
    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    tanks.forEach(drawTank);
  }

  if (reducedMotion) {
    // Static tactical frame: agents in place, no animation loop.
    for (let i = 0; i < 240; i += 1) {
      step();
    }
    draw();
    if (logEl) {
      logEl.innerHTML = `<span class="hero-log__line">[T-01] holding position</span>`;
    }
    return;
  }

  let running = true;

  draw();

  function frame() {
    // Hidden tabs are handled by the browser pausing requestAnimationFrame.
    if (running) {
      step();
      draw();
    }

    requestAnimationFrame(frame);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        running = entries[0].isIntersecting;
      },
      { threshold: 0 },
    ).observe(canvas);
  }

  window.addEventListener("resize", () => {
    resize();
  });

  requestAnimationFrame(frame);
}

/* ---------- Reveal on scroll ---------- */

function revealOnScroll() {
  const sections = document.querySelectorAll(".section");

  if (!("IntersectionObserver" in window)) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }

  sections.forEach((section) => section.classList.add("reveal"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.01 },
  );

  sections.forEach((section) => observer.observe(section));
}

renderProjects();
renderBuildLog();
bindGameStage();
startHeroSim();
revealOnScroll();
