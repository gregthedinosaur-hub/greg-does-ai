# Greg AI Projects Page

Minimal static webpage for Greg Kitchen's AI project index. It is built for Cloudflare Pages and does not require a build step.

## Local Preview

```bash
npm test
npm run serve
```

Open `http://localhost:4173`.

## Content Updates

- Project copy lives in `script.js` in the `projects` array.
- Project thumbnail images live in `assets/project-*.webp` (PNG sources kept beside them).
- External project links, such as Tanks AiLOT, are stored with each project in `script.js`.
- Local project pages, such as the AI Mini-MBA course, live beside `index.html`.
- The dedicated Tanks AiLOT page lives at `tanks-ailot/index.html` and embeds the current build from `https://tanks-ailot.pages.dev`.
- The AI Mini-MBA course persists progress in the visitor's browser with `localStorage`.
- The bio portrait is `assets/greg-kitchen-bio.webp`.
- Build log entries live in `script.js` in the `buildLog` array.
- The Tanks trailer is `assets/tanks-ailot-trailer.mp4`; the 30MB source video is gitignored (Cloudflare Pages 25MB file limit).
- Brand tokens are centralized in `styles.css`.

## GitHub And Cloudflare Pages

After approval, the deployment path is:

1. Commit the approved files.
2. Push the branch to a GitHub repository.
3. In Cloudflare Pages, connect the GitHub repo.
4. Use no build command.
5. Use `/` as the output directory.
6. Deploy from the approved production branch.

Cloudflare deployment should happen only after the page content and visual direction are approved.
