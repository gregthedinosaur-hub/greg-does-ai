import { UNIT_TIME } from './constants.js';
function seconds(ms) {
    return Math.round(ms / 1000);
}
export function scoreBreakdown(state) {
    const stats = state.stats;
    const heavyDenied = Math.floor(stats.enemyHeavyDeniedMs / UNIT_TIME.heavy);
    const infantryDenied = Math.floor(stats.enemyInfantryDeniedMs / UNIT_TIME.infantry);
    const raiderSurvived = state.entities.some((entity) => entity.owner === 'player' && entity.kind === 'raider' && entity.hp > 0);
    return [
        ['Cut target', `Armor ${stats.playerArmorCuts} · Infantry ${stats.playerInfantryCuts}`],
        ['Enemy downtime', `${seconds(stats.enemyGridDownMs)}s`],
        ['Production denied', `${heavyDenied} heavy · ${infantryDenied} infantry/raider`],
        ['Exploit damage', `${Math.round(stats.playerExploitDamage)}`],
        ['Center ore', `Player ${seconds(stats.playerCenterOreMs)}s · Enemy ${seconds(stats.enemyCenterOreMs)}s`],
        ['Raider outcome', raiderSurvived ? 'survived' : 'lost'],
        ['Blind-test prompt', 'Would you replay for one more raid?'],
    ];
}
export function evaluateSkirmish(state) {
    const stats = state.stats;
    const enemyGridSeconds = seconds(stats.enemyGridDownMs);
    const playerGridSeconds = seconds(stats.playerGridDownMs);
    const exploitDamageScore = Math.floor(stats.playerExploitDamage / 18);
    const score = Math.max(0, Math.min(100, stats.playerSabotages * 28 + enemyGridSeconds * 3 + exploitDamageScore + stats.playerOverloads * 8 - playerGridSeconds * 2 - stats.playerUnitsLost * 2));
    if (stats.playerSabotages === 0 && enemyGridSeconds === 0) {
        return {
            label: 'No Raid Data',
            score,
            summary: 'Scout, raid, and cut an enemy link.',
        };
    }
    if (state.winner === 'player' && stats.playerSabotages > 0 && (enemyGridSeconds >= 8 || stats.playerExploitDamage >= 120)) {
        return {
            label: 'Sabotage Mattered',
            score: Math.max(score, 85),
            summary: `Victory with ${enemyGridSeconds}s enemy downtime and ${Math.round(stats.playerExploitDamage)} exploit damage.`,
        };
    }
    if (stats.playerSabotages > 0 && enemyGridSeconds >= 6) {
        return {
            label: 'Promising',
            score: Math.max(score, 62),
            summary: `${enemyGridSeconds}s enemy downtime created a timing window.`,
        };
    }
    return {
        label: 'Testing',
        score,
        summary: 'Raid landed. Look for a bigger timing window.',
    };
}
export function decideNextStep(state) {
    const verdict = evaluateSkirmish(state);
    const enemyGridSeconds = seconds(state.stats.enemyGridDownMs);
    if (verdict.label === 'Sabotage Mattered') {
        return {
            label: 'Expand',
            reason: 'Sabotage created a visible win condition inside the match.',
            nextStep: 'Run a blind 3-minute playtest and watch where players hesitate.',
        };
    }
    if (state.stats.playerSabotages === 0) {
        return {
            label: 'Tune',
            reason: 'The match ended without player sabotage data.',
            nextStep: 'Make enemy weak points louder and start the player closer to a raid.',
        };
    }
    if (enemyGridSeconds < 8) {
        return {
            label: 'Tune',
            reason: 'Raids landed, but grid downtime was too short to define the game.',
            nextStep: 'Increase sabotage payoff or slow enemy repairs.',
        };
    }
    return {
        label: 'Expand',
        reason: 'Sabotage is producing timing windows worth replaying.',
        nextStep: 'Polish the 3-minute match before adding a second faction.',
    };
}
