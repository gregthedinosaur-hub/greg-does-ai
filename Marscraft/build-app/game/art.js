// Pure data (no Phaser import) so art/contact.html can import the built JS.
export const ART_VERSION = 8; // bump on every art drop, or python http.server serves the old PNG
export const ART = {
    'hush.cradle': { path: 'hush/cradle.png', width: 130, baseFacing: 'none' },
    'hush.tendril-spire': { path: 'hush/tendril-spire.png', width: 80, baseFacing: 'none' },
    'hush.brood-cyst': { path: 'hush/brood-cyst.png', width: 92, baseFacing: 'none' },
    'hush.gestation-pit': { path: 'hush/gestation-pit.png', width: 98, baseFacing: 'none' },
    'hush.weeping-spine': { path: 'hush/weeping-spine.png', width: 56, baseFacing: 'right' },
    'hush.skitter': { path: 'hush/skitter.png', width: 48, baseFacing: 'right' },
    'hush.weaver': { path: 'hush/weaver.png', width: 60, baseFacing: 'right' },
    'hush.mourner': { path: 'hush/mourner.png', width: 96, baseFacing: 'right' },
    'hush.tender': { path: 'hush/tender.png', width: 48, baseFacing: 'right' },
    'hush.burrow-hole': { path: 'hush/burrow-hole.png', width: 90, baseFacing: 'none' },
    // Mission ground: a map-sized TileSprite plus decal Images, tinted per mission. Widths are first guesses; tune on the contact page.
    'ground.regolith': { path: 'ground/regolith.jpg', width: 1024, baseFacing: 'none' },
    'decal.crater-small': { path: 'decal/crater-small.png', width: 64, baseFacing: 'none' },
    'decal.crater-large': { path: 'decal/crater-large.png', width: 150, baseFacing: 'none' },
    'decal.rocks': { path: 'decal/rocks.png', width: 90, baseFacing: 'none' },
    'decal.frost': { path: 'decal/frost.png', width: 140, baseFacing: 'none' },
    'decal.rover-wreck': { path: 'decal/rover-wreck.png', width: 96, baseFacing: 'none' },
    'neutral.drill-rig': { path: 'neutral/drill-rig.png', width: 150, baseFacing: 'none' },
    'neutral.relay-mast': { path: 'neutral/relay-mast.png', width: 96, baseFacing: 'none' },
    'neutral.kepler-bunker': { path: 'neutral/kepler-bunker.png', width: 120, baseFacing: 'none' },
    'hush.husk-small': { path: 'hush/husk-small.png', width: 44, baseFacing: 'right' },
    // The 9 old atlas cells as single sprites (bible §4.0); baseFacing from bible §2.
    'foundry.core': { path: 'foundry/core.png', width: 119, baseFacing: 'none' },
    'foundry.barracks': { path: 'foundry/barracks.png', width: 92, baseFacing: 'none' },
    'foundry.factory': { path: 'foundry/factory.png', width: 98, baseFacing: 'none' },
    'foundry.power-node': { path: 'foundry/power-node.png', width: 73, baseFacing: 'none' },
    'foundry.sentry': { path: 'foundry/sentry.png', width: 60, baseFacing: 'right' },
    'foundry.infantry': { path: 'foundry/infantry.png', width: 58, baseFacing: 'right' },
    'foundry.raider': { path: 'foundry/raider.png', width: 64, baseFacing: 'left' },
    'foundry.heavy': { path: 'foundry/heavy.png', width: 88, baseFacing: 'left' },
    'foundry.worker': { path: 'foundry/worker.png', width: 56, baseFacing: 'left' },
    'foundry.ore': { path: 'foundry/ore.png', width: 74, baseFacing: 'none' },
    // M3 (bible §7: ~96 px Lab, ~60 px Trooper; the Trooper keeps the Rifleman's facing).
    'foundry.xeno-lab': { path: 'foundry/xeno-lab.png', width: 96, baseFacing: 'none' },
    'hybrid.grafted-trooper': { path: 'hybrid/grafted-trooper.png', width: 60, baseFacing: 'right' },
    // M3 (3B). The Veinfield decal is drawn at 2.4x its rule radius, so this width is only its contact-page size.
    'hush.veinfield': { path: 'hush/veinfield.png', width: 480, baseFacing: 'none' },
    'hush.hollow': { path: 'hush/hollow.png', width: 58, baseFacing: 'right' },
    'foundry.wreck': { path: 'foundry/wreck.png', width: 50, baseFacing: 'right' },
    // Chorus swaps (Bloom 50+), the same widths as the clean sprites so the swap doesn't jump.
    'foundry.core-veined': { path: 'foundry/core-veined.png', width: 119, baseFacing: 'none' },
    'foundry.barracks-veined': { path: 'foundry/barracks-veined.png', width: 92, baseFacing: 'none' },
    // ponytail: Okafor's drone reuses the Drone sprite, drawn with the unpowered tint
    'neutral.okafor-drone': { path: 'foundry/worker.png', width: 56, baseFacing: 'left' },
    // M4 (bible §7: ~70 px Stilt and large husk, ~64 px Spine Lancer keeping the Rifleman's facing, ~74 px rich node).
    'hush.stilt': { path: 'hush/stilt.png', width: 70, baseFacing: 'right' },
    'hush.husk-large': { path: 'hush/husk-large.png', width: 70, baseFacing: 'right' },
    'hybrid.spine-lancer': { path: 'hybrid/spine-lancer.png', width: 64, baseFacing: 'right' },
    'neutral.ferrite-rich': { path: 'neutral/ferrite-rich.png', width: 74, baseFacing: 'none' },
    // The Pavonis caldera rim; mission decals rotate it to run down the sides.
    'decal.cliff-edge': { path: 'decal/cliff-edge.png', width: 400, baseFacing: 'none' },
    // M5 (bible §7: ~92 px Armory, ~80 px Silo, ~96 px Chimera keeping the atlas heavy's facing).
    'foundry.armory': { path: 'foundry/armory.png', width: 92, baseFacing: 'none' },
    'foundry.ferrite-silo': { path: 'foundry/ferrite-silo.png', width: 80, baseFacing: 'none' },
    'hybrid.chimera': { path: 'hybrid/chimera.png', width: 96, baseFacing: 'left' },
};
// Relative to the page, so the game works from any folder (gregdoesai.com/Marscraft/ as well as the dev server root).
export const artUrl = (path) => `src/assets/${path}?v=${ART_VERSION}`;
// Kinds with their own art, for any owner; each card adds its kinds' rows.
// ponytail: explicit map beats naming tricks
export const KIND_ART = {
    skitter: 'hush.skitter',
    burrow: 'hush.burrow-hole',
    weaver: 'hush.weaver',
    // artIdFor swaps in hush.husk-large for a Stilt or Mourner husk.
    husk: 'hush.husk-small',
    'relay-mast': 'neutral.relay-mast',
    turret: 'foundry.sentry',
    'xeno-lab': 'foundry.xeno-lab',
    'grafted-trooper': 'hybrid.grafted-trooper',
    'tendril-spire': 'hush.tendril-spire',
    wreck: 'foundry.wreck',
    hollow: 'hush.hollow',
    'okafor-drone': 'neutral.okafor-drone',
    'brood-cyst': 'hush.brood-cyst',
    tender: 'hush.tender',
    stilt: 'hush.stilt',
    'spine-lancer': 'hybrid.spine-lancer',
    armory: 'foundry.armory',
    'ferrite-silo': 'foundry.ferrite-silo',
    chimera: 'hybrid.chimera',
    'gestation-pit': 'hush.gestation-pit',
    'weeping-spine': 'hush.weeping-spine',
    cradle: 'hush.cradle',
    mourner: 'hush.mourner',
};
// Chorus (Bloom 50+): the player's Core and Barracks wear their veined variants.
export function artIdFor(entity, bloom = 0) {
    if (bloom >= 50 && entity.owner === 'player' && (entity.kind === 'core' || entity.kind === 'barracks'))
        return `foundry.${entity.kind}-veined`;
    if (entity.kind === 'husk' && (entity.sourceKind === 'stilt' || entity.sourceKind === 'mourner'))
        return 'hush.husk-large';
    if (entity.kind === 'ore' && (entity.amount ?? 0) > 1500)
        return 'neutral.ferrite-rich';
    const foundry = `foundry.${entity.kind}`;
    return KIND_ART[entity.kind] ?? (ART[foundry] ? foundry : undefined);
}
