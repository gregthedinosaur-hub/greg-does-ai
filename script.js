const projects = [
  {
    name: "AI Mini-MBA",
    status: "Interactive course",
    mode: "Persistent learning system",
    image: "assets/project-ai-mini-mba.png",
    imageAlt:
      "Interactive AI Mini-MBA course overview with module progress and learning controls",
    url: "ai-mini-mba-interactive-course.html",
    ctaLabel: "Open AI Mini-MBA",
    summary:
      "A self-paced AI course that remembers progress, notes, quizzes, and operator-track work.",
    description:
      "The AI Mini-MBA turns AI learning into a working system: modules, knowledge checks, reflections, sprint tasks, and capstone artifacts that persist in the browser so the user can leave and resume.",
    focus: [
      ["Progress memory", "Saves module progress and answers locally."],
      ["Applied learning", "Pairs concepts with quizzes and reflections."],
      ["Operator track", "Builds practical artifacts alongside the course."],
    ],
  },
  {
    name: "Tanks AiLOT",
    status: "Exploration",
    mode: "Applied AI testbed",
    image: "assets/project-tanks-ailot.png",
    imageAlt:
      "Minimal cobalt tactical simulation board with small tanks and path lines",
    url: "https://tanks-ailot.gregthedinosaur.workers.dev",
    ctaLabel: "Open Tanks AiLOT",
    summary:
      "A contained AI lab for experimenting with simulation, learning loops, and operational reasoning.",
    description:
      "Tanks AiLOT is intentionally treated as a sandbox: a place to test agent behaviors, compare approaches, and learn what scales before turning experiments into heavier systems.",
    focus: [
      ["Simulation", "Use bounded environments to test behavior."],
      ["Learning loops", "Observe what improves through iteration."],
      ["Operational clarity", "Translate experiments into usable lessons."],
    ],
  },
  {
    name: "Signal Scouts",
    status: "Prototype",
    mode: "Market sensing",
    image: "assets/project-signal-scouts.png",
    imageAlt:
      "Minimal cobalt signal map with markers feeding an attention queue",
    summary:
      "A scout-style workflow for watching weak signals and separating useful movement from noise.",
    description:
      "Signal Scouts focuses on disciplined scanning: collecting observations, tagging patterns, and surfacing what deserves human attention without pretending every blip is a trend.",
    focus: [
      ["Collection rhythm", "Give scanning work a repeatable cadence."],
      ["Pattern language", "Name what is changing in plain terms."],
      ["Attention queue", "Move important signals toward action."],
    ],
  },
  {
    name: "Meridian Studio",
    status: "In development",
    mode: "Research system",
    image: "assets/project-meridian-studio.png",
    imageAlt:
      "Minimal cobalt decision studio interface with a clear route line",
    summary:
      "A decision-mapping workspace for turning scattered context into a clearer strategic path.",
    description:
      "Meridian Studio is framed as a practical intelligence layer: a way to gather inputs, organize signal, and make tradeoffs easier to see before work becomes motion.",
    focus: [
      ["Signal maps", "Connect market, product, and operating context."],
      ["Decision trails", "Keep the logic visible as choices evolve."],
      ["Reusable briefs", "Turn raw findings into crisp working artifacts."],
    ],
  },
  {
    name: "More soon",
    status: "Living index",
    mode: "Future work",
    summary:
      "A clean slot for new systems as they become real enough to describe responsibly.",
    description:
      "This page is designed to grow without becoming noisy. New projects can be added to the data list, then promoted into deeper write-ups when the work has a public shape.",
    focus: [
      ["Simple updates", "Add new projects in one data structure."],
      ["Sanitized copy", "Keep public descriptions high-level."],
      ["Launch-ready", "Stay easy to deploy on Cloudflare Pages."],
    ],
  },
];

const tabs = document.querySelector("#project-tabs");
const detail = document.querySelector("#project-detail");

function renderTabs() {
  tabs.innerHTML = projects
    .map(
      (project, index) => `
        <button
          class="project-tab"
          id="project-tab-${index}"
          type="button"
          role="tab"
          aria-selected="${index === 0 ? "true" : "false"}"
          aria-controls="project-panel"
          data-project-index="${index}"
        >
          <span class="project-tab__name">${project.name}</span>
          <span class="project-tab__status">${project.status}</span>
        </button>
      `,
    )
    .join("");
}

function renderProject(index) {
  const project = projects[index];
  const imageMarkup = project.image
    ? `
      <figure class="project-visual">
        <img src="${project.image}" alt="${project.imageAlt}" loading="lazy" />
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

  detail.id = "project-panel";
  detail.setAttribute("aria-labelledby", `project-tab-${index}`);
  detail.innerHTML = `
    ${imageMarkup}
    <div class="project-detail__meta">
      <span class="meta-chip">${project.status}</span>
      <span class="meta-chip">${project.mode}</span>
    </div>
    <h3>${project.name}</h3>
    <p class="project-detail__summary">${project.summary}</p>
    <p class="project-detail__description">${project.description}</p>
    ${linkMarkup}
    <ul class="project-detail__focus">
      ${project.focus
        .map(
          ([title, copy]) => `
            <li>
              <strong>${title}</strong>
              ${copy}
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function setActiveProject(index) {
  document.querySelectorAll(".project-tab").forEach((tab, tabIndex) => {
    tab.setAttribute("aria-selected", String(tabIndex === index));
  });

  renderProject(index);
}

function bindProjectTabs() {
  tabs.addEventListener("click", (event) => {
    const tab = event.target.closest(".project-tab");

    if (!tab) {
      return;
    }

    setActiveProject(Number(tab.dataset.projectIndex));
  });
}

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

renderTabs();
renderProject(0);
bindProjectTabs();
revealOnScroll();
