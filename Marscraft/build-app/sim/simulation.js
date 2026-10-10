import { ARMY_CAP, BALANCE, BUILD_COST, BUILD_TIME, ENTITY_STATS, HOLLOW_KINDS, HUSK_MARROW, HYBRID_OF, PRODUCES, RESEARCH, SEVER_MS, UNIT_BLOOM, UNIT_COST, UNIT_MARROW, UNIT_TIME, VEINFIELD, missionNumber, researchOpen, } from './constants.js';
import { roleFor } from './faction.js';
import { FORKS, GRIEF, MISSIONS, TEXT, afterSpawn, capRoster, nextSpawn, researchName, spendBudget, text, waveBudget, waveUnits, weakestMast } from './campaign.js';
function cloneState(state) {
    return {
        ...state,
        players: {
            player: { ...state.players.player, researched: [...state.players.player.researched], specimens: { ...state.players.player.specimens } },
            enemy: { ...state.players.enemy, researched: [...state.players.enemy.researched], specimens: { ...state.players.enemy.specimens } },
        },
        entities: state.entities.map((entity) => ({
            ...entity,
            intent: { ...entity.intent },
            queue: entity.queue ? { ...entity.queue } : undefined,
            rallyPoint: entity.rallyPoint ? { ...entity.rallyPoint } : undefined,
            carry: entity.carry && { ...entity.carry },
            held: entity.held?.map((roster) => ({ ...roster })),
        })),
        powerLinks: state.powerLinks.map((link) => ({ ...link })),
        selectedIds: [...state.selectedIds],
        alerts: state.alerts.map((alert) => ({ ...alert, point: alert.point && { ...alert.point } })),
        shots: state.shots.map((shot) => ({ ...shot })),
        stats: { ...state.stats },
        match: {
            ...state.match,
            objectives: state.match.objectives?.map((objective) => ({ ...objective })),
            fired: [...state.match.fired],
        },
    };
}
function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
function newId(state, prefix) {
    return `${prefix}-${state.nextId++}`;
}
const NEEDS_POWER = new Set(['barracks', 'factory', 'turret', 'relay-mast', 'xeno-lab', 'brood-cyst', 'armory', 'ferrite-silo', 'gestation-pit', 'weeping-spine']);
const missionNo = (state) => missionNumber(state.match.missionId);
function findEntity(state, id) {
    return state.entities.find((entity) => entity.id === id);
}
function findPowerLink(state, id) {
    return state.powerLinks.find((link) => link.id === id);
}
const underConstruction = (entity) => (entity?.buildMs ?? 0) > 0;
// Powered: a live link from a finished, living source that is a root (no inbound link) or is itself powered,
// so cutting a node's inbound link darkens everything downstream. An unfinished building is never powered.
// Node links only point from an older node to a newer one, so the recursion always ends.
// A living Mourner is a mobile vein: it feeds every Brood Cyst within 160px (M5).
function isPowered(state, buildingId) {
    const building = findEntity(state, buildingId);
    if (underConstruction(building))
        return false;
    if (building?.kind === 'brood-cyst' && state.entities.some((entity) => entity.kind === 'mourner' && entity.owner === building.owner && entity.hp > 0 && distance(entity, building) <= 160))
        return true;
    return state.powerLinks.some((link) => {
        if (link.toId !== buildingId || link.disabledMs > 0)
            return false;
        const source = findEntity(state, link.fromId);
        if (!source || underConstruction(source))
            return false;
        return !state.powerLinks.some((inbound) => inbound.toId === source.id) || isPowered(state, source.id);
    });
}
function connectedPowerLink(state, buildingId) {
    return state.powerLinks.find((link) => link.toId === buildingId);
}
function productionItem(unitKind) {
    return { unitKind, remainingMs: UNIT_TIME[unitKind], totalMs: UNIT_TIME[unitKind] };
}
export function has(state, owner, id) {
    return owner !== 'neutral' && state.players[owner].researched.includes(id);
}
// A species is dissected once its dissection finished or a saved fork pre-loaded it.
export function dissected(state, owner, species) {
    return ['dissect', 'harness', 'counter'].some((prefix) => has(state, owner, `${prefix}-${species}`));
}
const forked = (state, owner, species) => has(state, owner, `harness-${species}`) || has(state, owner, `counter-${species}`);
function finished(state, owner, kind) {
    return state.entities.filter((entity) => entity.owner === owner && entity.kind === kind && entity.hp > 0 && !underConstruction(entity));
}
// Hybrids need their species' HARNESS fork and a finished, living Xeno Lab; Link Raiders unlock in M4 and Bulwarks in M5
// (design 7a); every other unit is always allowed.
const UNLOCK = { raider: 4, heavy: 5 };
export function requires(state, owner, kind) {
    if (state.match.missionId && missionNo(state) < (UNLOCK[kind] ?? 0))
        return false;
    const species = HYBRID_OF[kind];
    return !species || (has(state, owner, `harness-${species}`) && finished(state, owner, 'xeno-lab').length > 0);
}
// A research button shows when its mission teaches it, its COUNTER fork is picked, and (a dissection) its species is undissected.
export function researchShown(state, owner, row) {
    return researchOpen(row, state.match.missionId) && (!row.requires || has(state, owner, row.requires)) && !(row.specimens && dissected(state, owner, row.specimens[0]));
}
const specimensHeld = (state, owner, row) => owner !== 'neutral' && (!row.specimens || (state.players[owner].specimens[row.specimens[0]] ?? 0) >= row.specimens[1]);
// Bloom only moves through here, so the first crossing of 25 and 50 fires Varga's line once, pointed at the Core.
function addBloom(state, owner, amount) {
    if (owner === 'neutral')
        return;
    const wallet = state.players[owner];
    const before = wallet.bloom;
    wallet.bloom = Math.max(0, Math.min(100, before + amount));
    for (const mark of [25, 50])
        if (owner === 'player' && before < mark && wallet.bloom >= mark)
            trigger(state, `bloom-${mark}`, livingCore(state) ?? { x: 0, y: 0 });
}
// Research stat patches, set from base stats so applying twice changes nothing.
function applyResearchStats(entity, researched) {
    // Kinetic Rounds: Riflemen, hybrid infantry and Sentries +15%; Living Rounds: Riflemen and hybrid infantry +2.
    const rifle = HOLLOW_KINDS.includes(entity.kind);
    if (rifle || entity.kind === 'turret') {
        entity.damage = ENTITY_STATS[entity.kind].damage * (researched.includes('kinetic_rounds') ? 1.15 : 1) + (rifle && researched.includes('living_rounds') ? 2 : 0);
    }
    // Rangefinder Lattice: Sentries 210, Riflemen +30, Bulwarks 210.
    if (researched.includes('rangefinder_lattice') && entity.kind === 'turret')
        entity.range = BALANCE.latticeSentryRange;
    if (researched.includes('rangefinder_lattice') && entity.kind === 'heavy')
        entity.range = BALANCE.latticeBulwarkRange;
    // Ceramic Plating: units +15% max hp, hp scaled with it.
    if (researched.includes('ceramic_plating') && entity.speed > 0) {
        const maxHp = ENTITY_STATS[entity.kind].hp * BALANCE.platingMult;
        entity.hp *= maxHp / entity.maxHp;
        entity.maxHp = maxHp;
    }
    if (researched.includes('rangefinder_lattice') && entity.kind === 'infantry')
        entity.range = ENTITY_STATS.infantry.range + BALANCE.latticeRifleRange;
    if (researched.includes('hardline_grid') && entity.kind === 'power-node') {
        const bonus = ENTITY_STATS[entity.kind].hp + 100 - entity.maxHp;
        entity.maxHp += bonus;
        entity.hp += bonus;
    }
}
// Patches every living unit, so finished research never "does nothing".
function applyResearch(state, owner) {
    for (const entity of state.entities)
        if (entity.owner === owner)
            applyResearchStats(entity, state.players[owner].researched);
}
export function unitCost(state, owner, kind) {
    return (kind === 'infantry' || kind === 'grafted-trooper') && has(state, owner, 'rapid_muster') ? Math.round(UNIT_COST[kind] * 0.75) : UNIT_COST[kind];
}
export function createEntity(id, owner, kind, point, researched = []) {
    const stats = ENTITY_STATS[kind];
    const entity = {
        id,
        owner,
        kind,
        x: point.x,
        y: point.y,
        radius: stats.radius,
        hp: stats.hp,
        maxHp: stats.hp,
        speed: stats.speed,
        damage: stats.damage,
        range: stats.range,
        attackCooldownMs: stats.cooldown,
        attackTimerMs: 0,
        intent: { type: 'idle' },
        gatherTimerMs: kind === 'worker' ? 0 : undefined,
    };
    applyResearchStats(entity, researched);
    return entity;
}
// Every alert but Murmur's passes a point (design 11 fairness rule: fake alerts never have a map ping).
function addAlert(state, text, point, textId) {
    if (state.alerts[0]?.text === text && state.alerts[0].ageMs < 1000)
        return;
    state.alerts.unshift({ id: `${state.timeMs}-${text}`, text, ...(point ? { point: { x: point.x, y: point.y } } : {}), ageMs: 0, ...(textId ? { textId } : {}) });
    state.alerts = state.alerts.slice(0, 4);
}
function labelForKind(kind, owner) {
    return roleFor(kind, owner) ?? kind;
}
function sabotageAlertText(link, target) {
    const owner = link.owner === 'player' ? 'Player' : 'Enemy';
    const asset = target ? labelForKind(target.kind, link.owner) : 'Power Link';
    const seconds = Math.round(link.disabledMs / 1000);
    const consequence = target?.kind === 'barracks' || target?.kind === 'factory'
        ? `${productionFamily(target)} offline for ${seconds}s`
        : target?.kind === 'turret'
            ? `defense offline for ${seconds}s`
            : `grid offline for ${seconds}s`;
    return `${owner} ${asset} grid severed: ${consequence}`;
}
function sabotageOrderText(actor, link, target) {
    const role = labelForKind(actor.kind, actor.owner);
    const owner = link.owner === 'player' ? 'Player' : 'Enemy';
    const asset = target ? labelForKind(target.kind, link.owner) : 'Power Link';
    return `${role} locked on ${owner} ${asset} power link`;
}
function empSpikeAlertText(actor, link, target) {
    const role = labelForKind(actor.kind, actor.owner);
    const owner = link.owner === 'player' ? 'Player' : 'Enemy';
    const asset = target ? labelForKind(target.kind, link.owner) : 'Power Link';
    return `${role} EMP spiked ${owner} ${asset} power link`;
}
function productionFamily(target) {
    if (target?.kind === 'factory')
        return 'heavy production';
    if (target?.kind === 'barracks')
        return 'infantry and raider production';
    return 'production';
}
function recordProductionCut(state, actor, target) {
    if (target?.kind !== 'barracks' && target?.kind !== 'factory')
        return;
    const infantryCut = target.kind === 'barracks';
    if (actor.owner === 'player') {
        if (infantryCut)
            state.stats.playerInfantryCuts += 1;
        else
            state.stats.playerArmorCuts += 1;
    }
    if (actor.owner === 'enemy') {
        if (infantryCut)
            state.stats.enemyInfantryCuts += 1;
        else
            state.stats.enemyArmorCuts += 1;
    }
}
function destroyedAlertText(entity) {
    return `${labelForKind(entity.kind, entity.owner)} destroyed`;
}
function triggerPlayerExfilPulse(state, actor, point) {
    actor.hp = Math.max(actor.hp, actor.maxHp);
    for (const entity of state.entities) {
        if (entity.owner === actor.owner || entity.owner === 'neutral' || entity.damage <= 0)
            continue;
        if (distance(entity, point) <= 260)
            entity.attackTimerMs = Math.max(entity.attackTimerMs, 3600);
    }
}
// Player Raiders fall back to their Core; a Hush saboteur gets no retreat, so runWaves re-targets it.
function raiderRetreatPoint(state, owner) {
    const core = owner === 'player' ? livingCore(state) : undefined;
    return core && { x: core.x, y: core.y };
}
// The one spending choke point; a rejection spends nothing.
function spend(state, owner, cost) {
    const wallet = state.players[owner];
    if (wallet.ore < cost.ore || wallet.marrow < (cost.marrow ?? 0))
        return false;
    wallet.ore -= cost.ore;
    wallet.marrow -= cost.marrow ?? 0;
    return true;
}
export function isBuildCommand(mode) {
    return mode.startsWith('build-') && mode.slice(6) in BUILD_COST;
}
const MAST_FEEDS = 2;
// Grid Overdrive: a node feeds 6 buildings instead of 4.
const nodeSlots = (state, owner) => (has(state, owner, 'grid_overdrive') ? BALANCE.overdriveSlots : 4);
const nodeRange = (state, owner) => (has(state, owner, 'long_relays') ? 440 : 320);
// Node-to-node links don't use one of a node's 4 slots.
const slotsUsed = (state, node) => state.powerLinks.filter((link) => link.fromId === node.id && findEntity(state, link.toId)?.kind !== 'power-node').length;
// The nearest own node within range, optionally only one with a free slot.
function nearestNode(state, owner, point, needsSlot) {
    return state.entities
        .filter((entity) => entity.owner === owner && entity.kind === 'power-node' && distance(entity, point) <= nodeRange(state, owner))
        .filter((node) => !needsSlot || slotsUsed(state, node) < nodeSlots(state, owner))
        .sort((a, b) => distance(a, point) - distance(b, point))[0];
}
// A node feeds every Relay Mast in range that has a free feed (2 per mast), while it has slots left.
export function linkMasts(state, node) {
    if (node.owner === 'neutral')
        return;
    for (const mast of state.entities) {
        if (mast.kind !== 'relay-mast' || distance(mast, node) > nodeRange(state, node.owner) || slotsUsed(state, node) >= nodeSlots(state, node.owner))
            continue;
        const feeds = state.powerLinks.filter((link) => link.toId === mast.id);
        if (feeds.length >= MAST_FEEDS || feeds.some((link) => link.fromId === node.id))
            continue;
        state.powerLinks.push({ id: `${node.owner}-link-${node.id}-${mast.id}`, owner: node.owner, fromId: node.id, toId: mast.id, disabledMs: 0 });
    }
}
// A placed building starts at 10% hp and builds itself over BUILD_TIME; a rejection spends nothing.
function placeBuilding(state, worker, mode, point) {
    if (worker.kind !== 'worker' || worker.owner === 'neutral')
        return;
    const owner = worker.owner;
    const kind = mode.slice(6);
    const mission = state.match.missionId ? MISSIONS[state.match.missionId] : undefined;
    if (mission && !mission.builds.includes(kind))
        return;
    const radius = ENTITY_STATS[kind].radius;
    if (state.entities.some((entity) => entity.speed === 0 && entity.kind !== 'husk' && distance(entity, point) < entity.radius + radius + 40)) {
        addAlert(state, 'Too close to another structure', point);
        return;
    }
    // A new node must chain from one of yours.
    const chained = kind === 'power-node' && Boolean(mission);
    const node = kind !== 'power-node' || chained ? nearestNode(state, owner, point, !chained) : undefined;
    if ((kind !== 'power-node' || chained) && !node) {
        addAlert(state, 'No power node in range', point);
        return;
    }
    if (!spend(state, owner, { ore: BUILD_COST[kind] }))
        return;
    const building = createEntity(newId(state, `${owner}-${kind}-built`), owner, kind, point, state.players[owner].researched);
    building.hp = building.maxHp * 0.1;
    building.buildMs = BUILD_TIME[kind];
    state.entities.push(building);
    worker.intent = { type: 'move', point: { x: point.x - 28, y: point.y + 28 } };
    if (node)
        state.powerLinks.push({ id: `${owner}-link-${building.id}`, owner, fromId: node.id, toId: building.id, disabledMs: 0 });
    if (kind === 'power-node')
        linkMasts(state, building);
}
// A Foundry building builds over BUILD_TIME; a regrowing Hush Cyst grows over cystRegrowMs.
export const buildTotalMs = (kind) => BUILD_TIME[kind] ?? BALANCE.cystRegrowMs;
function updateConstruction(state, entity, dtMs) {
    if (!entity.buildMs)
        return;
    entity.buildMs = Math.max(0, entity.buildMs - dtMs);
    entity.hp = Math.min(entity.maxHp, entity.hp + (0.9 * entity.maxHp * dtMs) / buildTotalMs(entity.kind));
    if (entity.buildMs === 0 && entity.owner === 'player')
        addAlert(state, `${labelForKind(entity.kind, entity.owner)} online`, entity);
}
function finishMatch(state, reason) {
    state.match.phase = 'complete';
    state.match.endReason = reason;
}
function canSetRally(entity) {
    return entity.kind === 'barracks' || entity.kind === 'factory';
}
function canOverload(entity) {
    return canSetRally(entity);
}
function linkMidpoint(state, link) {
    const from = findEntity(state, link.fromId);
    const to = findEntity(state, link.toId);
    return from && to ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : undefined;
}
function nearestEnemyPowerLink(state, actor, range = BALANCE.empSpikeRange) {
    return state.powerLinks
        .filter((link) => link.owner !== actor.owner && link.disabledMs <= 0)
        .map((link) => ({ link, point: linkMidpoint(state, link) }))
        .filter((candidate) => Boolean(candidate.point))
        .filter((candidate) => distance(actor, candidate.point) <= range)
        .sort((a, b) => distance(actor, a.point) - distance(actor, b.point))[0]?.link;
}
// The fork pick (design 7c), reached only through a fork-<species>-<side> command, so the command log replays it.
function chooseFork(state, species, side) {
    if (state.match.pendingFork !== species || (side !== 'harness' && side !== 'counter'))
        return;
    state.match.pendingFork = undefined;
    state.players.player.researched.push(`${side}-${species}`);
    const lab = finished(state, 'player', 'xeno-lab')[0] ?? livingCore(state);
    if (side === 'harness') {
        addBloom(state, 'player', BALANCE.forkBloom);
        // Varga's first subjects walk out of the Lab (the Skitter fork only, design 7c); spawnUnit adds their Bloom.
        const hybrid = Object.keys(HYBRID_OF).find((kind) => HYBRID_OF[kind] === species);
        if (lab && hybrid && species === 'skitter')
            for (let i = 0; i < 3; i += 1)
                spawnUnit(state, lab, hybrid);
    }
    const point = lab ?? { x: 0, y: 0 };
    addAlert(state, text(`fork.${species}.${side}`), point, `fork.${species}.${side}`);
    trigger(state, 'fork', point);
}
export function issueSmartCommand(source, command) {
    const state = cloneState(source);
    if (command.mode.startsWith('fork-')) {
        const [, species, side] = command.mode.split('-');
        chooseFork(state, species, side);
        return state;
    }
    const targetEntity = command.targetId ? findEntity(state, command.targetId) : undefined;
    const targetLink = command.targetId ? findPowerLink(state, command.targetId) : undefined;
    const movers = command.actorIds.map((id) => findEntity(state, id)).filter((entity) => !!entity && entity.speed > 0);
    const centroid = {
        x: movers.reduce((sum, entity) => sum + entity.x, 0) / (movers.length || 1),
        y: movers.reduce((sum, entity) => sum + entity.y, 0) / (movers.length || 1),
    };
    for (const id of command.actorIds) {
        const actor = findEntity(state, id);
        if (!actor || actor.owner === 'neutral')
            continue;
        if (isBuildCommand(command.mode)) {
            placeBuilding(state, actor, command.mode, command.targetPoint);
            continue;
        }
        if (command.mode === 'stop') {
            actor.intent = { type: 'idle' };
            continue;
        }
        if (command.mode === 'set-rally' && canSetRally(actor)) {
            actor.rallyPoint = { ...command.targetPoint };
            addAlert(state, 'Rally route locked', command.targetPoint);
            continue;
        }
        // Marrow Overload: the same boost paid in marrow, with no strain, for +2 Bloom.
        if ((command.mode === 'overload' || command.mode === 'marrow-overload') && canOverload(actor)) {
            const marrow = command.mode === 'marrow-overload';
            const ready = (actor.overloadMs ?? 0) <= 0 && (actor.overloadCooldownMs ?? 0) <= 0;
            const cost = marrow ? { ore: 0, marrow: BALANCE.marrowOverloadCost } : { ore: BALANCE.overloadCost };
            if (ready && isPowered(state, actor.id) && spend(state, actor.owner, cost)) {
                actor.overloadMs = BALANCE.overloadMs;
                actor.overloadCooldownMs = BALANCE.overloadMs + BALANCE.overloadCooldownMs;
                actor.noStrain = marrow;
                if (marrow)
                    addBloom(state, actor.owner, BALANCE.marrowOverloadBloom);
                if (actor.owner === 'player')
                    state.stats.playerOverloads += 1;
                if (actor.owner === 'enemy')
                    state.stats.enemyOverloads += 1;
                addAlert(state, 'Production overload engaged', actor);
            }
            continue;
        }
        if (command.mode === 'emp-spike' && actor.kind === 'raider') {
            const link = targetLink && targetLink.owner !== actor.owner ? targetLink : nearestEnemyPowerLink(state, actor);
            const midpoint = link ? linkMidpoint(state, link) : undefined;
            const ready = (actor.empCooldownMs ?? 0) <= 0;
            if (link && midpoint && ready && link.disabledMs <= 0 && distance(actor, midpoint) <= BALANCE.empSpikeRange) {
                link.disabledMs = BALANCE.empSpikeMs;
                actor.empCooldownMs = has(state, actor.owner, 'sever_charges') ? BALANCE.severChargesEmpCooldownMs : BALANCE.empSpikeCooldownMs;
                if (link.owner === 'enemy' && actor.owner === 'player')
                    trigger(state, 'first-sever', midpoint);
                if (actor.owner === 'player')
                    state.stats.playerSabotages += 1;
                if (actor.owner === 'enemy')
                    state.stats.enemySabotages += 1;
                const target = findEntity(state, link.toId);
                recordProductionCut(state, actor, target);
                addAlert(state, empSpikeAlertText(actor, link, target), midpoint);
            }
            continue;
        }
        // Purge: the Core's queue slot burns marrow for 10s, then Bloom drops by 5.
        // ponytail: the 40 marrow is paid up front rather than burned over the 10s
        if (command.mode === 'purge') {
            if (actor.kind === 'core' && !actor.queue && spend(state, actor.owner, { ore: 0, marrow: BALANCE.purgeMarrow })) {
                actor.queue = { purge: true, remainingMs: BALANCE.purgeMs, totalMs: BALANCE.purgeMs };
            }
            continue;
        }
        if (command.mode.startsWith('research-')) {
            const row = RESEARCH.find((item) => `research-${item.id}` === command.mode);
            const running = state.entities.some((entity) => entity.owner === actor.owner && entity.queue?.researchId === row?.id);
            const open = row && actor.kind === row.at && researchShown(state, actor.owner, row) && specimensHeld(state, actor.owner, row);
            if (row && open && !actor.queue && !running && !has(state, actor.owner, row.id) && spend(state, actor.owner, { ore: row.cost, marrow: row.marrow })) {
                actor.queue = { researchId: row.id, remainingMs: row.timeMs, totalMs: row.timeMs };
            }
            continue;
        }
        if (command.mode.startsWith('produce-')) {
            const unitKind = command.mode.replace('produce-', '');
            const canProduce = Boolean(PRODUCES[actor.kind]?.includes(unitKind)) && requires(state, actor.owner, unitKind);
            const army = state.entities.filter((entity) => entity.owner === actor.owner && entity.speed > 0 && entity.hp > 0).length;
            if (canProduce && state.match.missionId && actor.owner === 'player' && army >= ARMY_CAP) {
                addAlert(state, `Army cap ${ARMY_CAP}`, actor);
                continue;
            }
            if (canProduce && !actor.queue && spend(state, actor.owner, { ore: unitCost(state, actor.owner, unitKind), marrow: UNIT_MARROW[unitKind] })) {
                actor.queue = productionItem(unitKind);
            }
            continue;
        }
        if (command.mode === 'repair-link' && targetLink && actor.kind === 'worker' && targetLink.owner === actor.owner) {
            actor.intent = { type: 'repair-link', targetId: targetLink.id };
            continue;
        }
        if (actor.speed <= 0)
            continue;
        if (command.mode === 'hold-position') {
            actor.intent = { type: 'hold' };
            continue;
        }
        if (command.mode === 'attack-move') {
            actor.intent = { type: 'attack-move', point: { ...command.targetPoint } };
            continue;
        }
        if (targetLink && actor.kind === 'worker' && targetLink.owner === actor.owner && targetLink.disabledMs > 0) {
            actor.intent = { type: 'repair-link', targetId: targetLink.id };
            continue;
        }
        if (targetLink && actor.kind === 'raider' && targetLink.owner !== actor.owner) {
            actor.intent = { type: 'sabotage', targetId: targetLink.id };
            const target = findEntity(state, targetLink.toId);
            const from = findEntity(state, targetLink.fromId);
            const point = from && target ? { x: (from.x + target.x) / 2, y: (from.y + target.y) / 2 } : command.targetPoint;
            addAlert(state, sabotageOrderText(actor, targetLink, target), point);
            continue;
        }
        if (targetEntity?.kind === 'ore' && actor.kind === 'worker') {
            actor.intent = { type: 'harvest', targetId: targetEntity.id };
            continue;
        }
        // Each Drone hauls the clicked husk (or Okafor's drone), or the nearest husk nobody else has claimed.
        if ((targetEntity?.kind === 'husk' || targetEntity?.kind === 'okafor-drone') && actor.kind === 'worker') {
            const claimed = (husk) => state.entities.some((entity) => entity !== actor && entity.intent.type === 'harvest' && entity.intent.targetId === husk.id);
            const husk = claimed(targetEntity)
                ? state.entities.filter((entity) => entity.kind === 'husk' && !claimed(entity)).sort((a, b) => distance(actor, a) - distance(actor, b))[0]
                : targetEntity;
            if (husk)
                actor.intent = { type: 'harvest', targetId: husk.id };
            continue;
        }
        if (targetEntity && targetEntity.owner !== actor.owner && targetEntity.owner !== 'neutral') {
            actor.intent = { type: 'attack', targetId: targetEntity.id };
            continue;
        }
        // Formation move: each unit keeps its offset from the group centroid, clamped to 80px.
        const offset = { x: actor.x - centroid.x, y: actor.y - centroid.y };
        const scale = Math.min(1, 80 / (Math.sqrt(offset.x * offset.x + offset.y * offset.y) || 1));
        actor.intent = {
            type: 'move',
            point: {
                x: Math.max(20, Math.min(state.map.width - 20, command.targetPoint.x + offset.x * scale)),
                y: Math.max(20, Math.min(state.map.height - 20, command.targetPoint.y + offset.y * scale)),
            },
        };
    }
    return state;
}
function moveToward(state, entity, target, dtSeconds) {
    const dx = target.x - entity.x;
    const dy = target.y - entity.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1) {
        entity.intent = { type: 'idle' };
        return;
    }
    const step = Math.min(length, (entity.marchSpeed ?? entity.speed) * dtSeconds);
    entity.x = Math.max(20, Math.min(state.map.width - 20, entity.x + (dx / length) * step));
    entity.y = Math.max(20, Math.min(state.map.height - 20, entity.y + (dy / length) * step));
    if (step >= length - 1)
        entity.intent = { type: 'idle' };
}
// A Grief structure is only ever shot on an explicit attack order, so attack-move and idle fire never call a Grief wave by accident.
// ponytail: the design doesn't say; revisit if playtests want attack-move to take Spires
const autoTarget = (actor, entity) => entity.owner !== actor.owner && entity.owner !== 'neutral' && entity.hp > 0 && !GRIEF[entity.kind];
function nearestEnemy(state, actor, radius) {
    let best;
    let bestDistance = radius;
    for (const entity of state.entities) {
        if (!autoTarget(actor, entity))
            continue;
        const d = distance(actor, entity);
        if (d <= bestDistance)
            [best, bestDistance] = [entity, d];
    }
    return best;
}
function nearestEnemyInWeaponRange(state, actor) {
    return state.entities
        .filter((entity) => autoTarget(actor, entity))
        .sort((a, b) => distance(actor, a) - distance(actor, b))
        .find((entity) => distance(actor, entity) <= actor.range + actor.radius + entity.radius);
}
function autoAcquireTarget(state, actor) {
    if (actor.damage <= 0 || actor.owner === 'neutral' || actor.kind === 'worker')
        return undefined;
    // An unfed Sentry or Weeping Spine holds fire.
    if (NEEDS_POWER.has(actor.kind) && !isPowered(state, actor.id))
        return undefined;
    return nearestEnemy(state, actor, Math.max(BALANCE.autoAcquireRadius, actor.range + 60));
}
function enemyGridIsDown(state) {
    return state.powerLinks.some((link) => link.owner === 'enemy' && link.disabledMs > 0);
}
function playerGridIsDown(state) {
    return state.powerLinks.some((link) => link.owner === 'player' && link.disabledMs > 0);
}
// Vein locks (design 9 M4, M5): a Brood Cyst or Weeping Spine takes x0.25 damage while a vein feeding it is live,
// and the Cradle takes none, so a Sever, an EMP or killing the Spires opens them.
const VEIN_LOCKED = new Set(['brood-cyst', 'weeping-spine', 'cradle']);
// The finale can't be skipped (design 9 M5): a destroy objective with a climax closes its target from the 50% mark
// (the objective's startedMs) until cradleClosedMs after the climax spawns, 8s of silence later.
export function closedToDamage(state, victim) {
    const mission = state.match.missionId ? MISSIONS[state.match.missionId] : undefined;
    const objective = mission?.objectives.find((item) => item.kind === 'destroy' && item.unit === victim.kind && mission.climaxes.some((climax) => climax.objectiveId === item.id));
    if (!objective)
        return false;
    const started = state.match.objectives?.find((live) => live.id === objective.id)?.startedMs;
    // Before evaluateObjectives arms it, the hit that crosses 50% closes it for the rest of the tick.
    return started === undefined ? victim.hp < victim.maxHp / 2 : state.timeMs < started + 8000 + BALANCE.cradleClosedMs;
}
// vsLarge against 300+ max hp (Breach Shells: Bulwarks x1.5 more against 500+), then the vein lock and the closed finale.
function hit(state, actor, victim, damage) {
    const breach = actor.kind === 'heavy' && victim.maxHp >= 500 && has(state, actor.owner, 'breach_shells') ? BALANCE.breachMult : 1;
    const large = victim.maxHp >= 300 ? (ENTITY_STATS[actor.kind].vsLarge ?? 1) * breach : 1;
    const fed = VEIN_LOCKED.has(victim.kind) && isPowered(state, victim.id);
    if (fed && victim.kind === 'cradle' && actor.owner === 'player')
        trigger(state, 'first-ribs', victim);
    const lock = fed ? (victim.kind === 'cradle' ? 0 : 0.25) : 1;
    victim.hp -= closedToDamage(state, victim) ? 0 : damage * large * lock;
    victim.hitById = actor.id;
}
function attackTarget(state, actor, target, dtSeconds) {
    const range = actor.range + actor.radius + target.radius;
    if (distance(actor, target) > range) {
        if (actor.speed <= 0)
            return;
        moveToward(state, actor, target, dtSeconds);
        return;
    }
    actor.attackTimerMs -= dtSeconds * 1000;
    if (actor.attackTimerMs <= 0) {
        // Bone-Saw Bayonets key on the target's range, not distance: range checks add both radii, so a Skitter bites from ~39px.
        // Chorus (Bloom 50+): hybrids +10%, read live so a Purge below 50 takes it away.
        const chorus = actor.owner === 'player' && HYBRID_OF[actor.kind] && state.players.player.bloom >= 50 ? 1.1 : 1;
        const damage = (actor.damage + (has(state, actor.owner, 'bone_saw_bayonets') && actor.kind === 'infantry' && target.range <= 30 ? 6 : 0)) * chorus;
        hit(state, actor, target, damage);
        // Splash (Mourner, Chimera): full damage to every other enemy within its radius of the target.
        const splash = ENTITY_STATS[actor.kind].splash ?? 0;
        for (const other of state.entities) {
            if (splash && other !== target && other.owner !== actor.owner && other.owner !== 'neutral' && other.hp > 0 && distance(other, target) <= splash)
                hit(state, actor, other, damage);
        }
        // A vein-locked structure's idle garrison (within 160px) turns on whoever hits it.
        if (VEIN_LOCKED.has(target.kind) && actor.owner !== target.owner) {
            for (const guard of state.entities) {
                if (guard.owner === target.owner && guard.intent.type === 'idle' && guard.speed > 0 && guard.damage > 0 && distance(guard, target) <= 160) {
                    guard.intent = { type: 'attack', targetId: actor.id };
                }
            }
        }
        state.shots.push({ fromId: actor.id, toId: target.id, kind: actor.kind });
        if (actor.owner === 'player' && target.owner === 'enemy' && enemyGridIsDown(state))
            state.stats.playerExploitDamage += actor.damage;
        if (actor.owner === 'enemy' && target.owner === 'player' && playerGridIsDown(state))
            state.stats.enemyExploitDamage += actor.damage;
        actor.attackTimerMs = actor.attackCooldownMs;
    }
}
function nearestFreeOre(state, actor) {
    const minersOn = (node) => state.entities.filter((entity) => entity !== actor && entity.kind === 'worker' && entity.intent.type === 'harvest' && entity.intent.targetId === node.id).length;
    return state.entities
        .filter((entity) => entity.kind === 'ore' && (entity.amount ?? 1) > 0 && minersOn(entity) < 2)
        .sort((a, b) => distance(actor, a) - distance(actor, b))[0];
}
function updateHarvest(state, actor, intent, dtSeconds) {
    if (actor.owner === 'neutral')
        return;
    if (actor.carry) {
        // A husk is carried at 60% speed (80% with Drone Haulers) to the nearest finished Xeno Lab, else the Core.
        // Okafor's drone always goes to the Core.
        const husk = actor.carry.sourceKind !== undefined;
        const okafor = actor.carry.sourceKind === 'okafor-drone';
        // Ferrite goes to the nearest Core or powered Ferrite Silo.
        const nearest = (...kinds) => kinds
            .flatMap((kind) => finished(state, actor.owner, kind))
            .filter((entity) => entity.kind !== 'ferrite-silo' || isPowered(state, entity.id))
            .sort((a, b) => distance(actor, a) - distance(actor, b))[0];
        const core = (husk && !okafor ? nearest('xeno-lab') : undefined) ?? (husk ? nearest('core') : nearest('core', 'ferrite-silo'));
        if (!core)
            return;
        if (distance(actor, core) > actor.radius + core.radius + 6) {
            moveToward(state, actor, core, dtSeconds * (husk ? (has(state, actor.owner, 'drone_haulers') ? 0.8 : 0.6) : 1));
            return;
        }
        // Its recording opens in the log panel (GameScene opens any new log.* in fired).
        if (okafor) {
            if (!state.match.fired.includes('log.okafor-last'))
                state.match.fired.push('log.okafor-last');
        }
        else if (husk) {
            state.players[actor.owner].marrow += actor.carry.amount;
            const species = actor.carry.sourceKind;
            const specimens = state.players[actor.owner].specimens;
            if (core.kind === 'xeno-lab' && FORKS[species])
                specimens[species] = (specimens[species] ?? 0) + 1;
            if (actor.owner === 'player')
                state.stats.playerHusksDelivered += 1;
        }
        else {
            state.players[actor.owner].ore += actor.carry.amount;
            state.players[actor.owner].mined += actor.carry.amount;
        }
        actor.carry = undefined;
        return;
    }
    const target = findEntity(state, intent.targetId);
    if ((target?.kind === 'husk' || target?.kind === 'okafor-drone') && target.hp > 0) {
        if (distance(actor, target) > actor.radius + target.radius + 6) {
            moveToward(state, actor, target, dtSeconds);
            return;
        }
        const sourceKind = target.sourceKind ?? target.kind;
        actor.carry = { amount: HUSK_MARROW[sourceKind] ?? 0, sourceKind };
        target.hp = 0;
        return;
    }
    // ponytail: a hauler whose husk is gone (or delivered) goes back to mining
    let node = target?.kind === 'ore' ? target : undefined;
    if (!node || (node.amount ?? 1) <= 0) {
        node = nearestFreeOre(state, actor);
        if (!node) {
            actor.intent = { type: 'idle' };
            return;
        }
        intent.targetId = node.id;
    }
    if (distance(actor, node) > actor.radius + node.radius + 6) {
        moveToward(state, actor, node, dtSeconds);
        return;
    }
    actor.gatherTimerMs = (actor.gatherTimerMs ?? 0) + dtSeconds * 1000;
    if (actor.gatherTimerMs < (has(state, actor.owner, 'deep_bore') ? 1500 : BALANCE.mineMs))
        return;
    actor.gatherTimerMs = 0;
    const capacity = has(state, actor.owner, 'drone_haulers') ? 14 : BALANCE.mineLoad;
    const load = Math.min(capacity, node.amount ?? capacity);
    if (node.amount !== undefined)
        node.amount -= load;
    actor.carry = { amount: load };
}
// Push overlapping friendly movers apart, half the overlap each (a unit on hold doesn't budge, so the other takes all of it);
// zero-distance pairs split along x by array order.
// ponytail: O(n²), fine to ~150 movers; bucket grid if profiling says so
// ponytail: same-owner pairs only and mining drones ghost, so nobody body-blocks a raid or gets shoved off a node
function separate(state) {
    const movers = state.entities.filter((entity) => entity.speed > 0 && entity.hp > 0 && entity.intent.type !== 'harvest');
    for (let i = 0; i < movers.length; i += 1) {
        for (let j = i + 1; j < movers.length; j += 1) {
            const a = movers[i];
            const b = movers[j];
            if (a.owner !== b.owner)
                continue;
            const d = distance(a, b);
            const overlap = a.radius + b.radius - d;
            const wa = a.intent.type === 'hold' ? 0 : 1;
            const wb = b.intent.type === 'hold' ? 0 : 1;
            if (overlap <= 0 || wa + wb === 0)
                continue;
            const nx = d > 0 ? (b.x - a.x) / d : 1;
            const ny = d > 0 ? (b.y - a.y) / d : 0;
            const push = overlap / (wa + wb);
            a.x = Math.max(20, Math.min(state.map.width - 20, a.x - nx * push * wa));
            a.y = Math.max(20, Math.min(state.map.height - 20, a.y - ny * push * wa));
            b.x = Math.max(20, Math.min(state.map.width - 20, b.x + nx * push * wb));
            b.y = Math.max(20, Math.min(state.map.height - 20, b.y + ny * push * wb));
        }
    }
}
function updateUnitIntent(state, actor, dtSeconds) {
    if (actor.intent.type === 'harvest') {
        updateHarvest(state, actor, actor.intent, dtSeconds);
        return;
    }
    // Retaliate: a hit idle unit attack-moves at its attacker, and idle allies within 160px join it.
    // ponytail: player units only; Hush waves are never idle and placed garrisons answer through the vein-lock rule in
    // attackTarget; extend to the Hush if playtests show a sniped garrison standing still
    const attacker = actor.owner === 'player' && actor.intent.type === 'idle' && actor.hitById ? findEntity(state, actor.hitById) : undefined;
    actor.hitById = actor.intent.type === 'idle' ? undefined : actor.hitById;
    if (attacker && attacker.hp > 0 && actor.speed > 0 && actor.damage > 0 && actor.kind !== 'worker') {
        for (const ally of state.entities) {
            const joins = ally === actor || (ally.owner === actor.owner && ally.intent.type === 'idle' && ally.speed > 0 && ally.damage > 0 && ally.kind !== 'worker' && distance(ally, actor) <= 160);
            if (joins)
                ally.intent = { type: 'attack-move', point: { x: attacker.x, y: attacker.y } };
        }
    }
    if (actor.intent.type === 'idle') {
        const threat = autoAcquireTarget(state, actor);
        if (threat) {
            attackTarget(state, actor, threat, dtSeconds);
            return;
        }
    }
    if (actor.intent.type === 'move') {
        // Arrived within its own radius, so pushed-apart blobs still go idle and shoot.
        if (distance(actor, actor.intent.point) <= actor.radius)
            actor.intent = { type: 'idle' };
        else
            moveToward(state, actor, actor.intent.point, dtSeconds);
        return;
    }
    if (actor.intent.type === 'hold') {
        const target = nearestEnemyInWeaponRange(state, actor);
        if (target)
            attackTarget(state, actor, target, dtSeconds);
        return;
    }
    if (actor.intent.type === 'attack-move') {
        const target = nearestEnemy(state, actor, actor.range + 90);
        if (target)
            attackTarget(state, actor, target, dtSeconds);
        else
            moveToward(state, actor, actor.intent.point, dtSeconds);
        return;
    }
    if (actor.intent.type === 'attack') {
        const target = findEntity(state, actor.intent.targetId);
        if (!target || target.hp <= 0) {
            actor.intent = { type: 'idle' };
            return;
        }
        attackTarget(state, actor, target, dtSeconds);
        return;
    }
    if (actor.intent.type === 'sabotage') {
        const link = findPowerLink(state, actor.intent.targetId);
        if (!link) {
            actor.intent = { type: 'idle' };
            return;
        }
        const from = findEntity(state, link.fromId);
        const to = findEntity(state, link.toId);
        if (!from || !to) {
            actor.intent = { type: 'idle' };
            return;
        }
        const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        if (link.disabledMs > 0) {
            actor.gnawMs = undefined;
            const retreat = raiderRetreatPoint(state, actor.owner);
            actor.intent = retreat ? { type: 'move', point: retreat } : { type: 'idle' };
            return;
        }
        if (distance(actor, midpoint) > actor.radius + 18) {
            moveToward(state, actor, midpoint, dtSeconds);
            return;
        }
        // A Weaver gnaws for 2s first (the telegraph); killed mid-gnaw, it cuts nothing.
        if (actor.kind === 'weaver') {
            actor.gnawMs = (actor.gnawMs ?? 0) + dtSeconds * 1000;
            if (actor.gnawMs < BALANCE.gnawMs)
                return;
            actor.gnawMs = undefined;
        }
        // A player Sever on a Hush vein lasts SEVER_MS (x1.6 with Sever Charges).
        const sever = actor.owner === 'player' && link.owner === 'enemy';
        link.disabledMs = sever
            ? SEVER_MS[state.match.difficulty] * (has(state, 'player', 'sever_charges') ? BALANCE.severChargesMult : 1)
            : BALANCE.sabotageMs * (has(state, link.owner, 'hardened_conduits') ? 0.6 : 1);
        if (actor.owner === 'player')
            state.stats.playerSabotages += 1;
        if (actor.owner === 'enemy')
            state.stats.enemySabotages += 1;
        if (link.owner === 'player')
            trigger(state, 'first-link-cut', midpoint);
        if (sever)
            trigger(state, 'first-sever', midpoint);
        recordProductionCut(state, actor, to);
        const retreat = raiderRetreatPoint(state, actor.owner);
        if (actor.owner === 'player' && retreat) {
            triggerPlayerExfilPulse(state, actor, midpoint);
            addAlert(state, 'Raider exfil shield online', midpoint);
        }
        actor.intent = retreat ? { type: 'move', point: retreat } : { type: 'idle' };
        addAlert(state, sabotageAlertText(link, to), midpoint);
    }
    if (actor.intent.type === 'repair-link') {
        const link = findPowerLink(state, actor.intent.targetId);
        if (!link || link.owner !== actor.owner) {
            actor.intent = { type: 'idle' };
            return;
        }
        const from = findEntity(state, link.fromId);
        const to = findEntity(state, link.toId);
        if (!from || !to) {
            actor.intent = { type: 'idle' };
            return;
        }
        const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        if (distance(actor, midpoint) > actor.radius + 16) {
            moveToward(state, actor, midpoint, dtSeconds);
            return;
        }
        const repairRate = actor.owner === 'enemy' ? BALANCE.enemyRepairRateMs * (actor.kind === 'tender' ? BALANCE.tenderRepairMult : 1) : BALANCE.repairRateMs;
        link.disabledMs = Math.max(0, link.disabledMs - repairRate * dtSeconds);
        if (link.disabledMs <= 0) {
            actor.intent = { type: 'idle' };
            if (actor.owner === 'player')
                state.stats.playerRepairs += 1;
            if (actor.owner === 'enemy')
                state.stats.enemyRepairs += 1;
            addAlert(state, 'Power link repaired', midpoint);
        }
    }
}
function spawnUnit(state, producer, unitKind) {
    if (producer.owner === 'neutral')
        return;
    const sign = producer.owner === 'player' ? 1 : -1;
    const point = { x: producer.x + 44 * sign, y: producer.y + 14 };
    const unit = createEntity(newId(state, `${producer.owner}-${unitKind}-${state.timeMs}`), producer.owner, unitKind, point, state.players[producer.owner].researched);
    if (producer.rallyPoint)
        unit.intent = { type: 'attack-move', point: { ...producer.rallyPoint } };
    if (unitKind === 'worker') {
        const node = nearestFreeOre(state, unit);
        if (node)
            unit.intent = { type: 'harvest', targetId: node.id };
    }
    state.entities.push(unit);
    addBloom(state, producer.owner, UNIT_BLOOM[unitKind] ?? 0);
    if (producer.owner === 'player')
        state.stats.playerUnitsBuilt += 1;
    if (producer.owner === 'enemy')
        state.stats.enemyUnitsBuilt += 1;
}
function updateOverload(state, entity, dtMs) {
    if ((entity.overloadCooldownMs ?? 0) > 0)
        entity.overloadCooldownMs = Math.max(0, (entity.overloadCooldownMs ?? 0) - dtMs);
    if ((entity.overloadMs ?? 0) <= 0)
        return;
    const previousOverload = entity.overloadMs ?? 0;
    entity.overloadMs = Math.max(0, previousOverload - dtMs);
    if (previousOverload > 0 && entity.overloadMs <= 0) {
        const link = entity.noStrain ? undefined : connectedPowerLink(state, entity.id);
        if (link) {
            link.disabledMs = Math.max(link.disabledMs, BALANCE.overloadStrainMs);
            const target = findEntity(state, link.toId);
            addAlert(state, 'Overload strained a power link', target ?? { x: entity.x, y: entity.y });
        }
    }
}
function updateCooldowns(entity, dtMs) {
    if ((entity.empCooldownMs ?? 0) > 0)
        entity.empCooldownMs = Math.max(0, (entity.empCooldownMs ?? 0) - dtMs);
}
function updateProduction(state, entity, dtMs) {
    if (!entity.queue)
        return;
    if (NEEDS_POWER.has(entity.kind) && !isPowered(state, entity.id))
        return;
    const speed = (entity.overloadMs ?? 0) > 0 ? BALANCE.overloadSpeedMultiplier : 1;
    entity.queue.remainingMs -= dtMs * speed;
    if (entity.queue.remainingMs > 0)
        return;
    const item = entity.queue;
    entity.queue = undefined;
    if (item.unitKind)
        spawnUnit(state, entity, item.unitKind);
    if (item.purge)
        addBloom(state, entity.owner, -BALANCE.purgeBloom);
    if (item.researchId && entity.owner !== 'neutral') {
        state.players[entity.owner].researched.push(item.researchId);
        applyResearch(state, entity.owner);
        addAlert(state, `${researchName(item.researchId)} complete`, entity);
        // A finished dissection waits for its fork; the scene pauses and shows the codex plate.
        const species = RESEARCH.find((row) => row.id === item.researchId)?.specimens?.[0];
        if (species && entity.owner === 'player') {
            state.match.pendingFork = species;
            trigger(state, 'dissected', entity);
        }
    }
}
// Golden-angle rotation as constants, because src/sim stays free of trig calls.
const GOLDEN_COS = -0.7373688780783197;
const GOLDEN_SIN = 0.6754902942615238;
// The wreck stands up in place as a Hollow attack-moving the Core; a Hollow leaves no husk.
function rise(state, wreck) {
    Object.assign(wreck, createEntity(wreck.id, 'enemy', 'hollow', wreck), { riseMs: undefined, waveId: 'hollows' });
    wreck.intent = waveIntent(state, wreck, 'core');
    trigger(state, 'first-hollow', wreck);
}
function livingCore(state) {
    return state.entities.find((entity) => entity.owner === 'player' && entity.kind === 'core' && entity.hp > 0);
}
export function nextSpawnMs(state, mission) {
    return nextSpawn(mission, state.match.nextWaveMs, state.match.fired, state.match.objectives).atMs;
}
// The climax's weakest mast once its silence has started, so the renderer can flicker its light.
export function climaxMast(state, mission) {
    const spawn = nextSpawn(mission, state.match.nextWaveMs, state.match.fired, state.match.objectives);
    return spawn.target === 'weakest-link' && isSilent(state, mission) ? weakestMast(state) : undefined;
}
// The 8s pre-wave silence; the burrow warning, the drone audio and the seismograph all read it.
export function isSilent(state, mission) {
    return nextSpawnMs(state, mission) - state.timeMs < 8000;
}
function waveIntent(state, unit, target) {
    // Weavers never fight: each goes for the nearest live player link, whatever the wave's target.
    if (unit.kind === 'weaver') {
        const link = nearestEnemyPowerLink(state, unit, Infinity);
        return link ? { type: 'sabotage', targetId: link.id } : { type: 'idle' };
    }
    const goal = target === 'weakest-link' ? weakestMast(state) : target === 'xeno-lab' ? finished(state, 'player', 'xeno-lab')[0] : undefined;
    if (goal)
        return { type: 'attack-move', point: { x: goal.x, y: goal.y } };
    if (target === 'nearest-drone') {
        const drone = state.entities
            .filter((entity) => entity.owner === 'player' && entity.kind === 'worker' && entity.hp > 0)
            .sort((a, b) => distance(unit, a) - distance(unit, b))[0];
        if (drone)
            return { type: 'attack', targetId: drone.id };
    }
    const core = livingCore(state);
    return core ? { type: 'attack-move', point: { x: core.x, y: core.y } } : { type: 'idle' };
}
// Units are dealt round-robin to the burrows, each ring rotated by the golden angle; the wave marches at its slowest member's speed.
function spawnWave(state, units, burrows, target, waveId) {
    let index = 0;
    const marchSpeed = Math.min(...Object.keys(units).map((kind) => ENTITY_STATS[kind].speed));
    for (const [kind, count] of Object.entries(units)) {
        for (let n = 0; n < count; n += 1, index += 1) {
            const burrow = burrows[index % burrows.length];
            const ring = Math.floor(index / burrows.length);
            let dx = 1;
            let dy = 0;
            for (let r = 0; r < ring; r += 1)
                [dx, dy] = [dx * GOLDEN_COS - dy * GOLDEN_SIN, dx * GOLDEN_SIN + dy * GOLDEN_COS];
            const reach = burrow.radius + 12 + 10 * Math.sqrt(ring);
            const unit = createEntity(newId(state, `hush-${kind}`), 'enemy', kind, {
                x: Math.max(20, Math.min(state.map.width - 20, burrow.x + dx * reach)),
                y: Math.max(20, Math.min(state.map.height - 20, burrow.y + dy * reach)),
            });
            unit.intent = waveIntent(state, unit, target);
            unit.waveId = waveId;
            unit.marchSpeed = marchSpeed;
            state.entities.push(unit);
            if (kind === 'weaver')
                trigger(state, 'first-weaver', unit);
            if (kind === 'mourner' && burrow.kind === 'gestation-pit')
                trigger(state, 'first-mourner', burrow);
        }
    }
}
// Grief (design 10): points x difficulty x retry x Bloom, at once from the burrow nearest the dead structure, never trimmed by the cap.
// Tracked in fired as grief-<id>, so each placed structure calls it once.
// Mission-placed ids only, so a regrown Cyst never calls Grief again.
function griefWave(state, mission, dead) {
    const id = `grief-${dead.id}`;
    const burrow = state.entities.filter((entity) => entity.kind === 'burrow').sort((a, b) => distance(a, dead) - distance(b, dead))[0];
    const placed = mission.start.entities.some(([owner, kind], index) => `${owner}-${kind}-${index}` === dead.id);
    const points = GRIEF[dead.kind];
    if (!points || !placed || !burrow || state.match.fired.includes(id))
        return;
    state.match.fired.push(id);
    const budget = waveBudget({ base: points, perMin: 0, disturbance: 0 }, 0, 0, state.match.difficulty, state.match.retries, state.players.player.bloom);
    spawnWave(state, spendBudget(budget, mission.waves.roster, Infinity), [burrow], 'core', `${id}@${state.timeMs}`);
    addAlert(state, `Movement under the ${burrow.y < mission.map.height / 2 ? 'north' : 'south'} burrow`, burrow);
}
// The Hush cap counts living Hush units plus wrecks (Hollows are units); held brood doesn't count until it comes out.
const hushCount = (state) => state.entities.filter((entity) => entity.owner === 'enemy' && (entity.speed > 0 || entity.kind === 'wreck') && entity.hp > 0).length;
// Mission-placed Hush producers (Brood Cysts in M4, plus the Gestation Pit in M5), living or dead, by their placement ids.
function placedProducers(mission) {
    return mission.start.entities.flatMap(([owner, kind], index) => (owner === 'enemy' && PRODUCES[kind] ? [{ id: `${owner}-${kind}-${index}`, kind }] : []));
}
// The living producer at a placed site: the placed one, or the Cyst the Tenders regrew there.
function producerAt(state, id) {
    return state.entities.find((entity) => (entity.id === id || entity.site === id) && entity.hp > 0);
}
// Design 10 (M4-M5): an interval wave is dealt round-robin to every placed producer that makes each unit. A living, fed
// producer spawns its share; a living, starved one holds it and swells until its vein is restored; a dead one's share is dropped.
function dealWave(state, units, producers, target, waveId) {
    const shares = new Map();
    let turn = 0;
    for (const [kind, count] of Object.entries(units)) {
        const makers = producers.filter((producer) => PRODUCES[producer.kind]?.includes(kind));
        for (let n = 0; n < count && makers.length > 0; n += 1) {
            const id = makers[turn++ % makers.length].id;
            const share = shares.get(id) ?? {};
            share[kind] = (share[kind] ?? 0) + 1;
            shares.set(id, share);
        }
    }
    for (const [id, share] of shares) {
        // A Gestation Pit opens at 6:00; until then, like a dead producer, its share is dropped.
        const producer = producerAt(state, id);
        if (!producer || (producer.kind === 'gestation-pit' && state.timeMs < BALANCE.pitOpensMs))
            continue;
        if (isPowered(state, producer.id)) {
            spawnWave(state, share, [producer], target, waveId);
            continue;
        }
        producer.held = [...(producer.held ?? []), share];
        trigger(state, 'first-swell', producer);
    }
}
function runWaves(state, mission) {
    const burrows = state.entities.filter((entity) => entity.kind === 'burrow');
    if (burrows.length === 0)
        return;
    const producers = placedProducers(mission);
    let spawn = nextSpawn(mission, state.match.nextWaveMs, state.match.fired, state.match.objectives);
    // The silence: one pointed alert per spawning burrow (or fed producer, for a dealt wave), 8s before every wave.
    const warnId = `warn@${spawn.atMs}`;
    if (spawn.atMs - state.timeMs < 8000 && !state.match.fired.includes(warnId)) {
        state.match.fired.push(warnId);
        if (!spawn.fireId && producers.length > 0) {
            producers.forEach(({ id, kind }, i) => {
                const producer = producerAt(state, id);
                if (producer && isPowered(state, producer.id) && !(producer.kind === 'gestation-pit' && spawn.atMs < BALANCE.pitOpensMs))
                    addAlert(state, `Movement in ${labelForKind(kind, 'enemy')} ${i + 1}`, producer);
            });
        }
        else {
            // ponytail: every burrow spawns every wave (round-robin), so every burrow is warned
            for (const burrow of burrows)
                addAlert(state, `Movement under the ${burrow.y < mission.map.height / 2 ? 'north' : 'south'} burrow`, burrow);
        }
    }
    while (state.timeMs >= spawn.atMs) {
        const units = waveUnits(mission, spawn, state.players.player.mined, state.match.difficulty, state.match.retries, mission.waves.cap - hushCount(state), state.players.player.bloom);
        const firstWave = !spawn.fireId && spawn.atMs === mission.waves.firstMs;
        const target = spawn.target ?? (firstWave ? mission.waves.firstTarget : undefined) ?? mission.waves.target ?? 'core';
        // Grief, the Tide and climaxes always rise from the burrows, where veins don't matter.
        if (!spawn.fireId && producers.length > 0)
            dealWave(state, units, producers, target, `wave@${spawn.atMs}`);
        else
            spawnWave(state, units, burrows, target, `wave@${spawn.atMs}`);
        afterSpawn(mission, spawn, state.match);
        if (spawn.fireId)
            trigger(state, spawn.fireId, burrows[0]);
        spawn = nextSpawn(mission, state.match.nextWaveMs, state.match.fired, state.match.objectives);
    }
    // A starved producer's hold all comes out the moment its vein is restored, trimmed by the cap like an interval wave.
    for (const producer of state.entities) {
        if (!producer.held || producer.hp <= 0 || !isPowered(state, producer.id))
            continue;
        const merged = {};
        for (const roster of producer.held)
            for (const [kind, n] of Object.entries(roster))
                merged[kind] = (merged[kind] ?? 0) + n;
        producer.held = undefined;
        spawnWave(state, capRoster(merged, mission.waves.cap - hushCount(state)), [producer], 'core', `held-${producer.id}@${state.timeMs}`);
    }
    // Straggler valve (design 8): every 45s, a species the objectives still need but the map can't supply
    // (husks, hauls in flight, living) gets one more at the burrow nearest the Core, so specimens never softlock.
    if (state.timeMs % BALANCE.stragglerMs === 0) {
        const core = livingCore(state);
        for (const species of Object.keys(FORKS)) {
            const supply = state.entities.filter((entity) => entity.hp > 0 && ((entity.kind === 'husk' && entity.sourceKind === species) || (entity.owner === 'enemy' && entity.kind === species) || entity.carry?.sourceKind === species)).length;
            if (!core || supply >= specimensNeeded(state, mission, species))
                continue;
            const burrow = [...burrows].sort((a, b) => distance(a, core) - distance(b, core))[0];
            const unit = createEntity(newId(state, `hush-${species}`), 'enemy', species, { x: burrow.x - burrow.radius - 12, y: burrow.y });
            unit.waveId = `straggler@${state.timeMs}`;
            unit.intent = waveIntent(state, unit, 'core');
            state.entities.push(unit);
        }
    }
    // A wave marches together until any member is within 250px of a player entity.
    const players = state.entities.filter((entity) => entity.owner === 'player');
    const contact = new Set(state.entities.filter((entity) => entity.marchSpeed !== undefined && players.some((player) => distance(entity, player) <= 250)).map((entity) => entity.waveId));
    for (const entity of state.entities)
        if (contact.has(entity.waveId))
            entity.marchSpeed = undefined;
    // "Seen": the first Stilt within 235px of anything of yours (GameScene.visionRadius for a unit).
    // ponytail: the sim has no fog; read the fog grid instead if fog moves into the sim (v2)
    if (!state.match.fired.includes('first-stilt')) {
        const stilt = state.entities.find((entity) => entity.owner === 'enemy' && entity.kind === 'stilt' && entity.hp > 0 && players.some((player) => distance(entity, player) <= 235));
        if (stilt)
            trigger(state, 'first-stilt', stilt);
    }
    // The Cradle's ribs open the first time no vein feeds it.
    const cradle = state.entities.find((entity) => entity.kind === 'cradle' && entity.hp > 0);
    if (cradle && !isPowered(state, cradle.id))
        trigger(state, 'ribs-open', cradle);
    // A wave whose target died falls back to the core. The AI sets intents directly, never through issueSmartCommand.
    // Mission-placed Hush (no waveId) stay idle where they stand.
    for (const entity of state.entities) {
        if (entity.owner === 'enemy' && entity.speed > 0 && entity.intent.type === 'idle' && entity.waveId)
            entity.intent = waveIntent(state, entity, 'core');
    }
}
// Tenders (design 6): each goes for the nearest cut vein (4x the enemy repair rate, in updateUnitIntent). The Cradle, else a
// base Spire (one that feeds veins), regrows a missing Tender every 60s, up to 2. While the Cradle and a Tender live, a lost
// Cyst regrows at its placed site every 90s, fed again by the nearest living Spire within 320px.
// ponytail: one Tender pool for the whole map, and the regrowth needs no Tender walk; per-base pools in v2
function runTenders(state, mission) {
    const tenders = state.entities.filter((entity) => entity.owner === 'enemy' && entity.kind === 'tender' && entity.hp > 0);
    const cut = state.powerLinks
        .filter((link) => link.owner === 'enemy' && link.disabledMs > 0)
        .map((link) => ({ link, point: linkMidpoint(state, link) }))
        .filter((item) => Boolean(item.point));
    for (const tender of tenders) {
        if (tender.intent.type === 'repair-link')
            continue;
        const nearest = [...cut].sort((a, b) => distance(tender, a.point) - distance(tender, b.point))[0];
        if (nearest)
            tender.intent = { type: 'repair-link', targetId: nearest.link.id };
    }
    const cradle = state.entities.find((entity) => entity.owner === 'enemy' && entity.kind === 'cradle' && entity.hp > 0);
    if (cradle && tenders.length > 0 && state.timeMs % BALANCE.cystRegrowEveryMs === 0) {
        const lost = placedProducers(mission).find(({ id, kind }) => kind === 'brood-cyst' && !producerAt(state, id));
        if (lost) {
            const [, , x, y] = mission.start.entities[Number(lost.id.split('-').at(-1))];
            const cyst = createEntity(newId(state, 'hush-brood-cyst'), 'enemy', 'brood-cyst', { x, y });
            Object.assign(cyst, { site: lost.id, hp: cyst.maxHp * 0.1, buildMs: BALANCE.cystRegrowMs });
            state.entities.push(cyst);
            const spire = state.entities
                .filter((entity) => entity.owner === 'enemy' && entity.kind === 'tendril-spire' && entity.hp > 0 && distance(entity, cyst) <= 320)
                .sort((a, b) => distance(a, cyst) - distance(b, cyst))[0];
            if (spire)
                state.powerLinks.push({ id: `enemy-link-${cyst.id}`, owner: 'enemy', fromId: spire.id, toId: cyst.id, disabledMs: 0 });
        }
    }
    if (tenders.length >= BALANCE.tenders || state.timeMs % BALANCE.tenderEveryMs !== 0)
        return;
    const home = cradle ?? state.entities.find((entity) => entity.owner === 'enemy' && entity.kind === 'tendril-spire' && entity.hp > 0 && state.powerLinks.some((link) => link.fromId === entity.id));
    if (home)
        state.entities.push(createEntity(newId(state, 'hush-tender'), 'enemy', 'tender', { x: home.x, y: home.y + home.radius + 14 }));
}
// Where a player link is in its 20s corrosion cycle (design 11, M4+): 0-1000ms is the lime flicker and the 2s drop lands
// at 1000. Undefined when its midpoint is off Veinfield. Each link's phase is offset by a hash of its id.
export function corrosionMs(state, link) {
    if (link.owner !== 'player' || missionNo(state) < 4)
        return undefined;
    const midpoint = linkMidpoint(state, link);
    if (!midpoint || !onVeinfield(state, midpoint))
        return undefined;
    const phase = [...link.id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % BALANCE.corrosionEveryMs, 0);
    return (state.timeMs + phase) % BALANCE.corrosionEveryMs;
}
// Within a living Hush Veinfield source's radius (a Spire's 200px). There's no creep grid.
export function onVeinfield(state, point) {
    return state.entities.some((entity) => entity.owner === 'enemy' && entity.hp > 0 && VEINFIELD[entity.kind] !== undefined && distance(entity, point) <= VEINFIELD[entity.kind]);
}
// A Chorus listener freezes after its 1s telegraph.
const listening = (entity) => (entity.listenMs ?? 0) > 0 && entity.listenMs <= BALANCE.listenMs - BALANCE.listenTelegraphMs;
// Murmur (Bloom 25+): a fake alert with no point, naming Drone n+1, at most every 90s.
// Chorus (Bloom 50+): every 40s the living hybrid with the lowest id listens (a pointed alert, then the freeze).
function runBloom(state) {
    const bloom = state.players.player.bloom;
    if (bloom >= 25 && state.timeMs - (state.match.lastMurmurMs ?? -Infinity) >= BALANCE.murmurMs) {
        state.match.lastMurmurMs = state.timeMs;
        const id = `murmur.${1 + (Math.floor(state.timeMs / BALANCE.murmurMs) % 6) + (bloom >= 50 ? 6 : 0)}`;
        const n = `${state.entities.filter((entity) => entity.owner === 'player' && entity.kind === 'worker' && entity.hp > 0).length + 1}`;
        addAlert(state, `${(TEXT[id]?.speaker ?? '').replace('{n}', n)}: ${text(id).replace('{n}', n)}`, undefined, id);
    }
    if (bloom < 50 || state.timeMs % BALANCE.listenEveryMs !== 0)
        return;
    const hybrid = state.entities
        .filter((entity) => entity.owner === 'player' && entity.hp > 0 && HYBRID_OF[entity.kind])
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    if (!hybrid)
        return;
    hybrid.listenMs = BALANCE.listenMs;
    addAlert(state, `${labelForKind(hybrid.kind, 'player')} (listening)`, hybrid);
}
// Specimens of a species the open specimen and fork objectives still need beyond those held.
function specimensNeeded(state, mission, species) {
    const open = (id) => !state.match.objectives?.find((live) => live.id === id)?.done;
    const dissection = RESEARCH.find((row) => row.specimens?.[0] === species)?.specimens?.[1] ?? 0;
    const need = Math.max(0, ...mission.objectives.map((objective) => !open(objective.id) || !('species' in objective) || objective.species !== species
        ? 0
        : objective.kind === 'specimens'
            ? objective.count
            : dissected(state, 'player', species)
                ? 0
                : dissection));
    return Math.max(0, need - (state.players.player.specimens[species] ?? 0));
}
// Fires a beat or hint once: a pointed alert, plus its log id (GameScene opens the log panel when one appears in fired).
function fireBeat(state, item, at) {
    if (state.match.fired.includes(item.id))
        return;
    state.match.fired.push(item.id);
    const point = item.point ? { x: item.point[0], y: item.point[1] } : (at ?? livingCore(state) ?? { x: 0, y: 0 });
    addAlert(state, text(item.id), point, item.id);
    if (item.log)
        state.match.fired.push(item.log);
}
// A named sim event happened once, at a point: fire every beat and hint waiting on it, pointed there.
function trigger(state, event, at) {
    const mission = state.match.missionId ? MISSIONS[state.match.missionId] : undefined;
    if (!mission || state.match.fired.includes(event))
        return;
    state.match.fired.push(event);
    for (const item of [...mission.story, ...mission.hints])
        if (item.on === event)
            fireBeat(state, item, { x: at.x, y: at.y });
}
function runScript(state, mission) {
    for (const item of [...mission.story, ...mission.hints]) {
        if (typeof item.on === 'string' || state.match.fired.includes(item.id))
            continue;
        if ('atMs' in item.on ? state.timeMs >= item.on.atMs : walkedInto(state, item.on.enter))
            fireBeat(state, item);
    }
}
// Any player unit within 40px of the point (a story zone such as the Kepler bunker).
function walkedInto(state, [x, y]) {
    return state.entities.some((entity) => entity.owner === 'player' && entity.speed > 0 && distance(entity, { x, y }) <= 40);
}
// Objectives latch once done. Win when all are done; lose when a survive timer expires with one undone
// (the lift leaves without the ore) or when a loseIfLost kind dies.
export function evaluateObjectives(state, mission, dtMs = 50) {
    if (state.winner)
        return;
    const progress = (id) => state.match.objectives?.find((objective) => objective.id === id);
    // A kind counts as lost only once the mission placed it or its build objective was done (an unbuilt Lab can't die).
    const had = (kind) => mission.start.entities.some(([owner, placed]) => owner === 'player' && placed === kind) ||
        mission.objectives.some((objective) => objective.kind === 'build' && objective.unit === kind && progress(objective.id)?.done);
    if (mission.loseIfLost.some((kind) => had(kind) && !state.entities.some((entity) => entity.owner === 'player' && entity.kind === kind && entity.hp > 0))) {
        state.winner = 'enemy';
        finishMatch(state, 'core-destroyed');
        return;
    }
    let expired = false;
    for (const objective of mission.objectives) {
        const live = progress(objective.id);
        if (!live || live.done)
            continue;
        if (objective.kind === 'survive') {
            const from = objective.after ? progress(objective.after)?.startedMs : 0;
            if (from === undefined)
                continue;
            live.progressMs = Math.min(objective.ms, state.timeMs - from);
            if (live.progressMs >= objective.ms)
                live.done = expired = true;
        }
        if (objective.kind === 'build')
            live.done = finished(state, 'player', objective.unit).length > 0;
        if (objective.kind === 'specimens')
            live.done = (state.players.player.specimens[objective.species] ?? 0) >= objective.count;
        if (objective.kind === 'destroy') {
            live.done = !state.entities.some((entity) => entity.owner === 'enemy' && entity.kind === objective.unit && entity.hp > 0);
            // The first target below half arms the objective's climax (M5: the Cradle at 50%), event `<id>-half`.
            const half = state.entities.find((entity) => entity.owner === 'enemy' && entity.kind === objective.unit && entity.hp > 0 && entity.hp < entity.maxHp / 2);
            if (half && live.startedMs === undefined) {
                live.startedMs = state.timeMs;
                trigger(state, `${objective.id}-half`, half);
            }
        }
        // The pick arms the fork's climax (startedMs).
        if (objective.kind === 'fork' && forked(state, 'player', objective.species)) {
            live.done = true;
            live.startedMs = state.timeMs;
        }
        // Held time grows while `count` are powered at once and drains at 2x (never below 0) during a gap.
        if (objective.kind === 'power') {
            const held = state.entities.filter((entity) => entity.kind === objective.of && isPowered(state, entity.id)).length >= objective.count;
            live.progressMs = Math.max(0, live.progressMs + (held ? dtMs : -2 * dtMs));
            if (held && live.progressMs >= (objective.armMs ?? 0))
                live.startedMs ??= state.timeMs;
            live.done = live.progressMs >= objective.ms;
        }
    }
    const allDone = () => mission.objectives.every((objective) => objective.optional || progress(objective.id)?.done);
    if (!expired && !allDone())
        return;
    for (const objective of mission.objectives) {
        const live = progress(objective.id);
        if (live && objective.kind === 'cargo')
            live.done ||= state.players.player.ore >= objective.amount[state.match.difficulty];
    }
    state.winner = allDone() ? 'player' : 'enemy';
    finishMatch(state, 'timer');
}
export function tickSimulation(source, dtMs) {
    const state = cloneState(source);
    if (state.match.phase === 'complete')
        return state;
    state.timeMs += dtMs;
    state.shots = [];
    const dtSeconds = dtMs / 1000;
    const mission = state.match.missionId ? MISSIONS[state.match.missionId] : undefined;
    for (const alert of state.alerts)
        alert.ageMs += dtMs;
    state.alerts = state.alerts.filter((alert) => alert.ageMs < 9000);
    if (playerGridIsDown(state))
        state.stats.playerGridDownMs += dtMs;
    if (enemyGridIsDown(state))
        state.stats.enemyGridDownMs += dtMs;
    // Hardline Grid: cut links recover 2x faster.
    for (const link of state.powerLinks)
        link.disabledMs = Math.max(0, link.disabledMs - dtMs * (has(state, link.owner, 'hardline_grid') ? 2 : 1));
    // Corrosion: the drop lands as the 1s flicker ends (x0.6 with Hardened Conduits).
    for (const link of state.powerLinks) {
        const ms = corrosionMs(state, link);
        if (ms !== undefined && ms >= BALANCE.corrosionFlickerMs && ms - dtMs < BALANCE.corrosionFlickerMs) {
            link.disabledMs = Math.max(link.disabledMs, BALANCE.corrosionMs * (has(state, 'player', 'hardened_conduits') ? 0.6 : 1));
        }
    }
    const sutures = has(state, 'player', 'marrow_sutures');
    for (const entity of state.entities) {
        if (entity.decayMs !== undefined && (entity.decayMs -= dtMs) <= 0)
            entity.hp = 0;
        if (entity.riseMs !== undefined && (entity.riseMs -= dtMs) <= 0)
            rise(state, entity);
        if (entity.listenMs !== undefined)
            entity.listenMs = entity.listenMs > dtMs ? entity.listenMs - dtMs : undefined;
        if (entity.kind === 'grafted-trooper' && entity.hp > 0)
            entity.hp = Math.min(entity.maxHp, entity.hp + (2 * dtMs) / 1000);
        if (entity.kind === 'chimera' && entity.hp > 0 && onVeinfield(state, entity))
            entity.hp = Math.min(entity.maxHp, entity.hp + (BALANCE.chimeraRegen * dtMs) / 1000);
        // Marrow Sutures: player units regenerate 1.5 hp/s on Veinfield, hybrids 3.
        if (sutures && entity.owner === 'player' && entity.speed > 0 && entity.hp > 0 && onVeinfield(state, entity)) {
            entity.hp = Math.min(entity.maxHp, entity.hp + ((HYBRID_OF[entity.kind] ? 3 : 1.5) * dtMs) / 1000);
        }
        updateCooldowns(entity, dtMs);
        updateConstruction(state, entity, dtMs);
        updateOverload(state, entity, dtMs);
        updateProduction(state, entity, dtMs);
    }
    for (const entity of state.entities) {
        if ((entity.speed > 0 || entity.damage > 0) && entity.hp > 0 && !listening(entity))
            updateUnitIntent(state, entity, dtSeconds);
    }
    separate(state);
    const husks = [];
    for (const entity of state.entities) {
        if (entity.hp > 0 || entity.kind === 'ore' || entity.owner === 'neutral')
            continue;
        if (entity.owner === 'player')
            state.stats.playerUnitsLost += 1;
        if (entity.owner === 'enemy')
            state.stats.enemyUnitsLost += 1;
        addAlert(state, destroyedAlertText(entity), entity);
        // A Hush body with marrow in it stays behind as a neutral husk.
        if (entity.owner === 'enemy' && HUSK_MARROW[entity.kind] !== undefined) {
            const husk = createEntity(newId(state, 'husk'), 'neutral', 'husk', entity);
            husk.sourceKind = entity.kind;
            husk.decayMs = mission && specimensNeeded(state, mission, entity.kind) > 0 ? BALANCE.neededHuskDecayMs : BALANCE.huskDecayMs;
            husks.push(husk);
            trigger(state, 'first-husk', husk);
        }
        // A person who dies on Veinfield leaves a twitching enemy wreck that stands up as a Hollow.
        if (entity.owner === 'player' && HOLLOW_KINDS.includes(entity.kind) && onVeinfield(state, entity) && !has(state, 'player', 'cryo_sterilization')) {
            const wreck = createEntity(newId(state, 'wreck'), 'enemy', 'wreck', entity);
            wreck.riseMs = BALANCE.riseMs;
            husks.push(wreck);
            trigger(state, 'first-wreck', wreck);
        }
        if (mission)
            griefWave(state, mission, entity);
        if (entity.kind === 'cradle')
            trigger(state, 'cradle-fold', entity);
        // The first death of a climax's unlessKilled kind calls it off, and its warning beat with it (M4: a dead Cyst cancels the Tide).
        for (const climax of mission?.climaxes ?? []) {
            if (entity.owner !== 'enemy' || climax.unlessKilled !== entity.kind)
                continue;
            for (const id of [...climax.mults.map((_, i) => `${climax.id}#${i}`), ...(climax.beat ? [climax.beat] : [])])
                if (!state.match.fired.includes(id))
                    state.match.fired.push(id);
        }
    }
    state.entities = state.entities.filter((entity) => (entity.kind === 'ore' ? (entity.amount ?? 1) > 0 : entity.hp > 0)).concat(husks);
    // At most 40 husks; the oldest (first in the list) goes first.
    let extra = state.entities.filter((entity) => entity.kind === 'husk').length - BALANCE.huskCap;
    if (extra > 0)
        state.entities = state.entities.filter((entity) => entity.kind !== 'husk' || extra-- <= 0);
    if (!mission)
        return state;
    runBloom(state);
    runTenders(state, mission);
    runWaves(state, mission);
    runScript(state, mission);
    evaluateObjectives(state, mission, dtMs);
    return state;
}
export function entityIsPowered(state, entityId) {
    const entity = findEntity(state, entityId);
    return (entity !== undefined && !NEEDS_POWER.has(entity.kind)) || isPowered(state, entityId);
}
