// The canvas size; a map can be bigger (GameState.map) and the camera scrolls over it.
export const VIEW = {
    width: 1200,
    height: 760,
};
export const BALANCE = {
    sabotageMs: 10000,
    autoAcquireRadius: 150,
    mineMs: 2500,
    mineLoad: 10,
    oreNodeAmount: 1500,
    repairRateMs: 2200,
    enemyRepairRateMs: 350,
    empSpikeMs: 8000,
    empSpikeCooldownMs: 18000,
    empSpikeRange: 540,
    overloadMs: 7000,
    overloadCooldownMs: 12000,
    overloadSpeedMultiplier: 1.75,
    overloadStrainMs: 3000,
    overloadCost: 25,
    marrowOverloadCost: 15,
    marrowOverloadBloom: 2,
    gnawMs: 2000,
    huskDecayMs: 45000,
    // A husk of a species an open specimen or fork objective still needs.
    neededHuskDecayMs: 90000,
    stragglerMs: 45000,
    purgeMarrow: 40,
    purgeMs: 10000,
    purgeBloom: 5,
    forkBloom: 5,
    huskCap: 40,
    // Hollows (design 11): a wreck stands up after riseMs; Murmur at most every 90s; Chorus listens every 40s.
    riseMs: 5000,
    murmurMs: 90000,
    listenEveryMs: 40000,
    listenMs: 4000,
    listenTelegraphMs: 1000,
    // M4 (design 6, 7d, 11): Sever Charges stretch a Sever x1.6 and cut the EMP cooldown to 12s; Tenders regrow veins 4x faster
    // and a base Spire regrows a missing one every 60s; Veinfield corrodes player links (1s flicker, 2s drop, every 20s).
    severChargesMult: 1.6,
    severChargesEmpCooldownMs: 12000,
    tenderRepairMult: 4,
    tenderEveryMs: 60000,
    tenders: 2,
    corrosionEveryMs: 20000,
    corrosionFlickerMs: 1000,
    corrosionMs: 2000,
    // Rangefinder Lattice (design 7c): Sentry range 170 -> 210, Riflemen +30.
    latticeSentryRange: 210,
    latticeRifleRange: 30,
    latticeBulwarkRange: 210,
    // M5 (design 6, 7b, 7c, 9): Ceramic Plating +15% max hp; Grid Overdrive 6 slots; Breach Shells x1.5 vs 500+ max hp;
    // the Pit opens at 6:00; Tenders regrow a lost Cyst every 90s; the Cradle stays closed 20s after its climax spawns.
    platingMult: 1.15,
    overdriveSlots: 6,
    breachMult: 1.5,
    pitOpensMs: 360000,
    cystRegrowEveryMs: 90000,
    // ponytail: the design gives no regrow time; 20s (a Barracks' build) reads as "visibly grows back"
    cystRegrowMs: 20000,
    cradleClosedMs: 20000,
    chimeraRegen: 4,
};
export const UNIT_COST = {
    worker: 50,
    infantry: 40,
    raider: 55,
    heavy: 95,
    'grafted-trooper': 45,
    'spine-lancer': 70,
    chimera: 150,
};
// Hybrids also cost marrow and add Bloom when produced (design 5, 6).
export const UNIT_MARROW = { 'grafted-trooper': 15, 'spine-lancer': 30, chimera: 60 };
export const UNIT_BLOOM = { 'grafted-trooper': 2, 'spine-lancer': 3, chimera: 6 };
// The species whose HARNESS fork unlocks a hybrid; it also needs a finished, living Xeno Lab.
export const HYBRID_OF = { 'grafted-trooper': 'skitter', 'spine-lancer': 'stilt', chimera: 'mourner' };
// What each building trains.
// A mission-placed Hush producer gets its share of every interval wave dealt to it (design 10).
export const PRODUCES = {
    core: ['worker'],
    barracks: ['infantry', 'raider', 'grafted-trooper', 'spine-lancer'],
    factory: ['heavy', 'chimera'],
    'brood-cyst': ['skitter', 'weaver', 'stilt'],
    'gestation-pit': ['mourner'],
};
export const UNIT_TIME = {
    worker: 3000,
    infantry: 2500,
    raider: 3200,
    heavy: 5200,
    'grafted-trooper': 3000,
    'spine-lancer': 4000,
    chimera: 7000,
};
export const DIFFICULTY_LABEL = {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
};
export const BUILD_COST = {
    'power-node': 80,
    barracks: 120,
    factory: 160,
    turret: 70,
    'xeno-lab': 125,
    armory: 150,
    'ferrite-silo': 75,
};
export const BUILD_TIME = {
    'power-node': 10000,
    barracks: 20000,
    factory: 25000,
    turret: 12000,
    'xeno-lab': 25000,
    armory: 20000,
    'ferrite-silo': 12000,
};
export const RESEARCH = [
    { id: 'drone_haulers', at: 'core', cost: 80, timeMs: 30000, from: 1 },
    { id: 'kinetic_rounds', at: 'barracks', cost: 100, timeMs: 40000, from: 1 },
    { id: 'hardened_conduits', at: 'core', cost: 120, timeMs: 45000, from: 2 },
    // The 3 required husks pay the 15 marrow exactly.
    { id: 'dissect-skitter', at: 'xeno-lab', cost: 50, marrow: 15, timeMs: 60000, from: 3, specimens: ['skitter', 3], label: 'Dissect: Skitter' },
    // ponytail: id matches TEXT upgrade.bone_saw_bayonets (the card calls it bone-saw)
    { id: 'bone_saw_bayonets', at: 'xeno-lab', cost: 0, marrow: 30, timeMs: 30000, from: 3, requires: 'counter-skitter' },
    { id: 'dissect-stilt', at: 'xeno-lab', cost: 80, marrow: 50, timeMs: 75000, from: 4, specimens: ['stilt', 2], label: 'Dissect: Stilt' },
    { id: 'rangefinder_lattice', at: 'xeno-lab', cost: 0, marrow: 40, timeMs: 40000, from: 4, requires: 'counter-stilt' },
    { id: 'ceramic_plating', at: 'armory', cost: 125, timeMs: 40000, from: 5 },
    { id: 'grid_overdrive', at: 'armory', cost: 100, timeMs: 30000, from: 5 },
    { id: 'dissect-mourner', at: 'xeno-lab', cost: 150, marrow: 100, timeMs: 120000, from: 5, specimens: ['mourner', 1], label: 'Dissect: Mourner' },
    { id: 'breach_shells', at: 'xeno-lab', cost: 0, marrow: 60, timeMs: 45000, from: 5, requires: 'counter-mourner' },
];
// The mission's number (m4 -> 4). The skirmish plays on M5 rules, so every row and unit is open.
export const missionNumber = (missionId) => (missionId === 'skirmish' ? 5 : Number(missionId?.slice(1) ?? 0));
export function researchOpen(row, missionId) {
    return !missionId || missionNumber(missionId) >= row.from;
}
// Veinfield radius by Hush kind (design 4).
export const VEINFIELD = { 'tendril-spire': 200, mourner: 200, cradle: 260 };
// Kinds that are people, so they rise as Hollows when they die on Veinfield (Hush world rule 5).
// They are also the "Riflemen and hybrid infantry" that Kinetic Rounds and Living Rounds patch.
// ponytail: vehicle Hollows need their own art (v2)
export const HOLLOW_KINDS = ['infantry', 'grafted-trooper', 'spine-lancer'];
// Marrow per hauled husk (design 5).
export const HUSK_MARROW = { skitter: 5, weaver: 8, tender: 6, stilt: 10, mourner: 40 };
// vsLarge: damage x against targets with 300+ max hp; splash: full damage to every enemy within that many px of the target.
export const ENTITY_STATS = {
    core: { hp: 1600, radius: 44, speed: 0, damage: 0, range: 0, cooldown: 0 },
    worker: { hp: 60, radius: 10, speed: 80, damage: 4, range: 22, cooldown: 900 },
    'power-node': { hp: 260, radius: 22, speed: 0, damage: 0, range: 0, cooldown: 0 },
    turret: { hp: 260, radius: 18, speed: 0, damage: 14, range: 170, cooldown: 620 },
    barracks: { hp: 360, radius: 28, speed: 0, damage: 0, range: 0, cooldown: 0 },
    factory: { hp: 460, radius: 34, speed: 0, damage: 0, range: 0, cooldown: 0 },
    infantry: { hp: 82, radius: 12, speed: 82, damage: 9, range: 96, cooldown: 700 },
    raider: { hp: 144, radius: 11, speed: 125, damage: 6, range: 72, cooldown: 520 },
    heavy: { hp: 185, radius: 16, speed: 54, damage: 22, range: 118, cooldown: 1050, vsLarge: 2 },
    ore: { hp: 9999, radius: 30, speed: 0, damage: 0, range: 0, cooldown: 0 },
    skitter: { hp: 40, radius: 9, speed: 140, damage: 7, range: 18, cooldown: 600 },
    // Neutral entities are never targeted, so the burrow never loses hp.
    burrow: { hp: 9999, radius: 24, speed: 0, damage: 0, range: 0, cooldown: 0 },
    // Never fights: it gnaws links.
    weaver: { hp: 70, radius: 11, speed: 110, damage: 0, range: 0, cooldown: 0 },
    // Neutral like the burrow, so never targeted.
    husk: { hp: 1, radius: 12, speed: 0, damage: 0, range: 0, cooldown: 0 },
    'relay-mast': { hp: 400, radius: 26, speed: 0, damage: 0, range: 0, cooldown: 0 },
    'xeno-lab': { hp: 800, radius: 32, speed: 0, damage: 0, range: 0, cooldown: 0 },
    // Regenerates 2 hp/s (simulation.ts tick).
    'grafted-trooper': { hp: 110, radius: 12, speed: 82, damage: 11, range: 96, cooldown: 700 },
    'tendril-spire': { hp: 450, radius: 22, speed: 0, damage: 0, range: 0, cooldown: 0 },
    // An enemy target (attack-move shoots it) until it rises.
    wreck: { hp: 30, radius: 12, speed: 0, damage: 0, range: 0, cooldown: 0 },
    // ponytail: range and cooldown are a first guess (melee, like the Skitter); the design gives hp, damage and speed only
    hollow: { hp: 70, radius: 12, speed: 90, damage: 10, range: 20, cooldown: 900 },
    // Neutral like the husk, so never targeted.
    'okafor-drone': { hp: 1, radius: 12, speed: 0, damage: 0, range: 0, cooldown: 0 },
    // M4 (design 6). Needs its Spire's vein to spawn its share of a wave.
    'brood-cyst': { hp: 550, radius: 30, speed: 0, damage: 0, range: 0, cooldown: 0 },
    // Never fights: it regrows severed veins.
    tender: { hp: 60, radius: 10, speed: 70, damage: 0, range: 0, cooldown: 0 },
    stilt: { hp: 90, radius: 12, speed: 60, damage: 16, range: 190, cooldown: 1600 },
    'spine-lancer': { hp: 95, radius: 12, speed: 70, damage: 30, range: 220, cooldown: 1600 },
    // M5 (design 6).
    armory: { hp: 400, radius: 30, speed: 0, damage: 0, range: 0, cooldown: 0 },
    'ferrite-silo': { hp: 300, radius: 24, speed: 0, damage: 0, range: 0, cooldown: 0 },
    // Regenerates 4 hp/s on Veinfield (simulation.ts tick).
    chimera: { hp: 380, radius: 18, speed: 48, damage: 26, range: 130, cooldown: 1050, vsLarge: 2, splash: 40 },
    'gestation-pit': { hp: 750, radius: 34, speed: 0, damage: 0, range: 0, cooldown: 0 },
    // Silent while unfed, like the Sentry.
    'weeping-spine': { hp: 300, radius: 18, speed: 0, damage: 18, range: 200, cooldown: 1200 },
    cradle: { hp: 2400, radius: 50, speed: 0, damage: 0, range: 0, cooldown: 0 },
    mourner: { hp: 800, radius: 22, speed: 40, damage: 28, range: 110, cooldown: 1400, splash: 40 },
};
// How long a player Sever cuts a Hush vein (design 10).
export const SEVER_MS = { easy: 26000, medium: 20000, hard: 14000 };
export const ARMY_CAP = 60;
