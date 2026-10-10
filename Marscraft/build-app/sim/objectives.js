import { UNIT_COST } from './constants.js';
function labelForKind(kind) {
    return kind
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
function hasSelectedWorker(state) {
    return (state.match.objectiveProgress.selectedWorker ||
        state.selectedIds.some((id) => state.entities.some((entity) => entity.id === id && entity.owner === 'player' && entity.kind === 'worker')));
}
function hasQueuedOrBuiltExtraRaider(state) {
    return state.entities.some((entity) => entity.owner === 'player' &&
        ((entity.kind === 'barracks' && entity.queue?.unitKind === 'raider') || (entity.kind === 'raider' && entity.id !== 'player-raider-1')));
}
export function objectiveSteps(state) {
    const cutEnemyLink = state.stats.playerSabotages > 0;
    const selectWorker = cutEnemyLink || hasSelectedWorker(state);
    const queueRaider = cutEnemyLink || hasQueuedOrBuiltExtraRaider(state);
    const exploitDowntime = state.stats.enemyGridDownMs >= 5000;
    const done = [selectWorker, queueRaider, cutEnemyLink, exploitDowntime];
    const activeIndex = done.findIndex((item) => !item);
    return [
        {
            id: 'select-worker',
            label: 'Select worker',
            done: selectWorker,
            active: activeIndex === 0,
        },
        {
            id: 'queue-raider',
            label: 'Queue raider',
            done: queueRaider,
            active: activeIndex === 1,
        },
        {
            id: 'cut-enemy-link',
            label: 'Choose target',
            done: cutEnemyLink,
            active: activeIndex === 2,
        },
        {
            id: 'exploit-downtime',
            label: 'Push during outage',
            done: exploitDowntime,
            active: activeIndex === 3,
        },
    ];
}
function firstExistingEntity(state, ids) {
    const id = ids.find((candidate) => state.entities.some((entity) => entity.id === candidate));
    return id ? { type: 'entity', id } : undefined;
}
function selectedPlayerKind(state, kind) {
    return state.selectedIds.some((id) => state.entities.some((entity) => entity.id === id && entity.owner === 'player' && entity.kind === kind));
}
function buildingHasPower(state, buildingId) {
    return state.powerLinks.some((link) => link.toId === buildingId && link.disabledMs <= 0);
}
function playerRaiderTarget(state) {
    return firstExistingEntity(state, state.entities
        .filter((entity) => entity.owner === 'player' && entity.kind === 'raider')
        .map((entity) => entity.id));
}
function enemyProductionLink(state, preferDisabled) {
    const priority = ['enemy-link-barracks', 'enemy-link-factory'];
    const links = state.powerLinks.filter((link) => link.owner === 'enemy' && (link.toId.includes('barracks') || link.toId.includes('factory')));
    const disabled = preferDisabled ? links.find((link) => link.disabledMs > 0) : undefined;
    const preferred = priority.map((id) => links.find((link) => link.id === id)).find(Boolean);
    const link = disabled ?? preferred ?? links[0];
    return link ? { type: 'power-link', id: link.id } : undefined;
}
function linkTargetKind(state, linkId) {
    const link = state.powerLinks.find((item) => item.id === linkId);
    const target = link ? state.entities.find((entity) => entity.id === link.toId) : undefined;
    return target?.kind;
}
function disabledEnemyProductionLink(state) {
    return state.powerLinks.find((link) => {
        if (link.owner !== 'enemy' || link.disabledMs <= 0)
            return false;
        const targetKind = linkTargetKind(state, link.id);
        return targetKind === 'barracks' || targetKind === 'factory';
    });
}
function selectedMobileCombat(state) {
    return state.selectedIds.some((id) => {
        const entity = state.entities.find((item) => item.id === id);
        return Boolean(entity && entity.owner === 'player' && entity.speed > 0 && entity.kind !== 'worker');
    });
}
function offlineProductionFamily(kind) {
    return kind === 'factory' ? 'armor' : 'infantry';
}
export function productionTargetHints(state) {
    return state.powerLinks
        .filter((link) => link.owner === 'enemy')
        .map((link) => ({ link, targetKind: linkTargetKind(state, link.id) }))
        .filter((item) => item.targetKind === 'barracks' || item.targetKind === 'factory')
        .sort((a, b) => (a.targetKind === b.targetKind ? 0 : a.targetKind === 'barracks' ? -1 : 1))
        .map(({ link, targetKind }) => ({
        linkId: link.id,
        label: targetKind === 'factory' ? 'Cut armor' : 'Cut infantry',
        detail: targetKind === 'factory' ? 'stalls heavy units' : 'stalls infantry and raiders',
    }));
}
export function postSabotageChoices(state) {
    if (!disabledEnemyProductionLink(state))
        return [];
    return [
        { label: 'Push army', detail: 'convert downtime into core or production damage' },
        { label: 'Snipe repair crew', detail: 'extend the outage by killing workers' },
        { label: 'Exfil raider', detail: 'save the tool for the next cut' },
    ];
}
export function objectiveCue(state) {
    if (state.match.phase === 'complete')
        return undefined;
    const steps = objectiveSteps(state);
    const step = steps.find((item) => item.active);
    if (!step)
        return undefined;
    const selectedRaider = selectedPlayerKind(state, 'raider');
    if (selectedRaider && state.stats.playerSabotages === 0) {
        const target = enemyProductionLink(state, false);
        const cutStep = steps.find((item) => item.id === 'cut-enemy-link') ?? step;
        return target ? { label: 'Cut enemy grid', target, step: cutStep } : undefined;
    }
    const target = step.id === 'select-worker'
        ? firstExistingEntity(state, ['player-worker-1', 'player-worker-2'])
        : step.id === 'queue-raider'
            ? firstExistingEntity(state, ['player-barracks'])
            : step.id === 'cut-enemy-link'
                ? selectedRaider
                    ? enemyProductionLink(state, false)
                    : playerRaiderTarget(state) ?? enemyProductionLink(state, false)
                : enemyProductionLink(state, true);
    const label = step.id === 'cut-enemy-link' && !selectedRaider && target?.type === 'entity' ? 'Select raider' : step.label;
    return target ? { label, target, step } : undefined;
}
export function objectiveCommandCue(state) {
    if (state.match.phase === 'complete')
        return undefined;
    const disabledLink = disabledEnemyProductionLink(state);
    if (disabledLink && selectedMobileCombat(state)) {
        return {
            command: 'attack-move',
            label: `Attack-move now: ${offlineProductionFamily(linkTargetKind(state, disabledLink.id))} production is offline`,
        };
    }
    const step = objectiveSteps(state).find((item) => item.active);
    if (step?.id !== 'queue-raider')
        return undefined;
    const barracks = state.selectedIds
        .map((id) => state.entities.find((entity) => entity.id === id))
        .find((entity) => entity?.owner === 'player' && entity.kind === 'barracks');
    if (!barracks || barracks.queue || !buildingHasPower(state, barracks.id) || state.players.player.ore < UNIT_COST.raider)
        return undefined;
    return { command: 'produce-raider', label: 'Click Raider or press E' };
}
export function sabotageRouteCue(state) {
    if (state.match.phase === 'complete')
        return undefined;
    const selectedIds = new Set(state.selectedIds);
    const raiders = state.entities.filter((entity) => entity.owner === 'player' && entity.kind === 'raider' && entity.intent.type === 'sabotage');
    const actor = raiders.find((entity) => selectedIds.has(entity.id)) ?? raiders[0];
    if (!actor)
        return undefined;
    const intent = actor.intent;
    if (intent.type !== 'sabotage')
        return undefined;
    const link = state.powerLinks.find((item) => item.id === intent.targetId);
    if (!link)
        return undefined;
    const target = state.entities.find((entity) => entity.id === link.toId);
    const owner = link.owner === 'player' ? 'Player' : 'Enemy';
    const asset = target ? labelForKind(target.kind) : 'Power Link';
    return {
        actorId: actor.id,
        label: 'Raider armed',
        detail: `Moving to cut ${owner} ${asset} power link`,
        target: { type: 'power-link', id: link.id },
    };
}
export function markObjectiveSelection(state) {
    const selectedWorker = hasSelectedWorker(state);
    if (selectedWorker === state.match.objectiveProgress.selectedWorker)
        return state;
    return {
        ...state,
        match: {
            ...state.match,
            objectiveProgress: {
                ...state.match.objectiveProgress,
                selectedWorker,
            },
        },
    };
}
