import * as Phaser from 'phaser';
import { createInitialStateWithOptions } from '../../sim/createInitialState.js';
import { tickSimulation, issueSmartCommand, isBuildCommand, isSilent, climaxMast, corrosionMs, dissected, buildTotalMs, closedToDamage } from '../../sim/simulation.js';
import { FORKS, GRIEF, MISSIONS, heartbeatMs, objectiveTarget } from '../../sim/campaign.js';
import { BALANCE, ENTITY_STATS, HYBRID_OF, VEINFIELD, VIEW } from '../../sim/constants.js';
import { entityVisualState, exploitWindowState, powerLinkVisualState } from '../../sim/visualState.js';
import { createHud } from '../../ui/hud.js';
import { roleFor } from '../../sim/faction.js';
import { ART, artIdFor, artUrl } from '../art.js';
import { updateAudio } from '../audio.js';
const FOG_CELL = 40;
// Camera pan speed (arrow keys and screen edges), px per ms.
const PAN_SPEED = 0.6;
const COLORS = {
    player: 0x60a5fa,
    enemy: 0xc8ff8a,
    neutral: 0xa7b4cc,
    powered: 0x74d4ff,
    disabled: 0xff5d73,
    amber: 0xfff1c2,
    plasma: 0x9ee7ff,
    surface: 0x13182a,
    surfaceAlt: 0x1a2035,
    border: 0x1e2640,
    text: '#EDF2FF',
};
function difficultyFromValue(value) {
    return value === 'medium' || value === 'hard' ? value : 'easy';
}
function matchOptionsFromUrl() {
    if (typeof window === 'undefined')
        return { difficulty: 'easy' };
    const params = new URLSearchParams(window.location.search);
    return {
        difficulty: difficultyFromValue(params.get('difficulty')),
        missionId: MISSIONS[params.get('mission') ?? ''] ? (params.get('mission') ?? undefined) : undefined,
    };
}
export class GameScene extends Phaser.Scene {
    currentOptions = matchOptionsFromUrl();
    state = createInitialStateWithOptions(this.currentOptions);
    worldGraphics;
    overlayGraphics;
    fxGraphics;
    fogGraphics;
    statusGraphics;
    // Sprite pool keyed by entity id; facing and hit flash ride along in the sprite's data.
    sprites = new Map();
    seen = new Set();
    labels = [];
    hud;
    dragStart;
    dragRect;
    hoverPoint;
    elapsedSinceTick = 0;
    pendingCommand;
    effects = [];
    paused = false;
    started = false;
    endSent = false;
    log = [];
    missionGround = [];
    // Control groups 1-9 (index 0 unused), plus the last click and digit for double-click / double-tap.
    groups = Array.from({ length: 10 }, () => []);
    lastClick = { at: -1000, id: '' };
    lastDigit = { at: -1000, n: 0 };
    // A ring where the HUD last jumped the camera (an alert locator or "N CUT").
    ping;
    vignette;
    // Scrolling maps only: the minimap camera and its overlay (viewport box, cue rings), which the main camera ignores.
    minimap;
    minimapGraphics;
    arrows;
    // Screen-edge pan direction; it outlives the pointer leaving the canvas.
    edge = { x: 0, y: 0 };
    fogGrid = new Uint8Array(0);
    fogState;
    resumeListener = () => {
        this.paused = false;
    };
    // The codex plate's HARNESS / COUNTER pick, logged through apply() so replays include it.
    forkListener = (event) => {
        const { species, side } = event.detail;
        this.apply({ actorIds: [], targetPoint: { x: 0, y: 0 }, mode: `fork-${species}-${side}` });
        this.paused = false;
    };
    startGameListener = (event) => {
        const detail = event.detail ?? {};
        this.currentOptions = {
            ...detail,
            difficulty: difficultyFromValue(detail.difficulty),
        };
        this.resetMatch(this.currentOptions);
        this.started = true;
    };
    constructor() {
        super('GameScene');
    }
    preload() {
        // A missing PNG just logs a 404 and that kind draws only its rings.
        for (const [id, entry] of Object.entries(ART))
            this.load.image(id, artUrl(entry.path));
    }
    create() {
        this.worldGraphics = this.add.graphics().setDepth(1);
        this.overlayGraphics = this.add.graphics().setDepth(4);
        this.fxGraphics = this.add.graphics().setDepth(5);
        this.fogGraphics = this.add.graphics().setDepth(5.5);
        this.statusGraphics = this.add.graphics().setDepth(6);
        this.minimapGraphics = this.add.graphics().setDepth(7);
        this.cameras.main.ignore(this.minimapGraphics);
        this.setupCamera();
        this.arrows = this.input.keyboard?.addKeys({ left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN' });
        this.input.mouse?.disableContextMenu();
        const hudRoot = document.querySelector('#hud');
        if (hudRoot) {
            this.hud = createHud(hudRoot, (command) => this.handleHudCommand(command), (point) => {
                this.cameras.main.centerOn(point.x, point.y);
                this.ping = { point, until: this.time.now + 2500 };
            }, (n, centre) => this.recallGroup(n, centre));
        }
        document.addEventListener('supplywar:start', this.startGameListener);
        document.addEventListener('supplywar:resume', this.resumeListener);
        document.addEventListener('supplywar:fork-pick', this.forkListener);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            document.removeEventListener('supplywar:start', this.startGameListener);
            document.removeEventListener('supplywar:resume', this.resumeListener);
            document.removeEventListener('supplywar:fork-pick', this.forkListener);
        });
        this.input.on('pointerdown', (pointer) => {
            if (this.paused)
                return;
            const mini = this.minimap;
            if (mini && pointer.x >= mini.x && pointer.x < mini.x + mini.width && pointer.y >= mini.y && pointer.y < mini.y + mini.height) {
                const point = mini.getWorldPoint(pointer.x, pointer.y);
                this.cameras.main.centerOn(point.x, point.y);
                return;
            }
            this.startDrag({ x: pointer.worldX, y: pointer.worldY });
        });
        this.input.on('pointermove', (pointer) => {
            this.edge = {
                x: pointer.x < 16 ? -1 : pointer.x > VIEW.width - 16 ? 1 : 0,
                y: pointer.y < 16 ? -1 : pointer.y > VIEW.height - 16 ? 1 : 0,
            };
            if (this.paused)
                return;
            this.hoverPoint = { x: pointer.worldX, y: pointer.worldY };
            if (!this.dragStart || !pointer.isDown || !this.dragRect)
                return;
            const x = Math.min(this.dragStart.x, pointer.worldX);
            const y = Math.min(this.dragStart.y, pointer.worldY);
            const width = Math.abs(pointer.worldX - this.dragStart.x);
            const height = Math.abs(pointer.worldY - this.dragStart.y);
            this.dragRect.setPosition(x + width / 2, y + height / 2).setSize(width, height);
        });
        this.input.on('pointerup', (pointer) => {
            if (this.paused)
                return;
            this.handlePointerRelease({ x: pointer.worldX, y: pointer.worldY }, pointer.button === 2, Boolean(pointer.event.shiftKey));
        });
        this.input.on('gameout', (_time, event) => {
            this.hoverPoint = undefined;
            this.game.canvas.style.cursor = 'default';
            // Moving onto a HUD panel stops edge pan; leaving the canvas keeps panning toward the edge(s) it left by.
            const target = event.relatedTarget;
            if (target instanceof Element && target.closest('#hud')) {
                this.edge = { x: 0, y: 0 };
                return;
            }
            const { x, y } = this.input.activePointer;
            const nearest = Math.min(x, VIEW.width - x, y, VIEW.height - y);
            const near = (distance) => distance === nearest || distance < 48;
            this.edge = { x: near(x) ? -1 : near(VIEW.width - x) ? 1 : 0, y: near(y) ? -1 : near(VIEW.height - y) ? 1 : 0 };
        });
        // Two-finger scroll pans 1:1.
        this.input.on('wheel', (_pointer, _over, dx, dy) => {
            this.cameras.main.scrollX += dx;
            this.cameras.main.scrollY += dy;
        });
        this.game.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
        this.bindCommandHotkeys();
        this.bindControlGroups();
        this.input.keyboard?.on('keydown-ESC', () => {
            this.setSelection([], false);
            this.pendingCommand = undefined;
        });
        this.input.keyboard?.on('keydown-SPACE', () => {
            // Murmur's fake alerts have no point, so Space skips them.
            const point = this.state.alerts.find((alert) => alert.point)?.point;
            if (point)
                this.cameras.main.centerOn(point.x, point.y);
        });
        this.input.keyboard?.on('keydown-P', () => {
            if (this.started && !this.state.winner)
                this.paused = !this.paused;
        });
        // main.ts keeps Launch disabled until this fires.
        document.dispatchEvent(new CustomEvent('supplywar:ready'));
    }
    // A map that fits the view never scrolls. A bigger one pads its bounds so every edge can come out from under the
    // HUD's top band and command dock, gets a minimap in the free bottom-left corner, and starts on the player's Core.
    setupCamera() {
        const { width, height } = this.state.map;
        const main = this.cameras.main;
        if (this.minimap)
            this.cameras.remove(this.minimap);
        this.minimap = undefined;
        if (width <= VIEW.width && height <= VIEW.height) {
            main.setBounds(0, 0, width, height);
            return;
        }
        main.setBounds(0, -160, width, height + 330);
        const core = this.state.entities.find((entity) => entity.owner === 'player' && entity.kind === 'core');
        if (core)
            main.centerOn(core.x, core.y);
        this.minimap = this.cameras.add(12, VIEW.height - 112, 160, 100).setZoom(Math.min(160 / width, 100 / height)).centerOn(width / 2, height / 2);
        this.minimap.setBackgroundColor(0x050813).ignore([this.statusGraphics, this.fogGraphics]);
    }
    panCamera(delta) {
        const keys = this.arrows;
        const dx = Math.sign((keys?.right.isDown ? 1 : 0) - (keys?.left.isDown ? 1 : 0) + this.edge.x);
        const dy = Math.sign((keys?.down.isDown ? 1 : 0) - (keys?.up.isDown ? 1 : 0) + this.edge.y);
        this.cameras.main.scrollX += dx * PAN_SPEED * delta;
        this.cameras.main.scrollY += dy * PAN_SPEED * delta;
    }
    bindCommandHotkeys() {
        const keyboard = this.input.keyboard;
        if (!keyboard)
            return;
        const hotkeys = [
            ['C', 'produce-worker'],
            ['Q', 'produce-infantry'],
            ['E', 'produce-raider'],
            ['T', 'produce-heavy'],
            ['N', 'build-power-node'],
            ['B', 'build-barracks'],
            ['F', 'build-factory'],
            ['Y', 'build-turret'],
            ['L', 'build-xeno-lab'],
            ['U', 'build-armory'],
            ['I', 'build-ferrite-silo'],
            ['G', 'purge'],
            ['A', 'attack-move'],
            ['S', 'stop'],
            ['H', 'hold-position'],
            ['R', 'context-r'],
            ['O', 'overload'],
            ['Z', 'marrow-overload'],
            ['X', 'emp-spike'],
            ['V', 'exfil-raider'],
        ];
        for (const [key, command] of hotkeys) {
            keyboard.on(`keydown-${key}`, () => {
                if (this.paused || !this.started)
                    return;
                const resolved = command === 'context-r' ? this.contextualRCommand() : command;
                this.handleHudCommand(resolved);
            });
        }
    }
    // Ctrl or Option + 1-9 stores a group (read from event.code, so Option's altered characters don't matter);
    // Cmd+digit is left to the browser. A plain digit recalls; a double-tap centres the camera.
    bindControlGroups() {
        this.input.keyboard?.on('keydown', (event) => {
            const n = /^Digit([1-9])$/.exec(event.code)?.[1];
            if (!n || event.metaKey || this.paused || !this.started)
                return;
            if (event.ctrlKey || event.altKey) {
                event.preventDefault();
                this.groups[Number(n)] = this.selectedEntities().filter((entity) => entity.owner === 'player').map((entity) => entity.id);
                return;
            }
            const now = this.time.now;
            const doubleTap = this.lastDigit.n === Number(n) && now - this.lastDigit.at < 300;
            this.lastDigit = { at: now, n: Number(n) };
            this.recallGroup(Number(n), doubleTap);
        });
    }
    recallGroup(n, centre) {
        const ids = this.groups[n].filter((id) => this.state.entities.some((entity) => entity.id === id));
        this.groups[n] = ids;
        if (ids.length === 0)
            return;
        this.setSelection(ids, false);
        this.pendingCommand = undefined;
        const lead = this.selectedEntities()[0];
        if (centre && lead)
            this.cameras.main.centerOn(lead.x, lead.y);
    }
    contextualRCommand() {
        return this.selectedEntities().some((entity) => entity.kind === 'worker') ? 'repair-link' : 'set-rally';
    }
    update(_time, delta) {
        // A pending fork holds the sim (P can't unpause it) until the plate's pick arrives.
        const running = this.started && !this.paused && !this.state.match.pendingFork;
        if (running)
            this.elapsedSinceTick += delta;
        while (running && !this.paused && this.elapsedSinceTick >= 50) {
            const before = this.state;
            this.state = tickSimulation(this.state, 50);
            this.collectEffects(before, this.state);
            this.elapsedSinceTick -= 50;
            // A story log (the Kepler bunker) pauses the game; main.ts shows the panel and sends supplywar:resume.
            const log = this.state.match.fired.find((id) => id.startsWith('log.') && !before.match.fired.includes(id));
            if (log) {
                this.paused = true;
                document.dispatchEvent(new CustomEvent('supplywar:log', { detail: { id: log } }));
            }
            const fork = this.state.match.pendingFork;
            if (fork && !before.match.pendingFork) {
                this.paused = true;
                document.dispatchEvent(new CustomEvent('supplywar:fork', { detail: { species: fork, bloom: this.state.players.player.bloom } }));
            }
        }
        if (this.started)
            this.panCamera(delta);
        if (running)
            this.updateEffects(delta);
        this.render();
        const mission = this.state.match.missionId ? MISSIONS[this.state.match.missionId] : undefined;
        updateAudio({
            silent: !running || this.state.winner !== undefined || !mission || isSilent(this.state, mission),
            heartbeatMs: heartbeatMs(this.state.players.player.mined),
            timeMs: this.state.timeMs,
            bloom: this.state.players.player.bloom,
        });
        this.hud?.update(this.state, this.selectedEntities(), this.pendingCommand, this.paused, this.groups);
        this.updateCanvasCursor();
        window.__supplyWarState = this.state;
        window.__supplyWarLog = this.log;
        if (this.started && this.state.winner && !this.endSent) {
            this.endSent = true;
            document.dispatchEvent(new CustomEvent('supplywar:end', { detail: { state: this.state, log: this.log } }));
        }
    }
    // Every player action reaches the sim here, logged as [timeMs, cmd] for runReplay.
    apply(command) {
        this.log.push([this.state.timeMs, command]);
        this.state = issueSmartCommand(this.state, command);
    }
    handleHudCommand(command) {
        if (command === 'pause-toggle') {
            this.paused = !this.paused;
            return;
        }
        if (command === 'reset' || command === 'restart' || command === 'quit') {
            // main.ts owns the save, so it handles retries (+1) and the menu.
            this.paused = false;
            if (command === 'quit')
                this.started = false;
            document.dispatchEvent(new CustomEvent(command === 'quit' ? 'supplywar:quit' : 'supplywar:restart'));
            return;
        }
        if (this.paused)
            return;
        if (command === 'attack-move') {
            this.state = { ...this.state, attackMovePrimed: true };
            this.pendingCommand = undefined;
            return;
        }
        const selected = this.selectedEntities();
        if (command === 'exfil-raider') {
            const actorIds = selected.filter((entity) => entity.kind === 'raider').map((entity) => entity.id);
            if (actorIds.length > 0) {
                this.apply({
                    actorIds,
                    targetPoint: { x: 260, y: 380 },
                    mode: 'smart',
                });
            }
            this.pendingCommand = undefined;
            return;
        }
        if (command === 'stop' || command === 'hold-position') {
            const actorIds = selected.filter((entity) => entity.speed > 0).map((entity) => entity.id);
            if (actorIds.length > 0) {
                this.apply({
                    actorIds,
                    targetPoint: selected[0],
                    mode: command,
                });
            }
            this.pendingCommand = undefined;
            return;
        }
        if (command === 'set-rally') {
            if (selected.length === 1 && (selected[0].kind === 'barracks' || selected[0].kind === 'factory'))
                this.pendingCommand = command;
            return;
        }
        if (command === 'emp-spike') {
            if (selected.length === 1 && selected[0].kind === 'raider') {
                const before = this.state;
                const actor = selected[0];
                this.apply({
                    actorIds: [actor.id],
                    targetPoint: actor,
                    mode: 'emp-spike',
                });
                this.collectImmediateLinkEffects(before, this.state);
                this.emitEmpCommandEffects(actor);
            }
            this.pendingCommand = undefined;
            return;
        }
        if (command === 'repair-link') {
            if (selected.some((entity) => entity.kind === 'worker'))
                this.pendingCommand = command;
            return;
        }
        if (isBuildCommand(command)) {
            if (selected.length === 1 && selected[0].kind === 'worker') {
                this.pendingCommand = command;
            }
            return;
        }
        if (selected.length !== 1)
            return;
        this.apply({
            actorIds: [selected[0].id],
            targetId: selected[0].id,
            targetPoint: selected[0],
            mode: command,
        });
    }
    resetMatch(options) {
        this.currentOptions = options;
        this.state = createInitialStateWithOptions(options);
        this.paused = false;
        this.pendingCommand = undefined;
        this.effects = [];
        this.elapsedSinceTick = 0;
        this.log = [];
        this.groups = this.groups.map(() => []);
        this.endSent = false;
        for (const sprite of this.sprites.values())
            sprite.destroy();
        this.sprites.clear();
        this.buildMissionGround();
        this.setupCamera();
    }
    // A map-sized regolith TileSprite at depth 0 and decal Images at 0.5, tinted by the mission; sprites never are.
    buildMissionGround() {
        for (const item of this.missionGround)
            item.destroy();
        this.missionGround = [];
        const mission = this.state.match.missionId ? MISSIONS[this.state.match.missionId] : undefined;
        if (!mission)
            return;
        if (this.textures.exists('ground.regolith')) {
            const ground = this.add.tileSprite(0, 0, mission.map.width, mission.map.height, 'ground.regolith').setOrigin(0).setDepth(0);
            this.missionGround.push(ground.setTint(mission.ambient.tint));
        }
        for (const [id, x, y, angle] of mission.decals) {
            if (!this.textures.exists(id))
                continue;
            const source = this.textures.get(id).getSourceImage();
            const width = ART[id]?.width ?? source.width;
            const decal = this.add.image(x, y, id).setDepth(0.5).setDisplaySize(width, width * (source.height / source.width)).setAngle(angle ?? 0);
            this.missionGround.push(decal.setTint(mission.ambient.tint));
        }
    }
    startDrag(point) {
        this.dragStart = point;
        this.dragRect?.destroy();
        this.dragRect = this.add.rectangle(point.x, point.y, 1, 1, 0x60a5fa, 0.12).setStrokeStyle(1, 0x60a5fa, 0.8).setDepth(6);
        this.minimap?.ignore(this.dragRect);
    }
    handlePointerRelease(end, forceCommand, shift) {
        if (!this.dragStart)
            return;
        const dragDistance = Phaser.Math.Distance.Between(this.dragStart.x, this.dragStart.y, end.x, end.y);
        const start = this.dragStart;
        this.dragStart = undefined;
        this.dragRect?.destroy();
        this.dragRect = undefined;
        if (dragDistance > 10 && !forceCommand) {
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            const boxed = this.state.entities
                .filter((entity) => entity.owner === 'player' && entity.speed > 0 && entity.x >= minX && entity.x <= maxX && entity.y >= minY && entity.y <= maxY)
                .map((entity) => entity.id);
            // Shift+drag adds to the selection.
            this.setSelection(shift ? [...new Set([...this.state.selectedIds, ...boxed])] : boxed);
            this.pendingCommand = undefined;
            return;
        }
        this.handleClick(end, forceCommand, shift);
    }
    handleClick(point, forceCommand, shift = false) {
        const clickedEntity = this.entityAt(point);
        const clickedLink = this.linkAt(point);
        const selected = this.selectedEntities();
        if (this.pendingCommand && isBuildCommand(this.pendingCommand) && selected.length === 1 && selected[0].kind === 'worker') {
            this.apply({
                actorIds: [selected[0].id],
                targetPoint: point,
                mode: this.pendingCommand,
            });
            this.pendingCommand = undefined;
            return;
        }
        if (this.pendingCommand === 'set-rally' && selected.length === 1 && (selected[0].kind === 'barracks' || selected[0].kind === 'factory')) {
            this.apply({
                actorIds: [selected[0].id],
                targetPoint: point,
                mode: 'set-rally',
            });
            this.pendingCommand = undefined;
            return;
        }
        if (this.pendingCommand === 'repair-link') {
            const workerIds = selected.filter((entity) => entity.kind === 'worker').map((entity) => entity.id);
            if (workerIds.length > 0 && clickedLink) {
                this.apply({
                    actorIds: workerIds,
                    targetId: clickedLink.id,
                    targetPoint: point,
                    mode: 'repair-link',
                });
                this.pendingCommand = undefined;
            }
            return;
        }
        if (!forceCommand && clickedEntity?.owner === 'player') {
            const now = this.time.now;
            const doubleClick = this.lastClick.id === clickedEntity.id && now - this.lastClick.at < 300;
            this.lastClick = { at: now, id: clickedEntity.id };
            const view = this.cameras.main.worldView;
            if (shift) {
                // Shift+click toggles one entity in or out of the selection.
                const ids = this.state.selectedIds;
                this.setSelection(ids.includes(clickedEntity.id) ? ids.filter((id) => id !== clickedEntity.id) : [...ids, clickedEntity.id], false);
            }
            else if (doubleClick) {
                // Double-click selects every own entity of that kind on screen.
                this.setSelection(this.state.entities.filter((entity) => entity.owner === 'player' && entity.kind === clickedEntity.kind && view.contains(entity.x, entity.y)).map((entity) => entity.id), false);
            }
            else {
                this.setSelection([clickedEntity.id], false);
            }
            this.pendingCommand = undefined;
            return;
        }
        if (selected.length === 0)
            return;
        const actorIds = selected.filter((entity) => entity.speed > 0).map((entity) => entity.id);
        if (actorIds.length === 0)
            return;
        const targetId = clickedLink?.id ?? clickedEntity?.id;
        const rightClickTargetAttack = forceCommand && (clickedEntity?.owner === 'enemy' || clickedEntity?.kind === 'ore' || clickedEntity?.kind === 'husk' || clickedEntity?.kind === 'okafor-drone');
        this.apply({
            actorIds,
            targetId,
            targetPoint: point,
            mode: rightClickTargetAttack ? 'smart' : forceCommand || this.state.attackMovePrimed ? 'attack-move' : 'smart',
        });
        this.state = { ...this.state, attackMovePrimed: false };
    }
    setSelection(selectedIds, attackMovePrimed = this.state.attackMovePrimed) {
        this.state = { ...this.state, selectedIds, attackMovePrimed };
    }
    selectedEntities() {
        return this.state.selectedIds.map((id) => this.state.entities.find((entity) => entity.id === id)).filter((entity) => Boolean(entity));
    }
    entityAt(point) {
        return [...this.state.entities]
            .reverse()
            .find((entity) => this.shouldDrawEntity(entity) && Phaser.Math.Distance.Between(point.x, point.y, entity.x, entity.y) <= entity.radius + 8);
    }
    linkAt(point) {
        return this.state.powerLinks.find((link) => {
            const from = this.state.entities.find((entity) => entity.id === link.fromId);
            const to = this.state.entities.find((entity) => entity.id === link.toId);
            if (!from || !to)
                return false;
            if (link.owner === 'enemy' && !this.isPointVisible({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }))
                return false;
            return this.distanceToSegment(point, from, to) < 12;
        });
    }
    linkMidpoint(link) {
        const from = this.state.entities.find((entity) => entity.id === link.fromId);
        const to = this.state.entities.find((entity) => entity.id === link.toId);
        return from && to ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : undefined;
    }
    hoveredSabotageLink() {
        if (!this.hoverPoint || !this.selectedEntities().some((entity) => entity.owner === 'player' && entity.kind === 'raider'))
            return undefined;
        const link = this.linkAt(this.hoverPoint);
        return link && link.owner === 'enemy' && link.disabledMs <= 0 ? link : undefined;
    }
    updateCanvasCursor() {
        if (this.state.winner) {
            this.game.canvas.style.cursor = 'default';
            return;
        }
        const hoverLink = this.hoveredSabotageLink();
        if (hoverLink) {
            this.game.canvas.style.cursor = 'crosshair';
            return;
        }
        if (this.hoverPoint && this.entityAt(this.hoverPoint)?.owner === 'player') {
            this.game.canvas.style.cursor = 'pointer';
            return;
        }
        this.game.canvas.style.cursor = this.state.attackMovePrimed ? 'crosshair' : 'default';
    }
    distanceToSegment(point, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0)
            return Phaser.Math.Distance.Between(point.x, point.y, a.x, a.y);
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
        return Phaser.Math.Distance.Between(point.x, point.y, a.x + t * dx, a.y + t * dy);
    }
    render() {
        if (!this.worldGraphics || !this.overlayGraphics)
            return;
        this.updateFogGrid();
        this.worldGraphics.clear();
        this.overlayGraphics.clear();
        this.fxGraphics?.clear();
        this.fogGraphics?.clear();
        this.statusGraphics?.clear();
        this.seen.clear();
        // ponytail: Text labels recreated per frame; pool if profiling says so
        for (const label of this.labels)
            label.destroy();
        this.labels = [];
        const mission = this.state.match.missionId ? MISSIONS[this.state.match.missionId] : undefined;
        this.drawVeinfields();
        for (const link of this.state.powerLinks)
            this.drawPowerLink(link);
        for (const entity of this.state.entities) {
            if (this.shouldDrawEntity(entity))
                this.drawEntity(entity);
        }
        this.updateVignette();
        this.sweepSprites();
        this.drawTacticalMarkers();
        this.drawFog();
        this.drawEffects();
        this.drawExploitWindow();
        this.drawCues();
        this.drawEnemyHoverLabel();
        if (this.state.winner)
            this.drawWinner(this.state.winner);
        this.drawMinimap(mission);
    }
    // The main camera's viewport box, plus rings on the active objective target and fresh pointed alerts.
    drawMinimap(mission) {
        const g = this.minimapGraphics;
        g.clear();
        if (!this.minimap)
            return;
        this.minimap.ignore(this.labels);
        const px = 1 / this.minimap.zoom;
        const view = this.cameras.main.worldView;
        g.lineStyle(1.5 * px, 0xedf2ff, 0.9).strokeRect(view.x, view.y, view.width, view.height);
        for (const alert of this.state.alerts)
            if (alert.point && alert.ageMs < 2500)
                g.lineStyle(1.5 * px, COLORS.powered, 1).strokeCircle(alert.point.x, alert.point.y, 6 * px);
        const target = mission && !this.state.winner ? objectiveTarget(this.state, mission) : undefined;
        if (target)
            g.lineStyle(2 * px, COLORS.enemy, 1).strokeCircle(target.x, target.y, 7 * px);
    }
    // The vein ground under each Veinfield source (2.4x its rule radius; the decal fades well before its edge), plus a 1px
    // lime ring at exactly the rule radius on the heartbeat while a player unit is within radius + 100px (bible 5).
    drawVeinfields() {
        for (const entity of this.state.entities) {
            const radius = VEINFIELD[entity.kind];
            if (!radius || entity.owner !== 'enemy' || !this.textures.exists('hush.veinfield'))
                continue;
            const key = `${entity.id}-veinfield`;
            // Pooled with the sprites; owner 'neutral' makes sweepSprites drop it as soon as the source dies.
            const decal = this.sprites.get(key) ?? this.add.image(entity.x, entity.y, 'hush.veinfield').setDepth(0.6).setData({ owner: 'neutral' });
            this.sprites.set(key, decal.setDisplaySize(radius * 2.4, radius * 2.4));
            this.seen.add(key);
            const near = this.state.entities.some((unit) => unit.owner === 'player' && unit.speed > 0 && unit.hp > 0 && Phaser.Math.Distance.Between(unit.x, unit.y, entity.x, entity.y) <= radius + 100);
            if (near)
                this.overlayGraphics.lineStyle(1, COLORS.enemy, this.heartbeat()).strokeCircle(entity.x, entity.y, radius);
        }
    }
    // Heartbeat alpha (0.3-0.8) for veins and Veinfield rings.
    heartbeat() {
        return 0.3 + 0.5 * Math.pow(Math.max(0, Math.sin((this.state.timeMs * 2 * Math.PI) / heartbeatMs(this.state.players.player.mined))), 8);
    }
    // Chorus (Bloom 50+) darkens the edges; postFX needs WEBGL, so canvas skips it.
    updateVignette() {
        const chorus = this.state.players.player.bloom >= 50;
        const fx = this.cameras.main.postFX;
        if (chorus && !this.vignette && fx)
            this.vignette = fx.addVignette(0.5, 0.5, 0.9, 0.3);
        if (!chorus && this.vignette) {
            fx?.remove(this.vignette);
            this.vignette = undefined;
        }
    }
    drawEnemyHoverLabel() {
        const entity = this.hoverPoint ? this.entityAt(this.hoverPoint) : undefined;
        if (!entity || entity.owner !== 'enemy')
            return;
        // A fork species reads "Skitter: ???" until dissected in this save, then its real stats.
        const name = roleFor(entity.kind, 'enemy') ?? entity.kind;
        const outranged = ['infantry', 'turret', 'heavy', 'grafted-trooper'].filter((kind) => ENTITY_STATS[kind].range < entity.range).map((kind) => roleFor(kind));
        const stats = `${name} · hp ${entity.maxHp} · range ${entity.range}${outranged.length ? ` · outranges ${outranged.join(', ')}` : ''}`;
        const grief = GRIEF[entity.kind] ? ` · Grief ${GRIEF[entity.kind]} · killing it calls a Grief wave` : '';
        // The Cradle's ribs: "Fed by N veins" while any Spire vein is live.
        const living = (id) => this.state.entities.some((item) => item.id === id && item.hp > 0);
        const veins = entity.kind === 'cradle' ? this.state.powerLinks.filter((link) => link.toId === entity.id && link.disabledMs <= 0 && living(link.fromId)).length : 0;
        const fed = veins > 0 ? ` · Fed by ${veins} vein${veins > 1 ? 's' : ''}` : '';
        const text = (!FORKS[entity.kind] ? name : dissected(this.state, 'player', entity.kind) ? stats : `${name}: ???`) + grief + fed;
        const label = this.add.text(entity.x, entity.y - entity.radius - 24, text, {
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '11px',
            color: '#C8FF8A',
            backgroundColor: '#13182ADB',
            padding: { x: 6, y: 3 },
        });
        label.setOrigin(0.5);
        label.setDepth(11);
        this.labels.push(label);
    }
    drawPowerLink(link) {
        const from = this.state.entities.find((entity) => entity.id === link.fromId);
        const to = this.state.entities.find((entity) => entity.id === link.toId);
        if (!from || !to)
            return;
        const g = this.worldGraphics;
        const visual = powerLinkVisualState(this.state, link);
        const disabled = visual.status !== 'live';
        const repairing = visual.status === 'repairing';
        const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        if (link.owner === 'enemy' && !this.isPointVisible(midpoint))
            return;
        if (link.owner === 'enemy' && !disabled) {
            this.drawVein(link, from, to);
        }
        else {
            this.drawConduit(link, from, to, disabled, repairing, visual.isProductionLink);
        }
        this.drawWeakPoint(link, midpoint, disabled);
        // Veinfield corrosion's tell: the link flickers lime for 1s before it drops.
        const corrosion = disabled ? undefined : corrosionMs(this.state, link);
        if (corrosion !== undefined && corrosion < BALANCE.corrosionFlickerMs && Math.floor(corrosion / 120) % 2 === 0)
            g.lineStyle(4, COLORS.enemy, 0.9).lineBetween(from.x, from.y, to.x, to.y);
        if (disabled) {
            const spark = 7 + Math.sin(this.state.timeMs / 80) * 4;
            this.drawBrokenConduit(from, to, midpoint, visual.remainingPct);
            g.fillStyle(COLORS.disabled, 0.95).fillCircle(midpoint.x, midpoint.y, spark);
            g.lineStyle(2, 0xedf2ff, 0.75).strokeCircle(midpoint.x, midpoint.y, spark + 7);
            if (repairing)
                this.drawRepairRecovery(link, from, to, midpoint, visual.remainingPct, visual.repairerCount);
            this.drawDisabledLinkWarning(link, midpoint);
        }
    }
    drawVein(link, from, to) {
        const g = this.worldGraphics;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const nx = -dy / length;
        const ny = dx / length;
        const seed = this.hashId(link.id);
        const points = [];
        for (let i = 0; i <= 12; i += 1) {
            const t = i / 12;
            const wobble = i === 0 || i === 12 ? 0 : Math.sin(i * 1.3 + seed) * 5;
            points.push(new Phaser.Math.Vector2(from.x + dx * t + nx * wobble, from.y + dy * t + ny * wobble));
        }
        g.lineStyle(7, 0x4a0f1a, 0.8).strokePoints(points);
        g.lineStyle(3, COLORS.enemy, this.heartbeat()).strokePoints(points);
    }
    drawConduit(link, from, to, disabled, repairing, isProductionLink) {
        const g = this.worldGraphics;
        const pulse = 0.45 + Math.sin(this.state.timeMs / 150) * 0.25;
        const ownerColor = link.owner === 'player' ? COLORS.player : COLORS.enemy;
        const lineWidth = isProductionLink ? 8 : 5;
        g.lineStyle(disabled ? lineWidth + 8 : lineWidth + 6, 0x02040a, disabled ? 0.52 : 0.36);
        g.lineBetween(from.x, from.y, to.x, to.y);
        g.lineStyle(disabled ? lineWidth + 3 : lineWidth + 2, repairing ? COLORS.amber : disabled ? COLORS.disabled : ownerColor, disabled ? 0.42 : 0.22 + pulse * 0.2);
        g.lineBetween(from.x, from.y, to.x, to.y);
        g.lineStyle(disabled ? 4 : isProductionLink ? 4 : 3, repairing ? COLORS.amber : disabled ? COLORS.disabled : COLORS.powered, disabled ? 0.76 : pulse);
        g.lineBetween(from.x, from.y, to.x, to.y);
        g.lineStyle(1, 0xedf2ff, disabled ? 0.35 : 0.18);
        g.lineBetween(from.x, from.y, to.x, to.y);
        if (isProductionLink && !disabled) {
            const glow = 0.22 + Math.sin(this.state.timeMs / 210 + this.hashId(link.id)) * 0.09;
            g.lineStyle(12, COLORS.powered, glow).lineBetween(from.x, from.y, to.x, to.y);
        }
        this.drawLinkPackets(link, from, to, disabled);
    }
    drawRepairRecovery(link, from, to, midpoint, remainingPct, repairerCount) {
        const g = this.overlayGraphics;
        const repairers = this.state.entities.filter((entity) => entity.intent.type === 'repair-link' && entity.intent.targetId === link.id);
        const restoredPct = 1 - remainingPct;
        const pulse = 0.54 + Math.sin(this.state.timeMs / 110 + this.hashId(link.id)) * 0.18;
        const start = { x: from.x + (to.x - from.x) * (0.5 - restoredPct * 0.5), y: from.y + (to.y - from.y) * (0.5 - restoredPct * 0.5) };
        const end = { x: from.x + (to.x - from.x) * (0.5 + restoredPct * 0.5), y: from.y + (to.y - from.y) * (0.5 + restoredPct * 0.5) };
        g.lineStyle(9, COLORS.amber, 0.22 + pulse * 0.14).lineBetween(start.x, start.y, end.x, end.y);
        g.lineStyle(3, 0xedf2ff, 0.45 + pulse * 0.28).lineBetween(start.x, start.y, end.x, end.y);
        g.fillStyle(COLORS.amber, 0.12).fillCircle(midpoint.x, midpoint.y, 62 + restoredPct * 24);
        g.lineStyle(3, COLORS.amber, 0.72).strokeCircle(midpoint.x, midpoint.y, 34 + restoredPct * 18);
        for (const repairer of repairers) {
            if (!this.isPointVisible(repairer) && repairer.owner === 'enemy')
                continue;
            g.lineStyle(4, COLORS.amber, 0.34 + pulse * 0.18).lineBetween(repairer.x, repairer.y, midpoint.x, midpoint.y);
            g.lineStyle(1, 0xedf2ff, 0.66).lineBetween(repairer.x, repairer.y, midpoint.x, midpoint.y);
            g.fillStyle(COLORS.amber, 0.65).fillCircle(repairer.x, repairer.y, 5 + pulse * 4);
        }
        const label = this.add.text(midpoint.x, midpoint.y + 42, repairerCount > 1 ? 'REPAIR CREWS' : 'REPAIR CREW', {
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            color: '#FFF1C2',
            backgroundColor: '#3D2A12DD',
            padding: { x: 6, y: 3 },
        });
        label.setOrigin(0.5);
        label.setDepth(11);
        this.labels.push(label);
    }
    drawBrokenConduit(from, to, midpoint, remainingPct) {
        const g = this.overlayGraphics;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const normal = { x: -dy / length, y: dx / length };
        const crackAlpha = 0.42 + Math.sin(this.state.timeMs / 48) * 0.16;
        for (let i = -2; i <= 2; i += 1) {
            const x = midpoint.x + normal.x * i * 10;
            const y = midpoint.y + normal.y * i * 10;
            g.lineStyle(2, i === 0 ? COLORS.amber : COLORS.disabled, crackAlpha).lineBetween(x - normal.x * 8 - (dx / length) * 12, y - normal.y * 8 - (dy / length) * 12, x + normal.x * 10 + (dx / length) * 12, y + normal.y * 10 + (dy / length) * 12);
        }
        g.fillStyle(0x050813, 0.54).fillCircle(midpoint.x, midpoint.y + 10, 34);
        g.fillStyle(COLORS.disabled, 0.1 + remainingPct * 0.14).fillCircle(midpoint.x, midpoint.y, 48 + remainingPct * 16);
    }
    drawEntity(entity) {
        const g = this.statusGraphics ?? this.overlayGraphics;
        const selected = this.state.selectedIds.includes(entity.id);
        const color = entity.owner === 'player' ? COLORS.player : entity.owner === 'enemy' ? COLORS.enemy : COLORS.neutral;
        // Okafor's drone is dead hardware, so it wears the unpowered tint.
        const powered = entityVisualState(this.state, entity).powered && entity.kind !== 'okafor-drone';
        this.drawEntityShadow(entity);
        this.drawArt(entity, powered);
        if (entity.kind === 'ore') {
            g.lineStyle(1, 0xc7d7f5, 0.4).strokeCircle(entity.x, entity.y, entity.radius + 5);
            return;
        }
        if (entity.kind === 'burrow' || entity.kind === 'husk' || entity.kind === 'okafor-drone')
            return;
        // Chorus listening: a white ring expanding 1.0 -> 1.8x the radius through the 1s telegraph, and "(listening)" until it moves again.
        if (entity.listenMs) {
            const telegraph = Math.min(1, (BALANCE.listenMs - entity.listenMs) / BALANCE.listenTelegraphMs);
            if (telegraph < 1)
                g.lineStyle(3, 0xffffff, 0.95).strokeCircle(entity.x, entity.y, entity.radius * (1 + 0.8 * telegraph));
            const label = this.add.text(entity.x, entity.y - entity.radius - 22, '(listening)', {
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '11px',
                color: '#EDF2FF',
                backgroundColor: '#13182ADB',
                padding: { x: 4, y: 2 },
            });
            this.labels.push(label.setOrigin(0.5).setDepth(7));
        }
        if (entity.kind === 'relay-mast') {
            // Mast light: cobalt while powered, dim when not.
            g.lineStyle(2, powered ? COLORS.powered : COLORS.neutral, powered ? 0.8 : 0.35).strokeCircle(entity.x, entity.y, entity.radius + 6);
            return;
        }
        // A gnawing Weaver throws lime sparks: the 2s telegraph before the cut.
        if (entity.gnawMs) {
            for (let i = 0; i < 6; i += 1) {
                const a = this.state.timeMs / 70 + i * 1.05;
                const r = 6 + ((this.state.timeMs / 40 + i * 5) % 14);
                g.fillStyle(COLORS.enemy, 0.9).fillCircle(entity.x + Math.cos(a) * r, entity.y + Math.sin(a) * r, 2);
            }
            g.lineStyle(2, COLORS.enemy, 0.5 + 0.4 * (entity.gnawMs / 2000)).strokeCircle(entity.x, entity.y, entity.radius + 8);
        }
        if (selected) {
            const sweep = this.state.timeMs / 260;
            g.lineStyle(3, 0xedf2ff, 0.95).strokeCircle(entity.x, entity.y, entity.radius + 9);
            g.lineStyle(2, color, 0.65).strokeCircle(entity.x, entity.y, entity.radius + 15);
            for (let i = 0; i < 4; i += 1) {
                const a = sweep + i * Math.PI * 0.5;
                g.lineStyle(3, COLORS.amber, 0.72).lineBetween(entity.x + Math.cos(a) * (entity.radius + 17), entity.y + Math.sin(a) * (entity.radius + 17), entity.x + Math.cos(a + 0.18) * (entity.radius + 17), entity.y + Math.sin(a + 0.18) * (entity.radius + 17));
            }
        }
        if ((entity.overloadMs ?? 0) > 0) {
            const pulse = 0.55 + Math.sin(this.state.timeMs / 75) * 0.22;
            g.lineStyle(3, 0xfff1c2, pulse).strokeCircle(entity.x, entity.y, entity.radius + 24);
            g.lineStyle(1, COLORS.powered, 0.7).strokeCircle(entity.x, entity.y, entity.radius + 31);
        }
        if (entity.carry)
            g.fillStyle(entity.carry.sourceKind ? COLORS.enemy : 0x2f6bff, 1).fillCircle(entity.x, entity.y - entity.radius - 4, entity.carry.sourceKind ? 4 : 3);
        if (entity.intent.type === 'hold') {
            if (this.state.shots.some((shot) => shot.toId === entity.id))
                g.lineStyle(3, COLORS.disabled, 0.9).strokeCircle(entity.x, entity.y, entity.radius + 12);
            g.lineStyle(2, 0xfff1c2, 0.88).strokeRoundedRect(entity.x - entity.radius - 6, entity.y - entity.radius - 6, (entity.radius + 6) * 2, (entity.radius + 6) * 2, 4);
        }
        if (entity.speed > 0) {
            g.fillStyle(color, 0.1).fillCircle(entity.x, entity.y, entity.radius + 5);
            g.lineStyle(2, color, 0.72).strokeCircle(entity.x, entity.y, entity.radius + 2);
            // Hybrids carry a second, violet ring: cobalt and violet merge for colour-blind players, the double ring doesn't.
            if (HYBRID_OF[entity.kind])
                g.lineStyle(2, 0x9a5cff, 0.85).strokeCircle(entity.x, entity.y, entity.radius + 6);
        }
        const hpWidth = entity.radius * 2;
        g.fillStyle(0x060914, 0.8).fillRect(entity.x - entity.radius, entity.y - entity.radius - 12, hpWidth, 4);
        g.fillStyle(color, 0.95).fillRect(entity.x - entity.radius, entity.y - entity.radius - 12, hpWidth * Math.max(0, entity.hp / entity.maxHp), 4);
        if (entity.queue) {
            const pct = 1 - entity.queue.remainingMs / entity.queue.totalMs;
            g.fillStyle(0x060914, 0.8).fillRect(entity.x - entity.radius, entity.y + entity.radius + 7, hpWidth, 5);
            g.fillStyle(powered ? COLORS.powered : COLORS.disabled, 0.9).fillRect(entity.x - entity.radius, entity.y + entity.radius + 7, hpWidth * pct, 5);
            if (!powered && entity.owner === 'player') {
                const text = this.add.text(entity.x, entity.y - entity.radius - 30, 'STALLED', {
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '12px',
                    color: '#FFB4C0',
                    backgroundColor: '#3D1722CC',
                    padding: { x: 5, y: 2 },
                });
                text.setOrigin(0.5);
                text.setDepth(7);
                this.labels.push(text);
            }
        }
    }
    drawLinkPackets(link, from, to, disabled) {
        const g = this.worldGraphics;
        if (disabled)
            return;
        const visual = powerLinkVisualState(this.state, link);
        const packets = visual.isProductionLink ? 5 : link.owner === 'player' ? 3 : 2;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        for (let i = 0; i < packets; i += 1) {
            const t = ((this.state.timeMs / 900 + i / packets) % 1);
            const x = from.x + (to.x - from.x) * t;
            const y = from.y + (to.y - from.y) * t;
            g.fillStyle(0xedf2ff, 0.16).fillCircle(x, y, visual.isProductionLink ? 9 : 6);
            g.fillStyle(COLORS.powered, 0.72).fillCircle(x, y, visual.isProductionLink ? 4 : 3);
            if (visual.isProductionLink) {
                g.lineStyle(2, COLORS.amber, 0.5)
                    .lineBetween(x, y, x - Math.cos(angle - 0.5) * 12, y - Math.sin(angle - 0.5) * 12)
                    .lineBetween(x, y, x - Math.cos(angle + 0.5) * 12, y - Math.sin(angle + 0.5) * 12);
            }
        }
    }
    drawWeakPoint(link, midpoint, disabled) {
        const g = this.overlayGraphics;
        const color = disabled ? COLORS.disabled : link.owner === 'player' ? COLORS.player : COLORS.enemy;
        const size = disabled ? 14 : 10 + Math.sin(this.state.timeMs / 140) * 2;
        g.lineStyle(2, color, link.owner === 'enemy' ? 0.95 : 0.65);
        g.strokePoints([
            { x: midpoint.x, y: midpoint.y - size },
            { x: midpoint.x + size, y: midpoint.y },
            { x: midpoint.x, y: midpoint.y + size },
            { x: midpoint.x - size, y: midpoint.y },
        ], true, true);
        if (link.owner === 'enemy' && !disabled) {
            g.fillStyle(color, 0.16).fillCircle(midpoint.x, midpoint.y, size + 9);
            g.lineStyle(1, 0xedf2ff, 0.35).strokeCircle(midpoint.x, midpoint.y, size + 13);
        }
    }
    drawDisabledLinkWarning(link, midpoint) {
        const g = this.overlayGraphics;
        const remaining = Math.max(0, Math.min(1, link.disabledMs / BALANCE.sabotageMs));
        const target = this.state.entities.find((entity) => entity.id === link.toId);
        const targetName = target?.kind ? target.kind.replace('-', ' ').toUpperCase() : 'GRID';
        const remainingSeconds = Math.max(1, Math.ceil(link.disabledMs / 1000));
        const radius = 23;
        const segments = Math.max(4, Math.ceil(22 * remaining));
        g.lineStyle(4, COLORS.disabled, 0.92);
        for (let i = 0; i < segments; i += 1) {
            const start = -Math.PI / 2 + (Math.PI * 2 * i) / 22;
            const end = -Math.PI / 2 + (Math.PI * 2 * (i + 1)) / 22;
            g.lineBetween(midpoint.x + Math.cos(start) * radius, midpoint.y + Math.sin(start) * radius, midpoint.x + Math.cos(end) * radius, midpoint.y + Math.sin(end) * radius);
        }
        g.lineStyle(3, 0xfff1c2, 0.8)
            .lineBetween(midpoint.x - 14, midpoint.y - 14, midpoint.x + 14, midpoint.y + 14)
            .lineBetween(midpoint.x + 14, midpoint.y - 14, midpoint.x - 14, midpoint.y + 14);
        const text = this.add.text(midpoint.x, midpoint.y - 44, `${targetName} OFFLINE ${remainingSeconds}s`, {
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            color: '#FFB4C0',
            backgroundColor: '#3D1722DD',
            padding: { x: 7, y: 3 },
        });
        text.setOrigin(0.5);
        text.setDepth(8);
        this.labels.push(text);
    }
    drawEntityShadow(entity) {
        if (entity.kind === 'ore')
            return;
        const g = this.worldGraphics;
        const width = entity.radius * (entity.speed > 0 ? 3.15 : 4.3);
        const height = entity.radius * (entity.speed > 0 ? 1.25 : 1.65);
        g.fillStyle(0x02040a, entity.speed > 0 ? 0.5 : 0.64).fillEllipse(entity.x + 5, entity.y + entity.radius + 7, width, height);
        if (entity.speed === 0) {
            g.fillStyle(0x02040a, 0.2).fillEllipse(entity.x - 8, entity.y + entity.radius + 18, width * 1.2, height * 0.8);
        }
    }
    drawArt(entity, powered) {
        const id = artIdFor(entity, this.state.players.player.bloom);
        if (!id || !this.textures.exists(id))
            return;
        const entry = ART[id];
        let sprite = this.sprites.get(entity.id);
        if (!sprite || sprite.texture.key !== id) {
            sprite?.destroy();
            sprite = this.add.image(entity.x, entity.y, id).setDepth(entity.kind === 'husk' ? 4.4 : 4.5).setData({ lastX: entity.x, facing: entity.owner === 'enemy' ? -1 : 1, owner: entity.owner });
            this.sprites.set(entity.id, sprite);
        }
        this.seen.add(entity.id);
        const source = this.textures.get(id).getSourceImage();
        const left = (entity.amount ?? BALANCE.oreNodeAmount) / BALANCE.oreNodeAmount;
        const width = entry.width * (entity.kind === 'ore' ? (left < 0.33 ? 0.6 : left < 0.66 ? 0.8 : 1) : 1);
        const height = width * (source.height / source.width);
        const t = this.state.timeMs;
        const seed = this.hashId(entity.id);
        const hush = id.startsWith('hush.');
        const moving = entity.speed > 0 && entity.intent.type !== 'idle' && entity.intent.type !== 'hold';
        // Motion (bible §5): breathe, twitch, bob, hover, scuttle, sway. Nothing rotates.
        // A starved Cyst holding brood swells (design 10): 0.06 with one held wave, +0.02 per further wave, capped at 0.12.
        const amplitude = entity.held?.length ? Math.min(0.12, 0.04 + 0.02 * entity.held.length) : 0.03;
        const breathe = entity.kind === 'burrow'
            ? 1 + 0.03 * Math.sin((t * 2 * Math.PI) / heartbeatMs(this.state.players.player.mined))
            : hush && entity.speed === 0 && entity.kind !== 'husk'
                ? 1 + amplitude * Math.sin(t / 640 + seed)
                : 1;
        const twitch = hush && (entity.speed > 0 || entity.kind === 'husk') && (t + seed * 97) % 3000 < 50 ? 2 : 0;
        const sway = id === 'hush.tendril-spire' ? 2 * Math.sin(t / 500 + seed) : 0;
        const bob = id === 'foundry.raider' ? 2 * Math.sin(t / 260 + seed) : !hush && moving ? 3 * Math.sin(t / 105 + seed) : 0;
        const scuttle = moving && (id === 'hush.skitter' || id === 'hush.tender') ? 0.97 - 0.03 * Math.sin(t / 60 + seed) : 1;
        sprite.setPosition(entity.x + twitch + sway, entity.y + bob);
        sprite.setOrigin(0.5, entry.originY ?? 0.5);
        // Hush regrowth scales up from 0.2 with a wobble (a regrown Cyst); Foundry construction reveals instead.
        const grow = hush && entity.buildMs ? 0.2 + 0.8 * (1 - entity.buildMs / buildTotalMs(entity.kind)) + 0.04 * Math.sin(t / 90) : 1;
        sprite.setDisplaySize(width * breathe * grow, height * breathe * scuttle * grow);
        // Facing: attack target, else walking direction (>= 1px, so separation nudges never flip), else as before.
        const shot = this.state.shots.find((item) => item.fromId === entity.id);
        const targetId = shot?.toId ?? (entity.intent.type === 'attack' ? entity.intent.targetId : undefined);
        const target = targetId ? this.state.entities.find((item) => item.id === targetId) : undefined;
        const dx = entity.x - sprite.getData('lastX');
        // A listening hybrid turns toward the nearest Hush structure (flipX only).
        const listenTo = entity.listenMs
            ? this.state.entities
                .filter((item) => (item.owner === 'enemy' && item.speed === 0) || item.kind === 'burrow')
                .sort((a, b) => Phaser.Math.Distance.Between(a.x, a.y, entity.x, entity.y) - Phaser.Math.Distance.Between(b.x, b.y, entity.x, entity.y))[0]
            : undefined;
        if (listenTo && listenTo.x !== entity.x)
            sprite.setData('facing', Math.sign(listenTo.x - entity.x));
        else if (target && target.x !== entity.x)
            sprite.setData('facing', Math.sign(target.x - entity.x));
        else if (Math.abs(dx) >= 1)
            sprite.setData('facing', Math.sign(dx));
        if (Math.abs(dx) >= 1 || target)
            sprite.setData('lastX', entity.x);
        if (entry.baseFacing !== 'none')
            sprite.setFlipX((sprite.getData('facing') < 0) !== (entry.baseFacing === 'left'));
        // A husk fades over its last 3s.
        sprite.setAlpha((powered ? 1 : 0.58) * Math.min(1, (entity.decayMs ?? 3000) / 3000));
        if (this.time.now < (sprite.getData('flashUntil') ?? 0))
            sprite.setTintFill(0xffffff);
        // A wreck flickers lime while it waits to rise.
        else if (entity.kind === 'wreck' && (t + seed * 31) % 400 < 120)
            sprite.setTint(COLORS.enemy);
        // The Cradle inverts it: fed (or closed for the finale) it tints bone shadow, "ribs closed"; opened, it shows clean.
        else if (entity.kind === 'cradle') {
            sprite.setAlpha(1);
            if (powered || closedToDamage(this.state, entity))
                sprite.setTint(0x6f6658);
            else
                sprite.clearTint();
        }
        else if (!powered)
            sprite.setTint(entity.owner === 'player' ? 0x94a3b8 : 0x8e8574);
        else
            sprite.clearTint();
        // Powered Foundry buildings glow cobalt; cutting the link turns the light off.
        const glowing = powered && !hush && entity.speed === 0 && entity.kind !== 'ore' && entity.owner === 'player';
        const glow = sprite.getData('glow');
        if (glowing && !glow && sprite.preFX)
            sprite.setData('glow', sprite.preFX.addGlow(COLORS.player, 3, 0, false));
        if (!glowing && glow) {
            sprite.preFX?.remove(glow);
            sprite.setData('glow', undefined);
        }
        this.revealConstruction(sprite, entity);
    }
    // Unseen sprites die with their entity. Hush bodies fold silently: squash, bone tint, fade over 300ms.
    sweepSprites() {
        for (const [id, sprite] of this.sprites) {
            if (this.seen.has(id))
                continue;
            this.sprites.delete(id);
            const dead = !this.state.entities.some((entity) => entity.id === id);
            if (!dead || sprite.getData('owner') !== 'enemy') {
                sprite.destroy();
                continue;
            }
            sprite.setTint(0x8e8574);
            this.tweens.add({ targets: sprite, scaleY: sprite.scaleY * 0.6, alpha: 0, duration: 300, onComplete: () => sprite.destroy() });
        }
    }
    // An unfinished building reveals from the bottom up, with a 2px cobalt scaffold line at the edge.
    revealConstruction(sprite, entity) {
        if (!entity.buildMs || entity.owner === 'enemy') {
            if (sprite.isCropped)
                sprite.setCrop();
            return;
        }
        const pct = 1 - entity.buildMs / buildTotalMs(entity.kind);
        const { width, height } = sprite.frame;
        sprite.setCrop(0, height * (1 - pct), width, height * pct);
        const top = sprite.y - sprite.displayHeight * sprite.originY + sprite.displayHeight * (1 - pct);
        this.statusGraphics?.lineStyle(2, COLORS.player, 0.95).lineBetween(sprite.x - sprite.displayWidth / 2, top, sprite.x + sprite.displayWidth / 2, top);
    }
    intentPoint(entity) {
        const intent = entity.intent;
        if (intent.type === 'move' || intent.type === 'attack-move')
            return intent.point;
        if (intent.type === 'attack') {
            const target = this.state.entities.find((item) => item.id === intent.targetId);
            return target ? { x: target.x, y: target.y } : undefined;
        }
        if (intent.type === 'sabotage') {
            const link = this.state.powerLinks.find((item) => item.id === intent.targetId);
            const from = link ? this.state.entities.find((item) => item.id === link.fromId) : undefined;
            const to = link ? this.state.entities.find((item) => item.id === link.toId) : undefined;
            return from && to ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : undefined;
        }
        if (intent.type === 'repair-link') {
            const link = this.state.powerLinks.find((item) => item.id === intent.targetId);
            const from = link ? this.state.entities.find((item) => item.id === link.fromId) : undefined;
            const to = link ? this.state.entities.find((item) => item.id === link.toId) : undefined;
            return from && to ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : undefined;
        }
        return undefined;
    }
    collectEffects(previous, current) {
        const currentById = new Map(current.entities.map((entity) => [entity.id, entity]));
        const previousById = new Map(previous.entities.map((entity) => [entity.id, entity]));
        // One tracer per real shot, drawn from its shooter (it may have died this same tick).
        for (const shot of current.shots) {
            const attacker = currentById.get(shot.fromId) ?? previousById.get(shot.fromId);
            const entity = currentById.get(shot.toId) ?? previousById.get(shot.toId);
            if (!attacker || !entity)
                continue;
            const direction = this.normalizedVector(attacker, entity);
            const color = attacker.owner === 'player' ? COLORS.player : COLORS.enemy;
            this.effects.push({
                type: 'muzzle',
                point: { x: attacker.x + direction.x * (attacker.radius + 10), y: attacker.y + direction.y * (attacker.radius + 10) },
                direction,
                color,
                ageMs: 0,
                durationMs: this.weaponForEntity(attacker) === 'cannon' ? 260 : 150,
                size: attacker.kind === 'heavy' ? 34 : attacker.kind === 'turret' ? 28 : 18,
                weapon: this.weaponForEntity(attacker),
            });
            // Stilt shots draw a lime arc for 250ms.
            const stilt = attacker.kind === 'stilt';
            this.effects.push({ type: 'beam', from: { x: attacker.x, y: attacker.y }, to: { x: entity.x, y: entity.y }, color, ageMs: 0, durationMs: stilt ? 250 : 180, arc: stilt });
        }
        for (const entity of current.entities) {
            const prior = previousById.get(entity.id);
            if (!prior || entity.hp >= prior.hp)
                continue;
            this.sprites.get(entity.id)?.setData('flashUntil', this.time.now + 60);
            this.effects.push({
                type: 'burst',
                point: { x: entity.x, y: entity.y },
                color: entity.owner === 'player' ? COLORS.enemy : COLORS.player,
                ageMs: 0,
                durationMs: 260,
                size: entity.radius + 10,
            });
        }
        for (const entity of previous.entities) {
            // Hush bodies fold silently in sweepSprites: no explosion, debris, text or shake.
            if (entity.owner !== 'player' || currentById.has(entity.id))
                continue;
            const blastSize = entity.speed <= 0 ? Math.max(58, entity.radius * 3.1) : Math.max(28, entity.radius * 2.4);
            this.effects.push({
                type: 'explosion',
                point: { x: entity.x, y: entity.y },
                color: entity.owner === 'player' ? COLORS.player : COLORS.enemy,
                ageMs: 0,
                durationMs: entity.speed <= 0 ? 980 : 720,
                size: blastSize,
            });
            this.effects.push({
                type: 'shockwave',
                point: { x: entity.x, y: entity.y },
                color: entity.owner === 'player' ? COLORS.player : COLORS.enemy,
                ageMs: 0,
                durationMs: entity.speed <= 0 ? 840 : 560,
                size: blastSize,
            });
            this.effects.push({
                type: 'debris',
                point: { x: entity.x, y: entity.y },
                color: entity.owner === 'player' ? COLORS.player : COLORS.enemy,
                ageMs: 0,
                durationMs: entity.speed <= 0 ? 2600 : 1700,
                size: blastSize,
                seed: this.hashId(entity.id),
            });
            this.effects.push({
                type: 'damage-text',
                point: { x: entity.x, y: entity.y - entity.radius - 18 },
                color: 0xfff1c2,
                ageMs: 0,
                durationMs: 820,
                text: entity.speed <= 0 ? 'STRUCTURE DOWN' : 'UNIT DOWN',
            });
            if (this.cameras.main.worldView.contains(entity.x, entity.y))
                this.cameras.main.shake(entity.speed <= 0 ? 140 : 90, entity.speed <= 0 ? 0.006 : 0.003);
        }
        for (const link of current.powerLinks) {
            const prior = previous.powerLinks.find((item) => item.id === link.id);
            if (link.disabledMs > 0 && (!prior || prior.disabledMs <= 0)) {
                this.emitLinkDisabledEffects(current, link);
            }
            if (link.disabledMs <= 0 && prior && prior.disabledMs > 0) {
                const point = this.linkPoint(current, link);
                if (point) {
                    this.effects.push({
                        type: 'reboot',
                        point,
                        color: link.owner === 'player' ? COLORS.player : COLORS.enemy,
                        ageMs: 0,
                        durationMs: 1150,
                        size: 74,
                    });
                }
            }
        }
    }
    collectImmediateLinkEffects(previous, current) {
        for (const link of current.powerLinks) {
            const prior = previous.powerLinks.find((item) => item.id === link.id);
            if (link.disabledMs > 0 && (!prior || prior.disabledMs <= 0))
                this.emitLinkDisabledEffects(current, link);
        }
    }
    emitLinkDisabledEffects(state, link) {
        const from = state.entities.find((entity) => entity.id === link.fromId);
        const to = state.entities.find((entity) => entity.id === link.toId);
        if (!from || !to)
            return;
        this.effects.push({
            type: 'arc',
            from: { x: from.x, y: from.y },
            to: { x: to.x, y: to.y },
            color: COLORS.disabled,
            ageMs: 0,
            durationMs: 1450,
        });
        this.effects.push({
            type: 'explosion',
            point: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
            color: COLORS.disabled,
            ageMs: 0,
            durationMs: 1300,
            size: 62,
        });
        this.effects.push({
            type: 'shockwave',
            point: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
            color: COLORS.disabled,
            ageMs: 0,
            durationMs: 1250,
            size: 96,
        });
        this.effects.push({
            type: 'spark-rain',
            point: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
            color: COLORS.disabled,
            ageMs: 0,
            durationMs: 1600,
            size: 86,
            seed: this.hashId(link.id),
        });
        this.cameras.main.shake(90, 0.0035);
    }
    emitEmpCommandEffects(actor, targetLinkId) {
        const link = targetLinkId ? this.state.powerLinks.find((item) => item.id === targetLinkId) : this.state.powerLinks.find((item) => item.owner !== actor.owner && item.disabledMs > 0);
        const target = link ? this.linkPoint(this.state, link) : undefined;
        if (!target)
            return;
        const direction = this.normalizedVector(actor, target);
        this.effects.push({
            type: 'muzzle',
            point: { x: actor.x + direction.x * 18, y: actor.y + direction.y * 18 },
            direction,
            color: COLORS.powered,
            ageMs: 0,
            durationMs: 520,
            size: 30,
            weapon: 'emp-lance',
        });
        this.effects.push({
            type: 'emp-beam',
            from: { x: actor.x, y: actor.y },
            to: target,
            color: COLORS.powered,
            ageMs: 0,
            durationMs: 760,
            size: 72,
        });
        this.effects.push({
            type: 'damage-text',
            point: { x: actor.x, y: actor.y - actor.radius - 30 },
            color: COLORS.amber,
            ageMs: 0,
            durationMs: 700,
            text: 'EMP SPIKE',
        });
    }
    linkPoint(state, link) {
        const from = state.entities.find((entity) => entity.id === link.fromId);
        const to = state.entities.find((entity) => entity.id === link.toId);
        return from && to ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : undefined;
    }
    normalizedVector(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        return { x: dx / length, y: dy / length };
    }
    weaponForEntity(entity) {
        if (entity.kind === 'turret')
            return 'turret';
        if (entity.kind === 'heavy' || entity.kind === 'chimera')
            return 'cannon';
        if (entity.kind === 'raider')
            return 'emp-lance';
        return 'rifle';
    }
    updateEffects(deltaMs) {
        for (const effect of this.effects)
            effect.ageMs += deltaMs;
        this.effects = this.effects.filter((effect) => effect.ageMs < effect.durationMs).slice(-80);
    }
    drawEffects() {
        if (!this.fxGraphics)
            return;
        const g = this.fxGraphics;
        for (const effect of this.effects) {
            const t = Math.min(1, effect.ageMs / effect.durationMs);
            const alpha = 1 - t;
            if (effect.type === 'beam' && effect.arc) {
                const lift = { x: (effect.from.x + effect.to.x) / 2, y: Math.min(effect.from.y, effect.to.y) - 50 };
                const points = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(effect.from.x, effect.from.y), new Phaser.Math.Vector2(lift.x, lift.y), new Phaser.Math.Vector2(effect.to.x, effect.to.y)).getPoints(14);
                g.lineStyle(5, effect.color, alpha * 0.25).strokePoints(points);
                g.lineStyle(2, effect.color, alpha).strokePoints(points);
            }
            else if (effect.type === 'beam') {
                const jitter = Math.sin((this.state.timeMs + effect.ageMs) / 28) * 2;
                const width = effect.color === COLORS.player || effect.color === COLORS.enemy ? 5 : 4;
                g.lineStyle(width + 4, effect.color, alpha * 0.22).lineBetween(effect.from.x, effect.from.y, effect.to.x + jitter, effect.to.y - jitter);
                g.lineStyle(width, effect.color, alpha * 0.74).lineBetween(effect.from.x, effect.from.y, effect.to.x + jitter, effect.to.y - jitter);
                g.lineStyle(2, effect.color, alpha).lineBetween(effect.from.x, effect.from.y, effect.to.x + jitter, effect.to.y - jitter);
                g.fillStyle(effect.color, alpha).fillCircle(effect.from.x, effect.from.y, 5);
            }
            else if (effect.type === 'emp-beam') {
                const dx = effect.to.x - effect.from.x;
                const dy = effect.to.y - effect.from.y;
                const length = Math.hypot(dx, dy) || 1;
                const normal = { x: -dy / length, y: dx / length };
                const charge = Math.sin(this.state.timeMs / 24) * 5;
                g.lineStyle(13, COLORS.powered, alpha * 0.22).lineBetween(effect.from.x, effect.from.y, effect.to.x, effect.to.y);
                g.lineStyle(6, effect.color, alpha * 0.78).lineBetween(effect.from.x, effect.from.y, effect.to.x, effect.to.y);
                g.lineStyle(2, COLORS.amber, alpha * 0.92).lineBetween(effect.from.x + normal.x * charge, effect.from.y + normal.y * charge, effect.to.x - normal.x * charge, effect.to.y - normal.y * charge);
                for (let i = 0; i < 5; i += 1) {
                    const p = (t * 1.6 + i / 5) % 1;
                    const x = effect.from.x + dx * p;
                    const y = effect.from.y + dy * p;
                    g.fillStyle(i % 2 === 0 ? COLORS.amber : 0xedf2ff, alpha * 0.84).fillCircle(x, y, 4 + i % 2);
                }
                g.fillStyle(effect.color, alpha * 0.22).fillCircle(effect.to.x, effect.to.y, effect.size * (0.35 + t * 0.45));
                g.lineStyle(3, COLORS.amber, alpha * 0.82).strokeCircle(effect.to.x, effect.to.y, effect.size * (0.28 + t * 0.32));
            }
            else if (effect.type === 'muzzle') {
                const side = { x: -effect.direction.y, y: effect.direction.x };
                const length = effect.weapon === 'cannon' ? effect.size * 1.35 : effect.weapon === 'emp-lance' ? effect.size * 1.2 : effect.size;
                const width = effect.weapon === 'rifle' ? effect.size * 0.32 : effect.size * 0.5;
                const tip = { x: effect.point.x + effect.direction.x * length, y: effect.point.y + effect.direction.y * length };
                const left = { x: effect.point.x + side.x * width, y: effect.point.y + side.y * width };
                const right = { x: effect.point.x - side.x * width, y: effect.point.y - side.y * width };
                const flashColor = effect.weapon === 'emp-lance' ? COLORS.powered : effect.color;
                g.fillStyle(flashColor, alpha * 0.9).fillPoints([tip, left, right], true, true);
                g.lineStyle(effect.weapon === 'cannon' ? 4 : 2, effect.color, alpha * 0.78).strokeCircle(effect.point.x, effect.point.y, effect.size * (0.4 + t * 0.8));
                if (effect.weapon === 'cannon') {
                    g.fillStyle(effect.color, alpha * 0.35).fillCircle(tip.x, tip.y, effect.size * 0.42);
                }
            }
            else if (effect.type === 'arc') {
                const dx = effect.to.x - effect.from.x;
                const dy = effect.to.y - effect.from.y;
                const length = Math.hypot(dx, dy) || 1;
                const normal = { x: -dy / length, y: dx / length };
                for (let i = 0; i < 4; i += 1) {
                    const offset = Math.sin(this.state.timeMs / 34 + i * 1.7) * 10;
                    const start = {
                        x: effect.from.x + normal.x * offset,
                        y: effect.from.y + normal.y * offset,
                    };
                    const end = {
                        x: effect.to.x - normal.x * offset * 0.6,
                        y: effect.to.y - normal.y * offset * 0.6,
                    };
                    g.lineStyle(i === 0 ? 6 : 2, i === 0 ? effect.color : 0xfff1c2, alpha * (i === 0 ? 0.34 : 0.82)).lineBetween(start.x, start.y, end.x, end.y);
                }
            }
            else if (effect.type === 'debris') {
                const radius = effect.size * (0.22 + t * 0.74);
                g.fillStyle(0x02040a, 0.48 * alpha).fillCircle(effect.point.x, effect.point.y + 7, effect.size * 0.52);
                g.lineStyle(2, effect.color, alpha * 0.55).strokeCircle(effect.point.x, effect.point.y, radius);
                for (let i = 0; i < 9; i += 1) {
                    const angle = (Math.PI * 2 * i) / 9 + effect.seed;
                    const travel = radius * (0.55 + ((effect.seed + i * 13) % 17) / 34);
                    const x = effect.point.x + Math.cos(angle) * travel;
                    const y = effect.point.y + Math.sin(angle) * travel * 0.74;
                    g.lineStyle(3, i % 3 === 0 ? 0xfff1c2 : effect.color, alpha * 0.68).lineBetween(x, y, x - Math.cos(angle) * 11, y - Math.sin(angle) * 8);
                    g.fillStyle(0x0a0d14, alpha * 0.72).fillRect(x - 2, y - 2, 4, 4);
                }
            }
            else if (effect.type === 'shockwave') {
                const radius = effect.size * (0.28 + t * 1.25);
                g.fillStyle(effect.color, alpha * 0.07).fillCircle(effect.point.x, effect.point.y, radius * 0.85);
                g.lineStyle(6, 0xedf2ff, alpha * 0.28).strokeCircle(effect.point.x, effect.point.y, radius * 0.72);
                g.lineStyle(3, effect.color, alpha * 0.78).strokeCircle(effect.point.x, effect.point.y, radius);
                g.lineStyle(1, COLORS.amber, alpha * 0.55).strokeCircle(effect.point.x, effect.point.y, radius * 1.18);
            }
            else if (effect.type === 'spark-rain') {
                for (let i = 0; i < 13; i += 1) {
                    const angle = (Math.PI * 2 * i) / 13 + effect.seed;
                    const travel = effect.size * (0.2 + t * (0.95 + ((effect.seed + i * 7) % 9) / 18));
                    const x = effect.point.x + Math.cos(angle) * travel;
                    const y = effect.point.y + Math.sin(angle) * travel * 0.72 + t * 14;
                    const tail = 10 + (i % 4) * 4;
                    g.lineStyle(i % 3 === 0 ? 3 : 2, i % 2 === 0 ? COLORS.amber : effect.color, alpha * 0.9).lineBetween(x, y, x - Math.cos(angle) * tail, y - Math.sin(angle) * tail);
                    g.fillStyle(0xedf2ff, alpha * 0.72).fillCircle(x, y, i % 3 === 0 ? 3 : 2);
                }
            }
            else if (effect.type === 'reboot') {
                const radius = effect.size * (0.25 + t * 0.75);
                g.fillStyle(effect.color, alpha * 0.12).fillCircle(effect.point.x, effect.point.y, radius);
                g.lineStyle(5, COLORS.powered, alpha * 0.84).strokeCircle(effect.point.x, effect.point.y, radius);
                g.lineStyle(2, COLORS.amber, alpha * 0.7).strokeCircle(effect.point.x, effect.point.y, radius * 1.24);
                for (let i = 0; i < 8; i += 1) {
                    const angle = this.state.timeMs / 180 + i * Math.PI / 4;
                    g.lineStyle(2, 0xedf2ff, alpha * 0.62).lineBetween(effect.point.x + Math.cos(angle) * radius * 0.45, effect.point.y + Math.sin(angle) * radius * 0.45, effect.point.x + Math.cos(angle) * radius * 0.9, effect.point.y + Math.sin(angle) * radius * 0.9);
                }
            }
            else if (effect.type === 'damage-text') {
                const y = effect.point.y - t * 24;
                const text = this.add.text(effect.point.x, y, effect.text, {
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: effect.text.includes('DOWN') ? '13px' : '12px',
                    color: effect.color === COLORS.player ? '#CDE5FF' : effect.color === COLORS.enemy ? '#FFC1C1' : '#FFF1C2',
                    backgroundColor: '#050813B8',
                    padding: { x: 5, y: 2 },
                });
                text.setOrigin(0.5);
                text.setAlpha(alpha);
                text.setDepth(9);
                this.labels.push(text);
            }
            else if (effect.type === 'burst') {
                const radius = effect.size * (0.35 + t * 0.9);
                g.fillStyle(effect.color, alpha * 0.55).fillCircle(effect.point.x, effect.point.y, radius * 0.45);
                g.lineStyle(3, 0xfff1c2, alpha * 0.85).strokeCircle(effect.point.x, effect.point.y, radius);
                g.lineStyle(2, effect.color, alpha * 0.7).lineBetween(effect.point.x - radius, effect.point.y, effect.point.x + radius, effect.point.y);
            }
            else {
                const radius = effect.size * (0.45 + t);
                g.fillStyle(0xfff1c2, alpha * 0.65).fillCircle(effect.point.x, effect.point.y, radius * 0.28);
                g.fillStyle(effect.color, alpha * 0.28).fillCircle(effect.point.x, effect.point.y, radius * 0.62);
                g.lineStyle(4, effect.color, alpha * 0.9).strokeCircle(effect.point.x, effect.point.y, radius);
                for (let i = 0; i < 7; i += 1) {
                    const angle = (Math.PI * 2 * i) / 7 + this.state.timeMs / 260;
                    g.lineStyle(2, 0xfff1c2, alpha * 0.75).lineBetween(effect.point.x, effect.point.y, effect.point.x + Math.cos(angle) * radius * 1.25, effect.point.y + Math.sin(angle) * radius * 1.25);
                }
            }
        }
    }
    drawTacticalMarkers() {
        if (!this.overlayGraphics)
            return;
        const g = this.overlayGraphics;
        this.drawIntentLines();
        this.drawHoverTargeting();
        for (const entity of this.selectedEntities()) {
            if (!entity.rallyPoint)
                continue;
            g.lineStyle(2, COLORS.powered, 0.64).lineBetween(entity.x, entity.y, entity.rallyPoint.x, entity.rallyPoint.y);
            g.fillStyle(COLORS.powered, 0.18).fillCircle(entity.rallyPoint.x, entity.rallyPoint.y, 18);
            g.lineStyle(2, 0xedf2ff, 0.86).strokeCircle(entity.rallyPoint.x, entity.rallyPoint.y, 18);
            g.lineStyle(3, COLORS.powered, 0.86)
                .lineBetween(entity.rallyPoint.x - 10, entity.rallyPoint.y, entity.rallyPoint.x + 10, entity.rallyPoint.y)
                .lineBetween(entity.rallyPoint.x, entity.rallyPoint.y - 10, entity.rallyPoint.x, entity.rallyPoint.y + 10);
        }
        if (this.pendingCommand === 'set-rally') {
            g.lineStyle(2, COLORS.powered, 0.9).strokeCircle(this.input.activePointer.worldX, this.input.activePointer.worldY, 20);
        }
        if (this.pendingCommand === 'repair-link') {
            g.lineStyle(2, 0xfff1c2, 0.9).strokeCircle(this.input.activePointer.worldX, this.input.activePointer.worldY, 16);
        }
    }
    drawHoverTargeting() {
        if (!this.overlayGraphics)
            return;
        const link = this.hoveredSabotageLink();
        if (!link)
            return;
        const point = this.linkMidpoint(link);
        if (!point)
            return;
        const raider = this.selectedEntities().find((entity) => entity.owner === 'player' && entity.kind === 'raider');
        const g = this.overlayGraphics;
        const pulse = 0.58 + Math.sin(this.state.timeMs / 90) * 0.2;
        if (raider) {
            g.lineStyle(3, COLORS.player, 0.38 + pulse * 0.28).lineBetween(raider.x, raider.y, point.x, point.y);
            g.lineStyle(1, 0xfff1c2, 0.54).lineBetween(raider.x, raider.y, point.x, point.y);
        }
        g.fillStyle(COLORS.enemy, 0.16).fillCircle(point.x, point.y, 38 + pulse * 10);
        g.lineStyle(4, 0xfff1c2, 0.82).strokeCircle(point.x, point.y, 28 + pulse * 4);
        g.lineStyle(2, COLORS.enemy, 0.95).strokeCircle(point.x, point.y, 44 + pulse * 5);
        g.lineStyle(3, 0xfff1c2, 0.9)
            .lineBetween(point.x - 18, point.y, point.x + 18, point.y)
            .lineBetween(point.x, point.y - 18, point.x, point.y + 18);
        const label = this.add.text(point.x, Math.max(22, point.y - 58), 'CLICK TO CUT', {
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            color: '#FFF1C2',
            backgroundColor: '#3D1722DD',
            padding: { x: 6, y: 3 },
        });
        label.setOrigin(0.5);
        label.setDepth(11);
        this.labels.push(label);
    }
    // Cues sit above the fog: the active objective's target (lime ring plus chevron), a 2.5s ring on every
    // new pointed alert (hints are alerts too), and the burrows pulsing lime through each pre-wave silence.
    drawCues() {
        if (this.state.winner)
            return;
        const mission = this.state.match.missionId ? MISSIONS[this.state.match.missionId] : undefined;
        for (const alert of this.state.alerts)
            if (alert.point && alert.ageMs < 2500)
                this.drawCue(alert.point, 18);
        if (this.ping && this.time.now < this.ping.until)
            this.drawCue(this.ping.point, 24);
        if (!mission)
            return;
        const target = objectiveTarget(this.state, mission);
        if (target) {
            const { x, y } = target;
            this.drawCue({ x, y }, 30, undefined, COLORS.enemy);
            this.statusGraphics?.fillStyle(COLORS.enemy, 0.9).fillTriangle(x - 10, y - 58, x + 10, y - 58, x, y - 44);
        }
        if (isSilent(this.state, mission)) {
            for (const burrow of this.state.entities.filter((entity) => entity.kind === 'burrow'))
                this.drawCue(burrow, burrow.radius + 6, undefined, COLORS.enemy);
        }
        // The climax's weakest mast flickers lime through its silence.
        const mast = climaxMast(this.state, mission);
        if (mast && Math.floor(this.state.timeMs / 150) % 2 === 0)
            this.drawCue(mast, mast.radius + 6, undefined, COLORS.enemy);
    }
    drawCue(point, radius = 30, label, color = COLORS.powered) {
        if (!this.statusGraphics)
            return;
        const g = this.statusGraphics;
        const pulse = 0.52 + Math.sin(this.state.timeMs / 150) * 0.22;
        const glow = radius + 14 + Math.sin(this.state.timeMs / 210) * 8;
        g.fillStyle(color, 0.09 + pulse * 0.04).fillCircle(point.x, point.y, glow);
        g.lineStyle(4, color, 0.42 + pulse * 0.28).strokeCircle(point.x, point.y, radius + 10);
        g.lineStyle(2, 0xfff1c2, 0.72).strokeCircle(point.x, point.y, radius + 20);
        g.lineStyle(3, color, 0.88)
            .lineBetween(point.x - 13, point.y, point.x + 13, point.y)
            .lineBetween(point.x, point.y - 13, point.x, point.y + 13);
        if (!label)
            return;
        const text = this.add.text(point.x, Math.max(22, point.y - radius - 34), label.toUpperCase(), {
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            color: '#EDF2FF',
            backgroundColor: '#13182ADB',
            padding: { x: 6, y: 3 },
        });
        text.setOrigin(0.5);
        text.setDepth(10);
        this.labels.push(text);
    }
    drawExploitWindow() {
        if (!this.overlayGraphics || this.state.winner)
            return;
        const window = exploitWindowState(this.state);
        if (!window.active || window.owner !== 'enemy')
            return;
        const link = this.state.powerLinks.find((item) => item.id === window.linkId);
        const from = link ? this.state.entities.find((entity) => entity.id === link.fromId) : undefined;
        const to = link ? this.state.entities.find((entity) => entity.id === link.toId) : undefined;
        if (!from || !to)
            return;
        const point = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const g = this.overlayGraphics;
        const pct = Phaser.Math.Clamp(window.remainingPct, 0, 1);
        const pulse = 0.52 + Math.sin(this.state.timeMs / 96) * 0.18;
        const radius = 58 + (1 - pct) * 22;
        g.fillStyle(COLORS.amber, 0.08 + pulse * 0.05).fillCircle(point.x, point.y, radius + 20);
        g.fillStyle(COLORS.disabled, 0.08).fillCircle(to.x, to.y, Math.max(44, to.radius + 22));
        g.lineStyle(5, COLORS.amber, 0.7 + pulse * 0.18).strokeCircle(point.x, point.y, radius);
        g.lineStyle(2, COLORS.disabled, 0.62).strokeCircle(to.x, to.y, to.radius + 18);
        g.lineStyle(3, COLORS.amber, 0.5 + pulse * 0.18).lineBetween(point.x, point.y, to.x, to.y);
        const segmentCount = 28;
        const activeSegments = Math.max(2, Math.ceil(segmentCount * pct));
        for (let index = 0; index < activeSegments; index += 1) {
            const angle = -Math.PI / 2 + (index / segmentCount) * Math.PI * 2;
            const inner = radius + 8;
            const outer = radius + 18;
            g.lineStyle(3, COLORS.amber, 0.86)
                .lineBetween(point.x + Math.cos(angle) * inner, point.y + Math.sin(angle) * inner, point.x + Math.cos(angle) * outer, point.y + Math.sin(angle) * outer);
        }
        g.lineStyle(3, COLORS.disabled, 0.82)
            .lineBetween(point.x - 16, point.y, point.x + 16, point.y)
            .lineBetween(point.x, point.y - 16, point.x, point.y + 16);
    }
    drawIntentLines() {
        const g = this.overlayGraphics;
        for (const entity of this.state.entities) {
            if (entity.owner === 'neutral')
                continue;
            const readableEnemyIntent = entity.owner === 'enemy' && (entity.intent.type === 'attack' || entity.intent.type === 'attack-move');
            if (entity.intent.type !== 'sabotage' && entity.intent.type !== 'repair-link' && !readableEnemyIntent)
                continue;
            const target = this.intentPoint(entity);
            if (!target || !this.isPointVisible(entity))
                continue;
            if (entity.owner === 'enemy' && !this.isPointVisible(target))
                continue;
            const color = entity.intent.type === 'repair-link' ? 0xfff1c2 : entity.owner === 'player' ? COLORS.player : COLORS.enemy;
            const pulse = 0.38 + Math.sin(this.state.timeMs / 90 + this.hashId(entity.id)) * 0.16;
            g.lineStyle(readableEnemyIntent ? 5 : 4, color, readableEnemyIntent ? 0.4 + pulse * 0.22 : pulse).lineBetween(entity.x, entity.y, target.x, target.y);
            g.lineStyle(1, 0xedf2ff, pulse * 0.7).lineBetween(entity.x, entity.y, target.x, target.y);
            const t = (this.state.timeMs / 520 + this.hashId(entity.id) / 97) % 1;
            g.fillStyle(color, 0.88).fillCircle(entity.x + (target.x - entity.x) * t, entity.y + (target.y - entity.y) * t, entity.intent.type === 'repair-link' ? 4 : 6);
            if (readableEnemyIntent && !exploitWindowState(this.state).active) {
                const label = this.add.text(entity.x, entity.y - entity.radius - 24, entity.kind === 'raider' ? 'PATROL' : 'PRESSURE', {
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '11px',
                    color: '#FFC1C1',
                    backgroundColor: '#3D1722CC',
                    padding: { x: 5, y: 2 },
                });
                label.setOrigin(0.5);
                label.setDepth(10);
                this.labels.push(label);
            }
        }
    }
    hashId(id) {
        let value = 0;
        for (let i = 0; i < id.length; i += 1)
            value += id.charCodeAt(i) * (i + 1);
        return value % 97;
    }
    shouldDrawEntity(entity) {
        if (entity.owner === 'player' || entity.kind === 'burrow')
            return true;
        if (entity.owner === 'neutral')
            return this.isPointVisible(entity);
        return this.isPointVisible(entity);
    }
    visionRadius(entity) {
        if (entity.kind === 'core')
            return 290;
        if (entity.kind === 'power-node' || entity.kind === 'barracks' || entity.kind === 'factory')
            return 225;
        if (entity.kind === 'worker')
            return 190;
        return 235;
    }
    // A 40px visibility grid, recomputed whenever the state object changes (once per tick, plus after a command).
    // ponytail: sim stays omniscient; move fog into sim before stealth (v2)
    updateFogGrid() {
        if (this.fogState === this.state)
            return;
        this.fogState = this.state;
        const cols = Math.ceil(this.state.map.width / FOG_CELL);
        const rows = Math.ceil(this.state.map.height / FOG_CELL);
        if (this.fogGrid.length !== cols * rows)
            this.fogGrid = new Uint8Array(cols * rows);
        else
            this.fogGrid.fill(0);
        for (const entity of this.state.entities) {
            if (entity.owner !== 'player' || entity.hp <= 0)
                continue;
            const r = this.visionRadius(entity);
            for (let cx = Math.max(0, Math.floor((entity.x - r) / FOG_CELL)); cx <= Math.min(cols - 1, Math.floor((entity.x + r) / FOG_CELL)); cx += 1) {
                for (let cy = Math.max(0, Math.floor((entity.y - r) / FOG_CELL)); cy <= Math.min(rows - 1, Math.floor((entity.y + r) / FOG_CELL)); cy += 1) {
                    const dx = cx * FOG_CELL + FOG_CELL / 2 - entity.x;
                    const dy = cy * FOG_CELL + FOG_CELL / 2 - entity.y;
                    if (dx * dx + dy * dy <= r * r)
                        this.fogGrid[cy * cols + cx] = 1;
                }
            }
        }
    }
    isPointVisible(point) {
        const cols = Math.ceil(this.state.map.width / FOG_CELL);
        const cx = Math.floor(point.x / FOG_CELL);
        const cy = Math.floor(point.y / FOG_CELL);
        return cx >= 0 && cx < cols && cy >= 0 && this.fogGrid[cy * cols + cx] === 1;
    }
    // Fills only the cells inside the camera, padded a cell because worldView lags a frame behind a pan.
    drawFog() {
        const g = this.fogGraphics;
        const view = this.cameras.main.worldView;
        const x1 = Math.min(this.state.map.width, view.right + FOG_CELL);
        const y1 = Math.min(this.state.map.height, view.bottom + FOG_CELL);
        g.fillStyle(0x02040a, 0.64);
        for (let x = Math.max(0, Math.floor(view.x / FOG_CELL) - 1) * FOG_CELL; x < x1; x += FOG_CELL) {
            for (let y = Math.max(0, Math.floor(view.y / FOG_CELL) - 1) * FOG_CELL; y < y1; y += FOG_CELL) {
                if (!this.isPointVisible({ x, y }))
                    g.fillRect(x, y, FOG_CELL + 1, FOG_CELL + 1);
            }
        }
        g.lineStyle(1, 0x60a5fa, 0.08);
        for (const entity of this.state.entities.filter((item) => item.owner === 'player' && item.hp > 0)) {
            g.strokeCircle(entity.x, entity.y, this.visionRadius(entity));
        }
    }
    // ponytail: plain result card; 1C replaces it with a DOM debrief
    drawWinner(winner) {
        const view = this.cameras.main.worldView;
        this.statusGraphics?.fillStyle(0x050813, 0.72).fillRect(view.x, view.y, view.width, view.height);
        const text = this.add.text(view.centerX, view.centerY, winner === 'player' ? 'VICTORY' : 'DEFEAT', {
            fontFamily: 'Georgia, serif',
            fontSize: '56px',
            color: COLORS.text,
        });
        text.setOrigin(0.5);
        text.setDepth(10);
        this.labels.push(text);
    }
}
