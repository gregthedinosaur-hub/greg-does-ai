import { createEntity, linkMasts } from './simulation.js';
import { MISSIONS, missionEndMs } from './campaign.js';
function entity(id, owner, kind, x, y) {
    return createEntity(id, owner, kind, { x, y });
}
export function createInitialState() {
    return createInitialStateWithOptions();
}
// No missionId means the menu's Skirmish, a mission record like the campaign's.
export function createInitialStateWithOptions(options = {}) {
    return missionState(MISSIONS[options.missionId ?? 'skirmish'] ?? MISSIONS.skirmish, options);
}
function emptyStats() {
    return {
        playerSabotages: 0,
        enemySabotages: 0,
        playerRepairs: 0,
        enemyRepairs: 0,
        playerOverloads: 0,
        enemyOverloads: 0,
        playerUnitsBuilt: 0,
        enemyUnitsBuilt: 0,
        playerUnitsLost: 0,
        enemyUnitsLost: 0,
        playerGridDownMs: 0,
        enemyGridDownMs: 0,
        playerExploitDamage: 0,
        enemyExploitDamage: 0,
        playerInfantryCuts: 0,
        playerArmorCuts: 0,
        enemyInfantryCuts: 0,
        enemyArmorCuts: 0,
        playerHusksDelivered: 0,
    };
}
function missionState(mission, options) {
    const doctrines = options.doctrines ?? [];
    const placed = mission.start.entities.map(([owner, kind, x, y], index) => createEntity(`${owner}-${kind}-${index}`, owner, kind, { x, y }, owner === 'player' ? doctrines : []));
    // An empty target makes updateHarvest pick the nearest node with a free slot.
    for (const drone of placed)
        if (drone.kind === 'worker')
            drone.intent = { type: 'harvest', targetId: '' };
    const state = {
        timeMs: 0,
        map: mission.map,
        nextId: 1,
        players: {
            // ponytail: doctrines are permanent research ids
            player: { ore: mission.start.ore, mined: 0, marrow: 0, bloom: options.bloom ?? 0, researched: [...doctrines], specimens: {} },
            enemy: { ore: 0, mined: 0, marrow: 0, bloom: 0, researched: [], specimens: {} },
        },
        entities: [
            ...placed,
            ...mission.ore.map(([x, y, amount], index) => ({ ...entity(`ore-${index + 1}`, 'neutral', 'ore', x, y), amount })),
            ...mission.burrows.map(([x, y], index) => entity(`burrow-${index + 1}`, 'neutral', 'burrow', x, y)),
        ],
        // A link takes its source's owner (M4's Spire->Cyst veins are enemy links). A second link into the same target
        // (M5's two Cradle veins) adds its source to the id.
        powerLinks: mission.start.links.map(([from, to], i) => ({
            id: `${placed[from].owner}-link-${mission.start.links.findIndex(([, other]) => other === to) < i ? `${placed[from].id}-` : ''}${placed[to].id}`,
            owner: placed[from].owner === 'enemy' ? 'enemy' : 'player',
            fromId: placed[from].id,
            toId: placed[to].id,
            disabledMs: 0,
        })),
        selectedIds: [],
        attackMovePrimed: false,
        alerts: [],
        shots: [],
        stats: emptyStats(),
        match: {
            durationMs: missionEndMs(mission),
            difficulty: options.difficulty ?? 'medium',
            phase: 'opening',
            objective: '',
            missionId: mission.id,
            objectives: mission.objectives.map((objective) => ({ id: objective.id, done: false, progressMs: 0 })),
            nextWaveMs: mission.waves.firstMs,
            // Hints fire once per save, so the seen ones start out as fired.
            fired: [...(options.seenHints ?? [])],
            retries: options.retries ?? 0,
        },
    };
    for (const node of placed)
        if (node.kind === 'power-node')
            linkMasts(state, node);
    return state;
}
