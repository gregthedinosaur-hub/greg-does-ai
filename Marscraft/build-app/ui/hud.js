import { entityIsPowered, has, isSilent, requires, researchShown, unitCost } from '../sim/simulation.js';
import { FOUNDRY_FACTION, roleFor } from '../sim/faction.js';
import { MISSIONS, TEXT, clockText, heartbeatMs, objectiveLabels, portraitFor, researchName, text } from '../sim/campaign.js';
import { BALANCE, DIFFICULTY_LABEL, PRODUCES, RESEARCH, UNIT_BLOOM, UNIT_COST, UNIT_MARROW } from '../sim/constants.js';
import { artUrl } from '../game/art.js';
import { isMuted } from '../game/audio.js';
function labelFor(entity) {
    const role = roleFor(entity.kind);
    if (role)
        return role;
    return entity.kind
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
function productionText(entity, state) {
    if (entity.kind !== 'barracks' && entity.kind !== 'factory' && entity.kind !== 'core' && entity.kind !== 'xeno-lab' && entity.kind !== 'armory')
        return '';
    if (!entity.queue)
        return entityIsPowered(state, entity.id) ? 'Idle' : 'Stalled: no power';
    const progress = Math.round(100 - (entity.queue.remainingMs / entity.queue.totalMs) * 100);
    const overload = (entity.overloadMs ?? 0) > 0 ? ' overload' : '';
    const { unitKind, researchId } = entity.queue;
    const name = entity.queue.purge ? text('ability.purge.name') : researchId ? researchName(researchId) : labelFor({ ...entity, kind: unitKind ?? entity.kind });
    return entityIsPowered(state, entity.id) ? `${name} ${progress}%${overload}` : 'Production stalled';
}
function cooldownText(ms) {
    if (!ms || ms <= 0)
        return '';
    return `${Math.ceil(ms / 1000)}s`;
}
function commandStates(state, selected, pendingBuild) {
    // A command missing from the returned map is hidden.
    if (state.match.phase === 'complete')
        return {};
    const first = selected[0];
    const selectedOne = selected.length === 1;
    const canCore = selectedOne && first?.kind === 'core';
    const canWorkerBuild = selectedOne && first?.kind === 'worker';
    const mission = state.match.missionId ? MISSIONS[state.match.missionId] : undefined;
    // The worker's buildable list, filtered by mission unlocks.
    const build = (command) => {
        const visible = canWorkerBuild && (!mission || mission.builds.some((kind) => `build-${kind}` === command));
        return { visible, disabled: !visible, active: pendingBuild === command };
    };
    const wallet = state.players.player;
    const research = Object.fromEntries(RESEARCH.map((row) => {
        const visible = selectedOne && first?.kind === row.at && researchShown(state, 'player', row);
        const short = wallet.ore < row.cost || wallet.marrow < (row.marrow ?? 0) || (row.specimens && (wallet.specimens[row.specimens[0]] ?? 0) < row.specimens[1]);
        return [`research-${row.id}`, { visible, disabled: !visible || Boolean(first.queue) || has(state, 'player', row.id) || Boolean(short) }];
    }));
    // One static button per unit kind, visible when the selected building trains it and it is unlocked.
    const produce = Object.fromEntries(Object.keys(UNIT_COST).map((kind) => {
        const visible = selectedOne && Boolean(PRODUCES[first.kind]?.includes(kind)) && requires(state, 'player', kind);
        return [`produce-${kind}`, { visible, disabled: !visible || wallet.marrow < (UNIT_MARROW[kind] ?? 0) }];
    }));
    const hasMobile = selected.some((entity) => entity.speed > 0);
    const canRally = selectedOne && (first?.kind === 'barracks' || first?.kind === 'factory');
    const canRepair = selected.some((entity) => entity.kind === 'worker');
    const canEmpSpike = selectedOne && first?.kind === 'raider';
    const canExfilRaider = selected.some((entity) => entity.kind === 'raider') && state.powerLinks.some((link) => link.owner === 'enemy' && link.disabledMs > 0);
    const canOverload = Boolean(first && canRally && entityIsPowered(state, first.id) && (first.overloadCooldownMs ?? 0) <= 0);
    return {
        ...produce,
        ...research,
        'build-power-node': build('build-power-node'),
        'build-barracks': build('build-barracks'),
        'build-factory': build('build-factory'),
        'build-turret': build('build-turret'),
        'build-xeno-lab': build('build-xeno-lab'),
        'build-armory': build('build-armory'),
        'build-ferrite-silo': build('build-ferrite-silo'),
        purge: {
            visible: canCore && Boolean(mission?.hud.includes('bloom')),
            disabled: !canCore || Boolean(first.queue) || wallet.marrow < BALANCE.purgeMarrow,
            active: Boolean(first?.queue?.purge),
        },
        'attack-move': { visible: hasMobile, disabled: !hasMobile, active: state.attackMovePrimed },
        stop: { visible: hasMobile, disabled: !hasMobile },
        'hold-position': { visible: hasMobile, disabled: !hasMobile },
        'set-rally': { visible: canRally, disabled: !canRally, active: pendingBuild === 'set-rally' },
        'repair-link': { visible: canRepair, disabled: !canRepair, active: pendingBuild === 'repair-link' },
        'emp-spike': { visible: canEmpSpike, disabled: !canEmpSpike || (first.empCooldownMs ?? 0) > 0 },
        'exfil-raider': { visible: canExfilRaider, disabled: !canExfilRaider },
        overload: { visible: canRally, disabled: !canOverload, active: (first?.overloadMs ?? 0) > 0 },
        'marrow-overload': {
            visible: canRally && Boolean(mission?.hud.includes('marrow')),
            disabled: !canOverload || state.players.player.marrow < BALANCE.marrowOverloadCost,
            active: (first?.overloadMs ?? 0) > 0 && Boolean(first?.noStrain),
        },
    };
}
export function createHud(root, onCommand, onLocate, onGroup) {
    root.innerHTML = `
    <div class="hud-top">
      <div class="brand-lockup">
        <span class="eyebrow">MarsCraft</span>
        <h1>The Hush Below</h1>
        <div class="faction-tag">${FOUNDRY_FACTION.name} · ${FOUNDRY_FACTION.doctrine}</div>
      </div>
      <div class="top-actions">
        <div class="resource-strip">
          <div><img class="ferrite-icon" src="${artUrl('ui/icon-ferrite.png')}" alt="" width="20" height="20" onerror="this.hidden = true" /><span id="playerOre">0</span><small>Ferrite</small></div>
          <div id="marrowCell" hidden><img class="ferrite-icon" src="${artUrl('ui/icon-marrow.png')}" alt="" width="20" height="20" onerror="this.hidden = true" /><span id="playerMarrow">0</span><small>Marrow</small></div>
          <div id="bloomCell" class="bloom-cell" hidden><img class="ferrite-icon" src="${artUrl('ui/icon-bloom.png')}" alt="" width="20" height="20" onerror="this.hidden = true" /><span id="playerBloom">0</span><span class="bloom-bar" aria-hidden="true"><i id="bloomFill"></i></span><small id="bloomLabel"></small></div>
          <div id="linksCell" hidden><img class="ferrite-icon" src="${artUrl('ui/icon-power.png')}" alt="" width="20" height="20" onerror="this.hidden = true" /><span id="playerLinks">0/0</span><small>Links <button type="button" id="linksCut" class="links-cut" data-cut hidden></button></small></div>
        </div>
        <button type="button" id="muteButton" class="pause-button" data-mute aria-pressed="false">Mute</button>
        <button type="button" id="pauseButton" class="pause-button" data-command="pause-toggle" aria-pressed="false">Pause</button>
        <button type="button" class="reset-button" data-command="reset">Reset</button>
      </div>
      <section class="field-rail">
        <div id="matchChip" class="match-chip"></div>
        <div id="seismograph" class="seismograph" hidden>
          <canvas width="120" height="18" aria-hidden="true"></canvas>
          <span id="seismoSilent" hidden>SILENT</span>
        </div>
        <div id="statusChip" class="status-chip">Units auto-fire when enemies enter weapon range.</div>
        <ol id="objectiveList" class="objective-list" aria-label="Objectives"></ol>
        <div class="field-alerts">
          <span class="eyebrow">Field Alerts</span>
          <small id="rollCall" class="roll-call" hidden></small>
          <div id="alerts" class="alerts"></div>
        </div>
      </section>
    </div>
    <div class="hud-bottom">
      <section class="command-dock">
        <div class="selection-readout">
          <span class="eyebrow">Selection</span>
          <div id="selectionName" class="selection-name">No selection</div>
          <div id="selectionMeta" class="selection-meta">Click a unit or drag-select a squad.</div>
          <div id="groupStrip" class="group-strip" aria-label="Control groups"></div>
        </div>
        <div class="command-group">
          <span class="eyebrow">Commands</span>
          <div id="commandEmpty" class="command-empty">Select an asset for commands.</div>
          <div class="command-grid">
            <button type="button" data-command="produce-worker"><span>Drone</span><kbd>C</kbd></button>
            <button type="button" data-command="produce-infantry"><span>Infantry</span><kbd>Q</kbd></button>
            <button type="button" data-command="produce-raider"><span>Raider</span><kbd>E</kbd></button>
            <button type="button" data-command="produce-heavy" title="${text('unit.bulwark.description')}"><span>${text('unit.bulwark.name')}</span><kbd>T</kbd></button>
            <button type="button" data-command="produce-grafted-trooper" title="${text('unit.grafted_trooper.description')}"><span>${text('unit.grafted_trooper.name')} <small data-cost="grafted-trooper"></small></span></button>
            <button type="button" data-command="produce-spine-lancer" title="${text('unit.spine_lancer.description')}"><span>${text('unit.spine_lancer.name')} <small data-cost="spine-lancer"></small></span></button>
            <button type="button" data-command="produce-chimera" title="${text('unit.chimera.description')}"><span>${text('unit.chimera.name')} <small data-cost="chimera"></small></span></button>
            <button type="button" data-command="purge" title="${text('ability.purge.description')}"><span>${text('ability.purge.name')} <small>${BALANCE.purgeMarrow} marrow · −${BALANCE.purgeBloom} Bloom</small></span><kbd>G</kbd></button>
            <button type="button" data-command="build-power-node"><span>Power Node</span><kbd>N</kbd></button>
            <button type="button" data-command="build-barracks"><span>Barracks</span><kbd>B</kbd></button>
            <button type="button" data-command="build-factory" title="${text('building.factory.description')}"><span>${text('building.factory.name')}</span><kbd>F</kbd></button>
            <button type="button" data-command="build-turret"><span>Sentry</span><kbd>Y</kbd></button>
            <button type="button" data-command="build-xeno-lab"><span>Xeno Lab</span><kbd>L</kbd></button>
            <button type="button" data-command="build-armory" title="${text('building.armory.description')}"><span>${text('building.armory.name')}</span><kbd>U</kbd></button>
            <button type="button" data-command="build-ferrite-silo" title="${text('building.ferrite_silo.description')}"><span>${text('building.ferrite_silo.name')}</span><kbd>I</kbd></button>
            <button type="button" data-command="attack-move"><span>Attack Move</span><kbd>A</kbd></button>
            <button type="button" data-command="stop"><span>Stop</span><kbd>S</kbd></button>
            <button type="button" data-command="hold-position"><span>Hold</span><kbd>H</kbd></button>
            <button type="button" data-command="set-rally"><span>Rally</span><kbd>R</kbd></button>
            <button type="button" data-command="repair-link"><span>Repair</span><kbd>R</kbd></button>
            <button type="button" data-command="emp-spike" title="${text('ability.emp.description')}"><span>${text('ability.emp.name')}</span><kbd>X</kbd></button>
            <button type="button" data-command="exfil-raider"><span>Exfil</span><kbd>V</kbd></button>
            <button type="button" data-command="overload"><span>Overload</span><kbd>O</kbd></button>
            <button type="button" data-command="marrow-overload" title="${text('ability.marrow_overload.description')}"><span>${text('ability.marrow_overload.name')} <small id="marrowOverloadCost"></small></span><kbd>Z</kbd></button>
          </div>
        </div>
      </section>
    </div>
    <div id="pausePanel" class="pause-panel" hidden>
      <span class="eyebrow">Paused</span>
      <button type="button" class="splash-button" data-command="pause-toggle">Resume</button>
      <button type="button" class="splash-button secondary" data-command="restart">Restart</button>
      <details>
        <summary>Controls</summary>
        <ul class="controls-list">
          <li>Click select · drag box · right-click move or attack</li>
          <li>C Drone · Q Rifleman · E Raider · T Bulwark</li>
          <li>N Node · B Barracks · F Factory · Y Sentry · L Xeno Lab · U Armory · I Ferrite Silo</li>
          <li>Shift+click toggle · Shift+drag add · double-click selects that kind</li>
          <li>Ctrl or Option+1-9 set group · 1-9 recall · tap twice to centre</li>
          <li>A attack-move · S stop · H hold · R rally or repair</li>
          <li>O overload · Z marrow overload · G purge · X EMP · V exfil · Space last alert · P pause · M mute</li>
        </ul>
      </details>
      <button type="button" class="splash-button secondary" data-command="quit">Quit</button>
    </div>
  `;
    // One static button per RESEARCH row; names and blurbs are approved TEXT.
    root.querySelector('.command-grid').append(...RESEARCH.map((row) => {
        // A dissection row has only a short label, no blurb.
        const button = Object.assign(document.createElement('button'), { type: 'button', title: row.label ? '' : text(`upgrade.${row.id}.description`) });
        button.dataset.command = `research-${row.id}`;
        const cost = [row.cost ? `${row.cost}` : '', row.marrow ? `${row.marrow} marrow` : ''].filter(Boolean).join(' · ');
        button.append(Object.assign(document.createElement('span'), { textContent: researchName(row.id) }), Object.assign(document.createElement('kbd'), { textContent: cost }));
        return button;
    }));
    const seismo = root.querySelector('#seismograph canvas').getContext('2d');
    let alertsKey = '';
    let alertPoints = [];
    let objectivesKey = '';
    let groupsKey = '';
    let cutPoint;
    root.addEventListener('dblclick', (event) => {
        const group = event.target.closest('[data-group]');
        if (group)
            onGroup(Number(group.dataset.group), true);
    });
    root.addEventListener('click', (event) => {
        const group = event.target.closest('[data-group]');
        if (group) {
            onGroup(Number(group.dataset.group), false);
            return;
        }
        if (event.target.closest('[data-cut]') && cutPoint) {
            onLocate(cutPoint);
            return;
        }
        const locator = event.target.closest('[data-alert]');
        const alertPoint = locator && alertPoints[Number(locator.dataset.alert)];
        if (alertPoint) {
            onLocate(alertPoint);
            return;
        }
        const button = event.target.closest('[data-command]');
        if (!button)
            return;
        onCommand(button.dataset.command);
    });
    return {
        update(state, selected, pendingBuild, paused = false, groups = []) {
            root.querySelector('#playerOre').textContent = `${Math.floor(state.players.player.ore)}`;
            const mission = state.match.missionId ? MISSIONS[state.match.missionId] : undefined;
            // Marrow and Links appear from the mission that teaches them (mission.hud).
            root.querySelector('#marrowCell').toggleAttribute('hidden', !mission?.hud.includes('marrow'));
            root.querySelector('#linksCell').toggleAttribute('hidden', !mission?.hud.includes('links'));
            root.querySelector('#playerMarrow').textContent = `${Math.floor(state.players.player.marrow)}`;
            const ends = (id) => state.entities.find((entity) => entity.id === id);
            const links = state.powerLinks.filter((link) => link.owner === 'player' && ends(link.fromId) && ends(link.toId));
            const cut = links.filter((link) => link.disabledMs > 0);
            root.querySelector('#playerLinks').textContent = `${links.length - cut.length}/${links.length}`;
            root.querySelector('#linksCell').classList.toggle('danger', cut.length > 0);
            const cutButton = root.querySelector('#linksCut');
            cutButton.hidden = cut.length === 0;
            cutButton.textContent = `· ${cut.length} CUT`;
            const [from, to] = cut[0] ? [ends(cut[0].fromId), ends(cut[0].toId)] : [];
            cutPoint = from && to ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : undefined;
            // Bloom stays a mystery until its meter appears (M3).
            root.querySelector('#marrowOverloadCost').textContent = `${BALANCE.marrowOverloadCost} marrow · +${BALANCE.marrowOverloadBloom} ${mission?.hud.includes('bloom') ? 'Bloom' : '???'}`;
            // Every Bloom-adding button shows its Bloom in its cost line ("45 · 15 marrow · +2 Bloom").
            root.querySelectorAll('[data-cost]').forEach((cost) => {
                const kind = cost.dataset.cost;
                cost.textContent = `${unitCost(state, 'player', kind)} · ${UNIT_MARROW[kind]} marrow · +${UNIT_BLOOM[kind]} Bloom`;
            });
            // Bloom bar (design 5): "Hush +N%" is the exact wave multiplier, N = floor(Bloom/2).
            const bloom = state.players.player.bloom;
            root.querySelector('#bloomCell').toggleAttribute('hidden', !mission?.hud.includes('bloom'));
            root.querySelector('#playerBloom').textContent = `${Math.floor(bloom)}`;
            root.querySelector('#bloomFill').style.width = `${Math.min(100, bloom)}%`;
            root.querySelector('#bloomLabel').textContent = `Hush +${Math.floor(bloom / 2)}%${bloom < 25 ? ' · Murmur at 25' : bloom < 50 ? ' · Chorus at 50' : ''}`;
            // Murmur's roll-call lives in the comms panel, never the instrument strip: comms can lie, instruments can't.
            const drones = state.entities.filter((entity) => entity.owner === 'player' && entity.kind === 'worker' && entity.hp > 0).length;
            const rollCall = root.querySelector('#rollCall');
            rollCall.hidden = !mission || bloom < 25;
            rollCall.textContent = `Drones: ${drones} registered / ${drones + 1} responding`;
            // Chorus: the HUD frame swaps to its veined variant.
            root.classList.toggle('veined', bloom >= 50);
            root.querySelector('#pausePanel').toggleAttribute('hidden', !paused);
            const selectionName = root.querySelector('#selectionName');
            const selectionMeta = root.querySelector('#selectionMeta');
            if (selected.length === 0) {
                selectionName.textContent = 'No selection';
                selectionMeta.textContent = state.attackMovePrimed ? 'Attack-move armed. Click the field.' : 'Left-click to select. Right-click attacks or attack-moves.';
            }
            else if (selected.length === 1) {
                const entity = selected[0];
                selectionName.textContent = labelFor(entity);
                const production = productionText(entity, state);
                const role = roleFor(entity.kind);
                selectionMeta.textContent =
                    pendingBuild === 'set-rally'
                        ? 'Rally armed. Click a reinforcement route.'
                        : pendingBuild === 'repair-link'
                            ? 'Repair armed. Click a friendly disabled power link.'
                            : pendingBuild?.startsWith('build-')
                                ? `${pendingBuild.replace('build-', '').replace('-', ' ')} placement armed. Click open ground.`
                                : production ||
                                    `${role ? `${FOUNDRY_FACTION.name} · ` : ''}${Math.ceil(entity.hp)} / ${entity.maxHp} HP${cooldownText(entity.overloadCooldownMs) ? ` · overload ${cooldownText(entity.overloadCooldownMs)}` : ''}${cooldownText(entity.empCooldownMs) ? ` · EMP ${cooldownText(entity.empCooldownMs)}` : ''}`;
            }
            else {
                const raiders = selected.filter((entity) => entity.kind === 'raider').length;
                selectionName.textContent = `${selected.length} units selected`;
                const sever = mission ? `${text('ability.sever.name')}: ${text('ability.sever.description')}` : `${raiders} raider${raiders === 1 ? '' : 's'} ready to cut power links.`;
                selectionMeta.textContent = raiders > 0 ? sever : 'Click ground to move or enemies to attack.';
            }
            const states = commandStates(state, selected, pendingBuild);
            let visibleCommands = 0;
            root.querySelectorAll('.command-grid [data-command]').forEach((button) => {
                const buttonState = states[button.dataset.command] ?? { visible: false };
                button.hidden = !buttonState.visible;
                button.disabled = Boolean(buttonState.disabled);
                button.classList.toggle('active', Boolean(buttonState.active));
                if (buttonState.visible)
                    visibleCommands += 1;
            });
            const commandEmpty = root.querySelector('#commandEmpty');
            commandEmpty.textContent = state.match.phase === 'complete' ? 'Match complete.' : 'Select an asset for commands.';
            commandEmpty.toggleAttribute('hidden', visibleCommands > 0);
            const difficulty = DIFFICULTY_LABEL[state.match.difficulty];
            // A mission without a deadline shows elapsed time instead of a countdown.
            const clock = mission && !mission.objectives.some((item) => item.kind === 'survive' && !item.after) ? state.timeMs : state.match.durationMs - state.timeMs;
            // A timed climax still coming (M4's Tide) gets its own countdown.
            const climax = mission?.climaxes.find((item) => item.atMs !== undefined && item.atMs > state.timeMs && !state.match.fired.includes(`${item.id}#0`));
            const countdown = climax && !mission?.objectives.some((item) => item.kind === 'survive' && !item.after) ? ` · ${climax.id[0].toUpperCase()}${climax.id.slice(1)} ${clockText(climax.atMs - state.timeMs)}` : '';
            root.querySelector('#matchChip').textContent = `${difficulty} · ${mission?.title ?? ''} · ${clockText(clock)}${countdown}`;
            // The objective list is rebuilt only when a label changes.
            const objectives = mission ? objectiveLabels(state, mission) : [];
            const nextObjectivesKey = objectives.map((item) => `${item.label}${item.done}`).join('|');
            if (nextObjectivesKey !== objectivesKey) {
                objectivesKey = nextObjectivesKey;
                const list = root.querySelector('#objectiveList');
                list.replaceChildren(...objectives.map((item) => {
                    const li = document.createElement('li');
                    li.className = item.done ? 'done' : 'active';
                    li.append(Object.assign(document.createElement('span'), { textContent: item.label }));
                    return li;
                }));
            }
            // Seismograph: one tick per heartbeat on sim time; flat with an amber SILENT label in the pre-wave silence.
            // It is the visible channel for the silence, and the only one when muted.
            root.querySelector('#seismograph').toggleAttribute('hidden', !mission);
            if (mission && seismo) {
                const silent = isSilent(state, mission);
                const beat = heartbeatMs(state.players.player.mined);
                root.querySelector('#seismoSilent').toggleAttribute('hidden', !silent);
                seismo.clearRect(0, 0, 120, 18);
                seismo.strokeStyle = silent ? '#FFC857' : '#C8FF8A';
                seismo.beginPath();
                for (let x = 0; x < 120; x += 1) {
                    const phase = (((state.timeMs - (119 - x) * 25) % beat) + beat) % beat;
                    const y = silent ? 9 : phase < 50 ? 2 : phase < 100 ? 15 : 9;
                    if (x === 0)
                        seismo.moveTo(x, y);
                    else
                        seismo.lineTo(x, y);
                }
                seismo.stroke();
            }
            const muteButton = root.querySelector('#muteButton');
            muteButton.textContent = isMuted() ? 'Unmute' : 'Mute';
            muteButton.setAttribute('aria-pressed', isMuted() ? 'true' : 'false');
            // Group strip: stored groups only; click recalls, double-click centres.
            const nextGroupsKey = groups.map((ids) => ids.length).join('|');
            if (nextGroupsKey !== groupsKey) {
                groupsKey = nextGroupsKey;
                root.querySelector('#groupStrip').replaceChildren(...groups.flatMap((ids, n) => {
                    if (n === 0 || ids.length === 0)
                        return [];
                    const button = Object.assign(document.createElement('button'), { type: 'button', textContent: `${n}·${ids.length}` });
                    button.dataset.group = `${n}`;
                    return [button];
                }));
            }
            const pauseButton = root.querySelector('#pauseButton');
            pauseButton.textContent = paused ? 'Resume' : 'Pause';
            pauseButton.setAttribute('aria-pressed', paused ? 'true' : 'false');
            // Rebuilt only on change, so a ◎ locator survives between mousedown and click.
            const nextAlertsKey = state.alerts.map((alert) => alert.id).join('|');
            if (nextAlertsKey !== alertsKey) {
                alertsKey = nextAlertsKey;
                alertPoints = state.alerts.map((alert) => alert.point);
                root.querySelector('#alerts').replaceChildren(...state.alerts.map((alert, index) => {
                    const row = document.createElement('p');
                    // Murmur's fake alerts have no point, so no ◎ locator (design 11 fairness rule).
                    if (alert.point) {
                        const locator = Object.assign(document.createElement('button'), { type: 'button', className: 'locator', textContent: '◎' });
                        locator.dataset.alert = `${index}`;
                        locator.setAttribute('aria-label', 'Show on map');
                        row.append(locator);
                    }
                    const portrait = portraitFor(alert.textId ? TEXT[alert.textId]?.speaker : undefined, state.match.missionId);
                    if (portrait) {
                        const img = Object.assign(document.createElement('img'), { className: 'alert-portrait', src: artUrl(portrait), alt: '', width: 48, height: 48 });
                        img.addEventListener('error', () => img.remove());
                        row.append(img);
                    }
                    row.append(alert.text);
                    return row;
                }));
            }
            const statusChip = root.querySelector('#statusChip');
            const playerDisabled = state.powerLinks.some((link) => link.owner === 'player' && link.disabledMs > 0);
            const enemyDisabled = state.powerLinks.some((link) => link.owner === 'enemy' && link.disabledMs > 0);
            statusChip.textContent = paused
                ? 'Paused. Resume when ready.'
                : playerDisabled
                    ? 'Power cut: production stalled. Defend the grid.'
                    : enemyDisabled
                        ? 'Enemy grid cut. Push, snipe repairs, or exfil the raider.'
                        : pendingBuild
                            ? pendingBuild === 'set-rally'
                                ? 'Rally placement armed. Click where reinforcements should push.'
                                : pendingBuild === 'repair-link'
                                    ? 'Repair mode armed. Click a friendly red power link.'
                                    : 'Build placement armed. Click open ground.'
                            : state.match.objective;
            statusChip.toggleAttribute('hidden', !statusChip.textContent);
            statusChip.classList.toggle('danger', playerDisabled);
            statusChip.classList.toggle('success', enemyDisabled);
        },
    };
}
