import { entityIsPowered as poweredById } from './simulation.js';
import { BALANCE } from './constants.js';
function targetForLink(state, link) {
    return state.entities.find((entity) => entity.id === link.toId);
}
// One power rule for sim and visuals (unfinished buildings are unpowered).
function entityIsPowered(state, entity) {
    return poweredById(state, entity.id);
}
function threatRoleFor(kind) {
    if (kind === 'core')
        return 'command';
    if (kind === 'barracks' || kind === 'factory')
        return 'production';
    if (kind === 'power-node')
        return 'power';
    if (kind === 'turret')
        return 'defense';
    if (kind === 'ore')
        return 'resource';
    if (kind === 'worker')
        return 'worker';
    return 'combat';
}
export function powerLinkVisualState(state, link) {
    const target = targetForLink(state, link);
    const repairerCount = state.entities.filter((entity) => entity.intent.type === 'repair-link' && entity.intent.targetId === link.id).length;
    return {
        owner: link.owner,
        status: link.disabledMs > 0 && repairerCount > 0 ? 'repairing' : link.disabledMs > 0 ? 'offline' : 'live',
        targetKind: target?.kind,
        remainingPct: link.disabledMs > 0 ? Number(Math.min(1, link.disabledMs / BALANCE.sabotageMs).toFixed(2)) : 0,
        isProductionLink: target?.kind === 'barracks' || target?.kind === 'factory',
        repairerCount,
    };
}
export function exploitWindowState(state) {
    const link = state.powerLinks
        .filter((item) => item.disabledMs > 0)
        .sort((a, b) => b.disabledMs - a.disabledMs)
        .find((item) => {
        const target = targetForLink(state, item);
        return target?.kind === 'barracks' || target?.kind === 'factory';
    });
    if (!link)
        return { active: false };
    const target = targetForLink(state, link);
    return {
        active: true,
        owner: link.owner,
        linkId: link.id,
        targetKind: target?.kind,
        remainingMs: Math.round(link.disabledMs),
        remainingPct: Number(Math.min(1, link.disabledMs / BALANCE.empSpikeMs).toFixed(2)),
    };
}
export function entityVisualState(state, entity) {
    const powered = entityIsPowered(state, entity);
    const productionPct = entity.queue ? Number((1 - entity.queue.remainingMs / entity.queue.totalMs).toFixed(2)) : 0;
    const moving = entity.intent.type === 'move' || entity.intent.type === 'attack-move' || entity.intent.type === 'sabotage' || entity.intent.type === 'repair-link';
    let activity = 'idle';
    if (entity.kind === 'ore')
        activity = 'resource';
    else if ((entity.overloadMs ?? 0) > 0)
        activity = 'overloaded';
    else if ((entity.kind === 'barracks' || entity.kind === 'factory') && !powered)
        activity = 'stalled';
    else if (entity.queue && !powered)
        activity = 'stalled';
    else if (entity.queue)
        activity = 'producing';
    else if (moving)
        activity = 'moving';
    else if (entity.damage > 0)
        activity = 'combat-ready';
    return {
        powered,
        activity,
        owner: entity.owner,
        kind: entity.kind,
        productionPct,
        threatRole: threatRoleFor(entity.kind),
    };
}
