# Greg AI Projects Page

Minimal static webpage for Greg Kitchen's AI project index. It is built for Cloudflare Pages and does not require a build step.

## Local Preview

```bash
npm test
npm run serve
```

Open `http://localhost:4173`.

## Content Updates

The home page is a lab notebook: hero with the playable Tanks stage, then the build log, then a project list, then a short bio.

- **Build log** entries live in `script.js` in the `buildLog` array, newest first. Each has `date`, `title`, `tried`, `broke`, `stuck`. The newest entry also fills the "Now" line in the hero. Entries get `#log-<date>` permalinks.
- **Projects** live in `script.js` in the `projects` array. A project with a `url` is "shipped" and gets a thumbnail (`assets/project-*.webp`, PNG source kept beside it); one without a `url` is listed under "Not public yet".
- Local project pages, such as the AI Mini-MBA course, live beside `index.html`. The course persists progress in the visitor's browser with `localStorage`.
- The dedicated Tanks AiLOT page lives at `tanks-ailot/index.html` and embeds the current build from `https://tanks-ailot.pages.dev`.
- The bio portrait is `assets/greg-kitchen-bio.webp`.
- The Tanks trailer is `assets/tanks-ailot-trailer.mp4`; the 30MB source video is gitignored (Cloudflare Pages 25MB file limit).
- Brand tokens (colors, two web fonts, page width) are centralized at the top of `styles.css`.

## GitHub And Cloudflare Pages

After approval, the deployment path is:

1. Commit the approved files.
2. Push the branch to a GitHub repository.
3. In Cloudflare Pages, connect the GitHub repo.
4. Use no build command.
5. Use `/` as the output directory.
6. Deploy from the approved production branch.

Cloudflare deployment should happen only after the page content and visual direction are approved.
