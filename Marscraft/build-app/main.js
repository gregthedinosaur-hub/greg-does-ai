import * as Phaser from 'phaser';
import { gameConfig } from './game/config.js';
import { artUrl } from './game/art.js';
import { isMuted, setMuted, startAudio } from './game/audio.js';
import { BALANCE, DIFFICULTY_LABEL, ENTITY_STATS, HYBRID_OF, RESEARCH, UNIT_BLOOM } from './sim/constants.js';
import { roleFor } from './sim/faction.js';
import { CAMPAIGN, FORKS, endingFor, MISSIONS, campaignBloom, forkResearch, pickDoctrine, TEXT, clockText, emptyProgress, missionUnlocked, objectiveLabels, parseProgress, portraitFor, recordResult, serializeProgress, text, } from './sim/campaign.js';
const app = document.querySelector('#app');
if (!app) {
    throw new Error('Missing #app root');
}
const difficultyButtons = (attr) => ['easy', 'medium', 'hard']
    .map((d) => `<button type="button" class="choice-button" ${attr}="${d}" aria-pressed="false"><strong>${DIFFICULTY_LABEL[d]}</strong></button>`)
    .join('');
// Static markup only; every dynamic string below goes in through textContent.
app.replaceChildren(document.createRange().createContextualFragment(`
  <main class="game-shell">
    <section class="stage" aria-label="MarsCraft battlefield">
      <div id="game"></div>
      <div id="hud" class="hud" aria-live="polite"></div>
      <div class="log-panel" data-log hidden>
        <img class="log-image" data-log-image alt="" />
        <span class="eyebrow" data-log-title></span>
        <div class="log-body" data-log-body></div>
        <div class="plate-compare" data-log-columns hidden></div>
        <div class="splash-actions" data-log-choices></div>
        <button type="button" class="splash-button" data-log-close>Close</button>
      </div>
      <div class="splash" data-splash>
        <img data-painting src="${artUrl('screen/title.jpg')}" alt="" />
        <div class="ending-violet" data-violet hidden></div>
        <div class="splash-shade"></div>
        <div class="splash-content">
          <div data-view="title">
            <span class="eyebrow">The Hush Below</span>
            <h2>MarsCraft</h2>
            <div class="splash-actions">
              <button type="button" class="splash-button" data-go="missions">Campaign</button>
              <button type="button" class="splash-button secondary" data-go="skirmish">Skirmish</button>
            </div>
          </div>
          <div data-view="skirmish" hidden>
            <h2>Skirmish</h2>
            <p class="splash-hook" data-skirmish-best></p>
            <div class="home-options">
              <div class="home-option-group" aria-label="Difficulty">${difficultyButtons('data-difficulty')}</div>
            </div>
            <div class="splash-actions">
              <button type="button" class="splash-button" data-start>Start</button>
              <button type="button" class="splash-button secondary" data-go="title">Back</button>
            </div>
          </div>
          <div data-view="missions" hidden>
            <img class="briefing-portrait" data-menu-portrait alt="" onerror="this.hidden = true" />
            <span class="eyebrow">Campaign</span>
            <div class="mission-list" data-mission-list></div>
            <div class="splash-actions" data-codex></div>
            <div class="splash-actions">
              <button type="button" class="splash-button secondary" data-new-campaign>New campaign</button>
              <button type="button" class="splash-button secondary" data-go="title">Back</button>
            </div>
          </div>
          <div data-view="briefing" hidden>
            <span class="eyebrow" data-briefing-id></span>
            <h2 data-briefing-title></h2>
            <p class="directive" data-briefing-directive></p>
            <div class="briefing-body">
              <img class="briefing-portrait" data-briefing-portrait alt="" />
              <p class="splash-hook" data-briefing-text></p>
            </div>
            <div class="home-option-group" aria-label="Difficulty">${difficultyButtons('data-campaign-difficulty')}</div>
            <div class="splash-actions">
              <button type="button" class="splash-button" data-launch disabled>Launch</button>
              <button type="button" class="splash-button secondary" data-go="missions">Back</button>
            </div>
          </div>
          <div data-view="debrief" hidden>
            <img class="briefing-portrait" data-debrief-portrait alt="" onerror="this.hidden = true" />
            <span class="eyebrow" data-debrief-mission></span>
            <h2 data-debrief-result></h2>
            <p class="splash-hook" data-debrief-memo></p>
            <ul class="debrief-stats" data-debrief-stats></ul>
            <div class="home-option-group" data-doctrines aria-label="Doctrine"></div>
            <div class="splash-actions">
              <button type="button" class="splash-button" data-next>Next</button>
              <button type="button" class="splash-button secondary" data-retry>Retry</button>
              <button type="button" class="splash-button secondary" data-go="title">Menu</button>
              <button type="button" class="splash-button secondary" data-copy>Copy result</button>
            </div>
          </div>
          <div data-view="ending" hidden>
            <p class="splash-hook" data-ending-text></p>
            <div class="splash-actions">
              <button type="button" class="splash-button" data-go="missions">Campaign</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
`));
new Phaser.Game(gameConfig);
const $ = (selector) => document.querySelector(selector);
const splash = $('[data-splash]');
const painting = $('[data-painting]');
const launchButton = $('[data-launch]');
const startButton = $('[data-start]');
const skirmishDifficultyButtons = Array.from(document.querySelectorAll('[data-difficulty]'));
const campaignDifficultyButtons = Array.from(document.querySelectorAll('[data-campaign-difficulty]'));
const params = new URL(window.location.href).searchParams;
let selectedDifficulty = params.get('difficulty') === 'medium' || params.get('difficulty') === 'hard' ? params.get('difficulty') : 'easy';
let sceneReady = false;
let briefingId = 'm1';
// What Retry / Restart relaunches; a fresh Launch from the briefing starts at 0 retries.
let lastLaunch = { retries: 0 };
let lastResult;
const SAVE_KEY = 'marscraft.progress';
let progress = loadProgress();
function loadProgress() {
    try {
        return parseProgress(localStorage.getItem(SAVE_KEY));
    }
    catch {
        return emptyProgress();
    }
}
// Mute is saved per browser, not per campaign.
const MUTE_KEY = 'marscraft.muted';
try {
    setMuted(localStorage.getItem(MUTE_KEY) === '1');
}
catch {
    // ponytail: storage blocked, so mute lasts for this tab only
}
function toggleMute() {
    setMuted(!isMuted());
    try {
        localStorage.setItem(MUTE_KEY, isMuted() ? '1' : '0');
    }
    catch {
        // storage blocked
    }
}
function saveProgress() {
    try {
        localStorage.setItem(SAVE_KEY, serializeProgress(progress));
    }
    catch {
        // ponytail: storage blocked (private mode), so progress lives for this tab only
    }
}
function showLog(entry) {
    const image = $('[data-log-image]');
    const path = entry.image ?? entry.portrait;
    image.hidden = !path;
    if (path)
        image.src = artUrl(path);
    $('[data-log]').classList.toggle('plate', Boolean(entry.image?.startsWith('screen/')));
    $('[data-log-title]').textContent = entry.title;
    const lines = (parent, items) => $(parent).replaceChildren(...items.map((line) => Object.assign(document.createElement('p'), { textContent: line })));
    lines('[data-log-body]', entry.paragraphs);
    lines('[data-log-columns]', entry.columns ?? []);
    $('[data-log-columns]').hidden = !entry.columns;
    $('[data-log-choices]').replaceChildren(...(entry.choices ?? []).map((choice) => {
        const button = Object.assign(document.createElement('button'), { type: 'button', className: 'splash-button', textContent: choice.label });
        button.addEventListener('click', () => {
            $('[data-log]').hidden = true;
            choice.onPick();
        });
        return button;
    }));
    // A fork can't be closed without a pick.
    $('[data-log-close]').hidden = Boolean(entry.choices);
    $('[data-log]').hidden = false;
}
// A species' codex plate (design 8): Varga's log and the fork's real numbers. With bloom, it is the live
// fork and carries the HARNESS / COUNTER picks; from the menu Codex it only re-reads.
function showPlate(species, bloom) {
    const skitter = ENTITY_STATS.skitter.hp;
    const shots = (damage) => Math.ceil(skitter / damage);
    const trooper = ENTITY_STATS['grafted-trooper'];
    const lancer = ENTITY_STATS['spine-lancer'];
    const stilt = ENTITY_STATS.stilt;
    const bulwark = ENTITY_STATS.heavy;
    const chimera = ENTITY_STATS.chimera;
    // The HARNESS hybrid and the COUNTER research for this species, named by their approved TEXT.
    const hybrid = Object.keys(HYBRID_OF).find((kind) => HYBRID_OF[kind] === species) ?? '';
    const counter = RESEARCH.find((row) => row.requires === `counter-${species}`)?.id ?? '';
    // Only the Skitter fork also walks 3 Troopers out of the Lab.
    const harness = BALANCE.forkBloom + (species === 'skitter' ? 3 * (UNIT_BLOOM['grafted-trooper'] ?? 0) : 0);
    const after = (bloom ?? 0) + harness;
    const crosses = [[25, 'Murmur'], [50, 'Chorus']].find(([mark]) => (bloom ?? 0) < Number(mark) && after >= Number(mark));
    const pick = (side) => () => document.dispatchEvent(new CustomEvent('supplywar:fork-pick', { detail: { species, side } }));
    showLog({
        image: `screen/codex-${species}.jpg`,
        title: `Codex: ${roleFor(species, 'enemy')}`,
        paragraphs: [...text(`codex.${species}`).split(/\n+/), `Permanent for this campaign. Saved when you win ${(FORKS[species] ?? '').toUpperCase()}.`],
        columns: species === 'mourner'
            ? [
                `Breach Shells: Bulwark ${bulwark.damage} dmg ×${bulwark.vsLarge} vs 300+ hp, ×${(bulwark.vsLarge ?? 1) * BALANCE.breachMult} vs 500+ hp (Mourner ${ENTITY_STATS.mourner.hp}, Cradle ${ENTITY_STATS.cradle.hp})`,
                `Chimera: ${chimera.hp} hp, ${chimera.damage} dmg ×${chimera.vsLarge} vs 300+ hp, ${chimera.splash}px splash, regenerates ${BALANCE.chimeraRegen} hp/s on Veinfield, +${UNIT_BLOOM.chimera} Bloom each`,
            ]
            : species === 'stilt'
                ? [
                    `Lattice: Sentry range ${ENTITY_STATS.turret.range} → ${BALANCE.latticeSentryRange}, Rifleman ${ENTITY_STATS.infantry.range} → ${ENTITY_STATS.infantry.range + BALANCE.latticeRifleRange} (Stilt ${stilt.range})`,
                    `Lancer: range ${lancer.range} vs Stilt ${stilt.range}, ${lancer.damage} dmg, ${lancer.hp} hp, +${UNIT_BLOOM['spine-lancer']} Bloom each`,
                ]
                : [
                    `Bayonet Rifleman: Skitter in ${shots(ENTITY_STATS.infantry.damage + 6)} shots`,
                    `Trooper: ${shots(trooper.damage)} shots, ${trooper.hp} hp, regenerates 2 hp/s, +${UNIT_BLOOM['grafted-trooper']} Bloom each`,
                ],
        choices: bloom === undefined
            ? undefined
            : [
                { label: `HARNESS · ${text(`unit.${hybrid.replaceAll('-', '_')}.name`)} · +${harness} Bloom → ${after}${crosses ? ` · crosses ${crosses[1]}` : ''}`, onPick: pick('harness') },
                { label: `COUNTER · ${text(`upgrade.${counter}.name`)} · 0 Bloom`, onPick: pick('counter') },
            ],
    });
}
document.addEventListener('supplywar:fork', (event) => {
    const { species, bloom } = event.detail;
    showPlate(species, bloom);
});
const LOGS = {
    'log.kepler-bunker': { image: 'neutral/kepler-bunker.png', title: 'Kepler crew bunker' },
    'log.okafor-last': { image: portraitFor('okafor', 'm3'), title: "Okafor's drone" },
};
$('[data-log-image]').addEventListener('error', (event) => {
    event.target.hidden = true;
});
$('[data-log-close]').addEventListener('click', () => {
    $('[data-log]').hidden = true;
    document.dispatchEvent(new CustomEvent('supplywar:resume'));
});
document.addEventListener('supplywar:log', (event) => {
    const { id } = event.detail;
    showLog({ ...(LOGS[id] ?? { title: '' }), paragraphs: text(id).split('\n') });
});
$('[data-briefing-portrait]').addEventListener('error', (event) => {
    event.target.hidden = true;
});
// A missing painting falls back to the title painting, then to the old key art.
painting.addEventListener('error', () => {
    if (!painting.src.includes('screen/title'))
        painting.src = artUrl('screen/title.jpg');
    else
        painting.src = 'src/assets/supply-war-key-art.png';
});
function setPainting(path) {
    if (!painting.src.endsWith(artUrl(path)))
        painting.src = artUrl(path);
}
function show(view) {
    document.querySelectorAll('[data-view]').forEach((element) => {
        element.hidden = element.dataset.view !== view;
    });
    $('[data-violet]').hidden = true;
    splash.classList.remove('hidden');
    if (view === 'missions')
        renderMissionList();
    if (view === 'skirmish')
        syncSkirmishControls();
    if (view === 'title' || view === 'missions' || view === 'skirmish')
        setPainting('screen/title.jpg');
}
function press(buttons, attr, value) {
    buttons.forEach((button) => {
        const active = button.getAttribute(attr) === value;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}
function recordLine(id) {
    if (!missionUnlocked(progress, id))
        return 'Locked';
    const record = progress.missions[id];
    if (!record)
        return MISSIONS[id] ? 'Ready' : 'Unlocked';
    const parts = [record.won ? 'Won' : 'Not won'];
    if (record.doctrine)
        parts.push(text(`doctrine.${record.doctrine}.name`));
    for (const [species, mission] of Object.entries(FORKS))
        if (mission === id && progress.forks[species])
            parts.push(progress.forks[species].toUpperCase());
    parts.push(`Bloom ${record.bloomNet}`);
    const difficulty = ['hard', 'medium', 'easy'].find((d) => record.best?.[d]);
    const best = difficulty && record.best?.[difficulty];
    if (difficulty && best)
        parts.push(`Best on ${DIFFICULTY_LABEL[difficulty]} ${clockText(best.ms)} · ${best.lost} lost`);
    return parts.join(' · ');
}
// The commander's portrait by campaign Bloom band (0-24 / 25-49 / 50+), like the debrief.
function renderMissionList() {
    const bloom = campaignBloom(progress);
    $('[data-menu-portrait]').src = artUrl(`portrait/commander-${bloom < 25 ? 1 : bloom < 50 ? 2 : 3}.jpg`);
    $('[data-mission-list]').replaceChildren(...CAMPAIGN.map((id) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice-button mission-row';
        button.disabled = !MISSIONS[id] || !missionUnlocked(progress, id);
        button.append(Object.assign(document.createElement('strong'), { textContent: `${id.toUpperCase()}${MISSIONS[id] ? ` · ${MISSIONS[id].title}` : ''}` }), Object.assign(document.createElement('span'), { textContent: recordLine(id) }));
        button.addEventListener('click', () => openBriefing(id));
        return button;
    }));
    // Codex: re-read the plate of every fork in the save; once the last mission is won, the ending too.
    const ending = Object.assign(document.createElement('button'), { type: 'button', className: 'splash-button secondary', textContent: 'Ending' });
    ending.addEventListener('click', showEnding);
    $('[data-codex]').replaceChildren(...Object.keys(progress.forks).map((species) => {
        const button = Object.assign(document.createElement('button'), { type: 'button', className: 'splash-button secondary', textContent: `Codex: ${roleFor(species, 'enemy')}` });
        button.addEventListener('click', () => showPlate(species));
        return button;
    }), ...(progress.missions[CAMPAIGN[CAMPAIGN.length - 1]]?.won ? [ending] : []));
}
function openBriefing(id) {
    const mission = MISSIONS[id];
    if (!mission)
        return show('missions');
    briefingId = id;
    setPainting(`screen/briefing-${id}.jpg`);
    $('[data-briefing-id]').textContent = id.toUpperCase();
    $('[data-briefing-title]').textContent = mission.title;
    $('[data-briefing-directive]').textContent = text(`${id}.directive`);
    $('[data-briefing-text]').textContent = text(mission.briefing);
    const portrait = $('[data-briefing-portrait]');
    const path = portraitFor(TEXT[mission.briefing]?.speaker, id);
    portrait.hidden = !path;
    if (path)
        portrait.src = artUrl(path);
    press(campaignDifficultyButtons, 'data-campaign-difficulty', progress.difficulty);
    launchButton.disabled = !sceneReady;
    show('briefing');
}
// The v1 ending (design 9 M5): one painting, with the text chosen by campaign Bloom.
// ponytail: one painting; second painting in v2
function showEnding() {
    const ending = endingFor(campaignBloom(progress));
    show('ending');
    setPainting('screen/ending.jpg');
    $('[data-violet]').hidden = ending !== 'new-voices';
    $('[data-ending-text]').textContent = text(`ending.${ending === 'new-voices' ? 'voices' : ending}`);
}
function launchMission(missionId, retries) {
    startAudio(); // every launch comes from a click, which unlocks WebAudio
    $('[data-log]').hidden = true;
    lastLaunch = { missionId, retries };
    // Doctrines and saved forks are permanent research ids; Bloom starts at the records of the missions before this one.
    // The skirmish starts clean on its own difficulty: no doctrines, forks or campaign Bloom.
    const doctrines = [...Object.values(progress.missions).flatMap((record) => (record.doctrine ? [record.doctrine] : [])), ...forkResearch(progress, missionId)];
    const detail = CAMPAIGN.includes(missionId)
        ? { missionId, difficulty: progress.difficulty, retries, seenHints: progress.seenHints, doctrines, bloom: campaignBloom(progress, missionId) }
        : { missionId, difficulty: selectedDifficulty, retries };
    document.dispatchEvent(new CustomEvent('supplywar:start', { detail }));
    splash.classList.add('hidden');
}
// The skirmish's best time on the picked difficulty, saved like a mission's.
function syncSkirmishControls() {
    press(skirmishDifficultyButtons, 'data-difficulty', selectedDifficulty);
    startButton.textContent = `Start ${DIFFICULTY_LABEL[selectedDifficulty]}`;
    const best = progress.missions.skirmish?.best?.[selectedDifficulty];
    $('[data-skirmish-best]').textContent = best ? `Best ${clockText(best.ms)} · ${best.lost} lost` : '';
}
function startSkirmish() {
    const url = new URL(window.location.href);
    if (selectedDifficulty === 'easy')
        url.searchParams.delete('difficulty');
    else
        url.searchParams.set('difficulty', selectedDifficulty);
    window.history.replaceState(null, '', url.toString());
    launchMission('skirmish', 0);
}
function showDebrief(state) {
    const id = state.match.missionId;
    const mission = MISSIONS[id];
    const won = state.winner === 'player';
    const campaign = CAMPAIGN.includes(id);
    $('[data-debrief-mission]').textContent = campaign ? `${id.toUpperCase()} · ${mission.title}` : mission.title;
    $('[data-debrief-result]').textContent = won ? 'Victory' : 'Defeat';
    // Bloom bands 0-24 / 25-49 / 50+ pick the memo and the commander portrait.
    const bloom = state.players.player.bloom;
    const band = bloom < 25 ? 0 : bloom < 50 ? 1 : 2;
    const portrait = $('[data-debrief-portrait]');
    portrait.hidden = false;
    portrait.src = artUrl(`portrait/commander-${band + 1}.jpg`);
    $('[data-debrief-memo]').textContent = won
        ? !campaign
            ? ''
            : text(`${id}.debrief.${['low', 'mid', 'high'][band]}`).replace('{ferrite}', `${Math.floor(state.players.player.ore)}`).replace('{marrow}', `${Math.floor(state.players.player.marrow)}`)
        : state.match.endReason === 'core-destroyed'
            ? 'Core destroyed'
            : (objectiveLabels(state, mission).find((item) => !item.done)?.label ?? '');
    const noise = Math.floor(state.players.player.mined / 100);
    const perWave = Math.round(mission.waves.disturbance * noise * 10) / 10;
    $('[data-debrief-stats]').replaceChildren(...[
        `Time ${clockText(state.timeMs)}`,
        `Units lost ${state.stats.playerUnitsLost}`,
        ...(mission.hud.includes('marrow') ? [`Units recovered ${state.stats.playerHusksDelivered}`] : []),
        `Retries ${state.match.retries}`,
        ...(mission.hud.includes('bloom') ? [`Bloom ${Math.floor(bloom)}`] : []),
        `Drill noise ${noise}: each wave +${perWave} points`,
    ].map((line) => Object.assign(document.createElement('li'), { textContent: line })));
    renderDoctrines(id, won);
    $('[data-next]').hidden = !won || !campaign;
    show('debrief');
}
function renderDoctrines(id, won) {
    const doctrines = won ? (MISSIONS[id].doctrines ?? []) : [];
    const picked = progress.missions[id]?.doctrine;
    $('[data-doctrines]').replaceChildren(...doctrines.map((doctrine) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `choice-button${picked === doctrine ? ' active' : ''}`;
        button.setAttribute('aria-pressed', picked === doctrine ? 'true' : 'false');
        button.append(Object.assign(document.createElement('strong'), { textContent: text(`doctrine.${doctrine}.name`) }), Object.assign(document.createElement('span'), { textContent: text(`doctrine.${doctrine}.description`) }));
        // Saved here; the next launch pre-loads it into the player's research. A Graft pick adds +5 to this mission's Bloom record.
        button.addEventListener('click', () => {
            progress = pickDoctrine(progress, id, doctrine);
            saveProgress();
            renderDoctrines(id, won);
        });
        return button;
    }));
}
document.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]');
    if (go)
        show(go.dataset.go);
});
skirmishDifficultyButtons.forEach((button) => button.addEventListener('click', () => {
    selectedDifficulty = button.dataset.difficulty;
    syncSkirmishControls();
}));
campaignDifficultyButtons.forEach((button) => button.addEventListener('click', () => {
    progress.difficulty = button.dataset.campaignDifficulty;
    saveProgress();
    press(campaignDifficultyButtons, 'data-campaign-difficulty', progress.difficulty);
}));
startButton.addEventListener('click', startSkirmish);
launchButton.addEventListener('click', () => launchMission(briefingId, 0));
$('[data-new-campaign]').addEventListener('click', () => {
    if (!window.confirm('Erase campaign progress?'))
        return;
    progress = { ...emptyProgress(), difficulty: progress.difficulty };
    saveProgress();
    renderMissionList();
});
$('[data-retry]').addEventListener('click', () => {
    if (lastLaunch.missionId)
        launchMission(lastLaunch.missionId, lastLaunch.retries + 1);
});
$('[data-next]').addEventListener('click', () => {
    const next = CAMPAIGN[CAMPAIGN.indexOf(lastLaunch.missionId ?? '') + 1];
    if (next && MISSIONS[next])
        openBriefing(next);
    else if (!next && lastResult?.winner === 'player')
        showEnding();
    else
        show('missions');
});
$('[data-copy]').addEventListener('click', () => {
    const state = lastResult;
    if (!state?.match.missionId)
        return;
    const line = `MarsCraft ${state.match.missionId.toUpperCase()} ${MISSIONS[state.match.missionId].title} · ${DIFFICULTY_LABEL[state.match.difficulty]} · ${clockText(state.timeMs)} · ${state.stats.playerUnitsLost} lost · Bloom ${Math.floor(state.players.player.bloom)}`;
    void navigator.clipboard?.writeText(line).catch(() => undefined);
});
document.addEventListener('supplywar:ready', () => {
    sceneReady = true;
    launchButton.disabled = false;
});
document.addEventListener('supplywar:end', (event) => {
    const { state } = event.detail;
    if (!state.match.missionId)
        return;
    lastResult = state;
    progress = recordResult(progress, state);
    saveProgress();
    showDebrief(state);
});
document.addEventListener('supplywar:restart', () => {
    if (lastLaunch.missionId)
        launchMission(lastLaunch.missionId, lastLaunch.retries + 1);
});
document.addEventListener('supplywar:quit', () => show('title'));
document.addEventListener('click', (event) => {
    if (event.target.closest('[data-mute]'))
        toggleMute();
});
document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM' && splash.classList.contains('hidden') && !event.metaKey && !event.ctrlKey)
        toggleMute();
});
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || splash.classList.contains('hidden'))
        return;
    const view = document.querySelector('[data-view]:not([hidden])');
    view?.querySelector('.splash-button:not([disabled])')?.click();
});
syncSkirmishControls();
const deepLink = params.get('mission');
if (deepLink && MISSIONS[deepLink])
    openBriefing(deepLink);
else
    show('title');
