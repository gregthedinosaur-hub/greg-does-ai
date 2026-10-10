export const FOUNDRY_FACTION = {
    name: 'Aegis Foundry',
    doctrine: 'Industrial Grid Command',
    trait: 'Strong mechanized production, exposed power links, fast overload bursts.',
};
export const UNIT_ROLE = {
    worker: 'Drone',
    infantry: 'Rifleman',
    raider: 'Link Raider',
    heavy: 'Bulwark',
    'grafted-trooper': 'Grafted Trooper',
    'spine-lancer': 'Spine Lancer',
    chimera: 'Chimera',
};
export const BUILDING_ROLE = {
    core: 'Core',
    'power-node': 'Power Node',
    turret: 'Sentry Turret',
    barracks: 'Barracks',
    factory: 'Factory',
    ore: 'Ore Field',
    burrow: 'Burrow',
    'relay-mast': 'Relay Mast',
    husk: 'Husk',
    'xeno-lab': 'Xeno Lab',
    armory: 'Armory',
    'ferrite-silo': 'Ferrite Silo',
};
export const HUSH_ROLE = {
    core: 'The Cradle',
    barracks: 'Brood Cyst',
    factory: 'Gestation Pit',
    'power-node': 'Tendril Spire',
    turret: 'Weeping Spine',
    infantry: 'Skitter',
    raider: 'Weaver',
    heavy: 'Mourner',
    worker: 'Tender',
    skitter: 'Skitter',
    weaver: 'Weaver',
    'tendril-spire': 'Tendril Spire',
    wreck: 'Wreck',
    hollow: 'Hollow',
    'brood-cyst': 'Brood Cyst',
    tender: 'Tender',
    stilt: 'Stilt',
    'gestation-pit': 'Gestation Pit',
    'weeping-spine': 'Weeping Spine',
    cradle: 'The Cradle',
    mourner: 'Mourner',
};
export function roleFor(kind, owner = 'player') {
    if (owner === 'enemy')
        return HUSH_ROLE[kind];
    return UNIT_ROLE[kind] ?? BUILDING_ROLE[kind];
}
