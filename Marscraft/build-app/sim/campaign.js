import { createInitialStateWithOptions } from './createInitialState.js';
import { RESEARCH } from './constants.js';
import { roleFor } from './faction.js';
import { issueSmartCommand, tickSimulation } from './simulation.js';
// Approved player text, pasted verbatim from docs/superpowers/specs/2026-10-03-marscraft-text-m1-m3.json (and -m4, -m5.json).
// No player-facing story string lives anywhere else.
export const TEXT = {
    "m1.directive": { "speaker": "aegis", "text": "Maintain Site Seven extraction. Bank ferrite for the scheduled lift. Local interference does not alter quota." },
    "m2.directive": { "speaker": "aegis", "text": "Restore Kepler uplink. Recover transferable assets. Six days of unreported yield require immediate reconciliation." },
    "m3.directive": { "speaker": "aegis", "text": "Establish specimen processing at Site Seven. Classify recovered material for integration or suppression. Resume productive use of the concession." },
    "m1.briefing": { "speaker": "okafor", "text": "Night shift, Site Seven. Keep the ferrite moving and train Riflemen to cover the drill. The cargo lift is due in eight minutes. Everything you bank goes on it, so keep the approaches clear until it arrives. We've had movement around the skylights. Small shapes, six legs. Don't follow anything underground. Check your seals. Keep a Drone on the haul route. If the ground starts talking through the gauges, leave the casing alone and call it in." },
    "m2.briefing": { "speaker": "varga", "text": "Kepler stopped transmitting six days ago. Its reserve circuits are intact, but the uplink requires all three Relay Masts powered simultaneously for three minutes. Establish the links and keep repair crews close. Something has been separating the conductors. Recover any empty specimens you find; a husk may retain marrow after the organism withdraws. There is also a crew bunker off the main route. Inspect it if you can maintain the grid. Leave its internal environment undisturbed until we have a record." },
    "m3.briefing": { "speaker": "varga", "text": "Site Seven has changed. A bone spire occupies the drill rig, and Veinfield extends beyond the old safety markers. Foreman Okafor's capping crew has not returned. Establish a Xeno Lab and deliver three Skitter husks. Dissect one, then authorize either HARNESS integration or COUNTER development. We need to learn whether its structures remain useful after withdrawal. Expect a response to the procedure. Watch every fallen soldier on that ground. If a suit begins moving again, do not approach it." },
    "m1.beat.first_contact": { "speaker": "okafor", "trigger": "when the first Skitter wave emerges", "text": "Six legs. Coming out of the skylight. Hold the line." },
    "m1.beat.heartbeat": { "speaker": "okafor", "trigger": "at 2:00, when the drill readout shows a slow heartbeat", "text": "That isn't the drill." },
    "m1.beat.heartbeat_response": { "speaker": "varga", "trigger": "immediately after m1.beat.heartbeat finishes", "text": "Agreed. The interval is shortening. Keep recording." },
    "m1.beat.stillness": { "speaker": "okafor", "trigger": "when a later Skitter wave goes still before advancing", "text": "Every leg stopped together. Keep your sights on them." },
    "m1.beat.lift": { "speaker": "okafor", "trigger": "at 8:00, when the cargo lift arrives", "text": "Lift's here. Load the banked ferrite. Keep the ramp clear." },
    "m2.beat.weaver": { "speaker": "varga", "trigger": "when a Weaver is first sighted", "text": "Long fingers. It is following the power link." },
    "m2.beat.link_cut": { "speaker": "okafor", "trigger": "when a Weaver cuts the first power link", "text": "Link's open. Get a Drone on the break. Cover the repair." },
    "m2.beat.first_husk": { "speaker": "varga", "trigger": "when the first Hush husk is hauled", "text": "An empty shell. Residual marrow remains in the veins." },
    "m2.beat.bunker": { "speaker": "okafor", "trigger": "when the crew bunker is discovered", "text": "Fourteen beds made. Coffee's warm. No crew." },
    "m2.beat.uplink": { "speaker": "varga", "trigger": "after all three Relay Masts stay powered for 180 seconds", "text": "Uplink restored. Six days of silence, precisely logged." },
    "m2.beat.capping_crew": { "speaker": "okafor", "trigger": "during mission completion, after the uplink is restored", "text": "I'll take a crew back to Seven. That bore needs a cap." },
    "m3.beat.spire": { "speaker": "varga", "trigger": "when the old drill rig and bone spire are revealed", "text": "It has grown through the rig. The drill is inside it." },
    "m3.beat.dissection": { "speaker": "varga", "trigger": "when the first Skitter dissection is completed", "text": "No separate bodies. One organism, occupying many shells." },
    "m3.beat.retaliation": { "speaker": "varga", "trigger": "when retaliation begins after the HARNESS or COUNTER choice", "text": "The entire Veinfield has gone still. Prepare your perimeter." },
    "m3.beat.hollow": { "speaker": "varga", "trigger": "when the first fallen soldier rises as a Hollow", "text": "That is our suit. It is no longer our soldier." },
    "m3.beat.drone": { "speaker": "varga", "trigger": "when Okafor's empty drone is found at the Veinfield edge", "text": "Okafor's drone. No cargo. One recording in local memory." },
    "m1.hint.mining": { "text": "Select a Drone, then click a ferrite crystal. Keep its haul route clear." },
    "m1.hint.drone": { "text": "Select the Core and press C to train another Drone." },
    "m1.hint.research": { "text": "Research at the Core or Barracks. It uses the build slot, so time it between waves." },
    "m1.hint.groups": { "text": "Select units and press Ctrl+1 to make group 1. Press 1 to select them again." },
    "m2.hint.nodes": { "text": "Chain Power Nodes out to all three Relay Masts. Keep every mast powered for 180 seconds." },
    "m2.hint.repair": { "text": "A link is cut. Select a Drone, press R, and click the dark link. Guard it from Weavers." },
    "m2.hint.haul": { "text": "Select Drones, then click a husk. They carry it back to the Core for marrow." },
    "m3.hint.lab": { "text": "Build a Xeno Lab, deliver three Skitter husks, then start Dissect: Skitter at the Lab." },
    "m3.hint.wreck": { "text": "Fire on a twitching wreck on Veinfield before it rises as a Hollow." },
    "m3.hint.purge": { "text": "Purge at the Core: burn 40 marrow to lower Bloom by 5." },
    "log.kepler-bunker": { "speaker": "relay_tech", "text": "Relay maintenance, night handover. Fourteen beds made. Nobody signed out. I put the kettle on before checking Mast Two, and when I came back every chair was tucked under its desk. My coffee was still warm. The others had left theirs full. I've checked the airlock counter twice. No cycles since I went out. There's a vibration in the bunk frames, too slow for the ventilation. I'm leaving the recorder on the table. If you come back, say your name before you touch me." },
    "log.okafor-last": { "speaker": "okafor", "text": "Capping crew, lower shaft. We've stopped the winch. The cable keeps taking weight, then giving it back. Nobody is moving. Check your seals. No hands on the casing. I can see the old depth marks through something pale. It fits around every bolt. We're holding here until the gauge settles. Drone, take this up. Stay on the haul route. Tell the Commander we kept the cap closed. Crew, hold the line. The suit heaters are off. All of them.\nIt's warm down here." },
    "codex.skitter": { "speaker": "varga", "text": "Specimen S7 is a six-legged shell of ivory bone-chitin over dark oxblood tissue. The small, pale lime-white ocular structures remain intact, but illumination produces no response. Internal volume exceeds the material recovered. This is not a complete animal rendered inactive. It is an occupied structure from which the occupying organism has withdrawn.\n\nNo mouth, no gut. They are fed through the veins. The feeding arrangement appears common to the shells; each receives marrow from the same organism. Raw marrow emits lime-white light. A sample passed through the Foundry assay pump emerged violet, without a measurable temperature change. This alteration requires further testing before either sample can be considered suitable for integration.\n\nThe limb joints contain no obvious mechanism for independent action. Empty channels converge at the underside, where the shell would meet the substrate. I recommend retaining this junction intact; sectioning destroys relationships we have not yet mapped. The recovered marrow remains responsive to vibration transmitted through the bench. After pump isolation, it began collecting against the side of its container nearest the drill. It remained there after the drill stopped." },
    "fork.skitter.harness": { "speaker": "varga", "text": "We can preserve the connection. Begin the graft." },
    "fork.skitter.counter": { "speaker": "varga", "text": "Proceed. Seal the remaining material for later study." },
    "murmur.1": { "speaker": "Drone {n}", "text": "Haul route clear. Awaiting assignment." },
    "murmur.2": { "speaker": "Drone {n}", "text": "Load secured. Returning to the lift." },
    "murmur.3": { "speaker": "Drone {n}", "text": "Check your seals. Pressure reading stable." },
    "murmur.4": { "speaker": "Drone {n}", "text": "Holding at the junction. Link repair pending." },
    "murmur.5": { "speaker": "Drone {n}", "text": "Stay on the haul route. Visibility reduced." },
    "murmur.6": { "speaker": "Drone {n}", "text": "No hands on the casing. Maintenance in progress." },
    "murmur.7": { "speaker": "Drone {n}", "text": "At the perimeter. Request permission to come home." },
    "murmur.8": { "speaker": "Drone {n}", "text": "Check your seals. Something has checked mine." },
    "murmur.9": { "speaker": "Drone {n}", "text": "Hold the line. The cable goes through me now." },
    "murmur.10": { "speaker": "Drone {n}", "text": "Load delivered. Please tell me what to do with the suit." },
    "murmur.11": { "speaker": "Drone {n}", "text": "Crew accounted for. Fourteen beds inside the casing." },
    "murmur.12": { "speaker": "Drone {n}", "text": "It's warm down here." },
    "bloom.25": { "speaker": "varga", "text": "Real reports carry map locators. Reports without them name units that do not exist." },
    "bloom.50": { "speaker": "varga", "text": "A white flare. They freeze, turn toward Hush structures. What are we listening for?" },
    "m1.debrief.low": { "speaker": "aegis", "trigger": "mission complete with Bloom 0-24", "text": "Lift manifest: {ferrite} ferrite. Extraction interval accepted. Standard staffing allocation renewed." },
    "m1.debrief.mid": { "speaker": "aegis", "trigger": "mission complete with Bloom 25-49", "text": "Lift manifest: {ferrite} ferrite. Duplicate radio traffic excluded from the yield ledger." },
    "m1.debrief.high": { "speaker": "aegis", "trigger": "mission complete with Bloom 50+", "text": "Lift manifest: {ferrite} ferrite. Response latency classified as scheduled integration overhead." },
    "m2.debrief.low": { "speaker": "aegis", "trigger": "mission complete with Bloom 0-24", "text": "Relay yield: {ferrite} ferrite; {marrow} marrow. Uplink restored. Bunker capacity remains fourteen." },
    "m2.debrief.mid": { "speaker": "aegis", "trigger": "mission complete with Bloom 25-49", "text": "Relay yield: {ferrite} ferrite; {marrow} marrow. Unregistered call signs carry no payroll authorization." },
    "m2.debrief.high": { "speaker": "aegis", "trigger": "mission complete with Bloom 50+", "text": "Relay yield: {ferrite} ferrite; {marrow} marrow. Synchronization pauses do not qualify as uplink downtime." },
    "m3.debrief.low": { "speaker": "aegis", "trigger": "mission complete with Bloom 0-24", "text": "Specimen yield: {ferrite} ferrite; {marrow} marrow. Processing capability established. Capping assignment remains open." },
    "m3.debrief.mid": { "speaker": "aegis", "trigger": "mission complete with Bloom 25-49", "text": "Specimen yield: {ferrite} ferrite; {marrow} marrow. Non-roster transmissions are classified as equipment output." },
    "m3.debrief.high": { "speaker": "aegis", "trigger": "mission complete with Bloom 50+", "text": "Specimen yield: {ferrite} ferrite; {marrow} marrow. Integrated personnel pauses are included in revised productivity forecasts." },
    "upgrade.drone_haulers.name": { "text": "Drone Haulers" },
    "upgrade.drone_haulers.description": { "text": "Drones carry 14 ferrite instead of 10 and haul husks faster." },
    "upgrade.kinetic_rounds.name": { "text": "Kinetic Rounds" },
    "upgrade.kinetic_rounds.description": { "text": "Riflemen, hybrid infantry and Sentries deal 15% more damage." },
    "upgrade.hardened_conduits.name": { "text": "Hardened Conduits" },
    "upgrade.hardened_conduits.description": { "text": "Cut power links come back online 40% sooner." },
    "ability.overload.name": { "text": "Overload" },
    "ability.overload.description": { "text": "Building works 75% faster for 7s, then its link strains offline for 3s." },
    "ability.marrow_overload.name": { "text": "Marrow Overload" },
    "ability.marrow_overload.description": { "text": "The same surge with no link strain, paid in marrow. Something else is paid too." },
    "ability.purge.name": { "text": "Purge" },
    "ability.purge.description": { "text": "Burn 40 marrow at the Core to lower Bloom by 5. The Core can't train meanwhile." },
    "unit.grafted_trooper.name": { "text": "Grafted Trooper" },
    "unit.grafted_trooper.description": { "text": "A human soldier reinforced with Hush grafts. Integration raises Bloom." },
    "upgrade.bone_saw_bayonets.name": { "text": "Bone-Saw Bayonets" },
    "upgrade.bone_saw_bayonets.description": { "text": "Riflemen deal +6 damage to close-range Hush. The pure-Foundry answer." },
    "doctrine.deep_bore.name": { "text": "Deep Bore" },
    "doctrine.deep_bore.description": { "text": "Drones mine faster: 1.5s per load instead of 2.5s." },
    "doctrine.rapid_muster.name": { "text": "Rapid Muster" },
    "doctrine.rapid_muster.description": { "text": "Riflemen and Grafted Troopers cost 25% less ferrite." },
    "doctrine.hardline_grid.name": { "text": "Hardline Grid" },
    "doctrine.hardline_grid.description": { "text": "Cut links recover twice as fast. Power Nodes gain 100 hp." },
    "doctrine.long_relays.name": { "text": "Long Relays" },
    "doctrine.long_relays.description": { "text": "Power links reach 440 instead of 320." },
    "doctrine.cryo_sterilization.name": { "text": "Cryo Sterilization" },
    "doctrine.cryo_sterilization.description": { "text": "Your fallen soldiers never rise as Hollows. Adds no Bloom." },
    "doctrine.marrow_sutures.name": { "text": "Marrow Sutures" },
    "doctrine.marrow_sutures.description": { "text": "All units regenerate on Veinfield, hybrids twice as fast. Raises Bloom." },
    // M4, pasted verbatim from docs/superpowers/specs/2026-10-08-marscraft-text-m4.json.
    "m4.directive": { "speaker": "aegis", "text": "Eliminate caldera brood production. Complete Stilt analysis. Convert territorial access into measurable yield." },
    "m4.briefing": { "speaker": "varga", "text": "Pavonis caldera. Seven hundred kilometres from Site Seven, and the same veins beneath the frost. The Tendril Spire feeds two Brood Cysts. Destroy both. Recover two Stilt specimens for the Xeno Lab, complete the dissection, then authorize a Spine Lancer graft or a Rangefinder Lattice. Link Raiders can interrupt the feeding veins, but Tenders will reconnect them. Destroying a Cyst or Spire draws a Grief wave from the nearest burrow. They can feel us working. I wonder whether they are listening back." },
    "m4.beat.caldera": { "speaker": "varga", "trigger": "at 0:05, overlooking the Hush base", "text": "The Spire feeds both Cysts. Those lines are living veins." },
    "m4.beat.stilt": { "speaker": "varga", "trigger": "when the first Stilt is seen", "text": "A Stilt. Four legs, dorsal weapon. Its reach exceeds ours." },
    "m4.beat.sever": { "speaker": "varga", "trigger": "when a Hush vein is cut for the first time", "text": "The vein is cut. Watch how the Cyst responds." },
    "m4.beat.swell": { "speaker": "varga", "trigger": "when a starved Cyst visibly swells for the first time", "text": "No new brood emerging. The chamber is still expanding." },
    "m4.beat.okafor": { "speaker": "okafor", "trigger": "at 4:00, regardless of Bloom, on the channel shut down in M3; always display a map locator pointing at a burrow hole", "text": "Hold at the collar. Sending my mark. The shaft runs level here." },
    "m4.beat.okafor_reply": { "speaker": "varga", "trigger": "immediately after m4.beat.okafor finishes, while its burrow locator remains visible", "text": "That channel was shut down at Seven. His locator marks a burrow." },
    "m4.beat.tide": { "speaker": "varga", "trigger": "at 9:20, if both Brood Cysts still stand", "text": "A Tide in forty seconds. Destroy one Cyst before it begins." },
    "m4.hint.camera": { "text": "Use arrow keys, screen edges, or the minimap to move your view." },
    "m4.hint.sever": { "text": "Select a Link Raider, then click a Hush vein to Sever it." },
    "m4.hint.emp": { "text": "Use a Link Raider's EMP on a vein to interrupt its feed from range." },
    "m4.hint.swell": { "text": "A swollen Cyst releases its stored brood when reconnected. Strike while it is starved." },
    "m4.hint.outrider": { "text": "Two rich nodes lie on the Outrider's Veinfield. Risk mining there or kill the Spire first." },
    "codex.stilt": { "speaker": "varga", "text": "Both specimens possess four elongated limbs supporting a dorsal spine-tube. The structure is braced against the ground before discharge; recoil passes into the substrate. They do not require a visual line to register movement through connected rock. Their stillness before firing may serve to separate a target's vibration from their own. Neither specimen contains an independent digestive system.\n\nThe spine-tube is lined with ferrite. Every node we mine is theirs. Deposits I classified as external resources may be continuous with structures beneath the caldera. The lining shows ordered wear, consistent with repeated passage of a rigid projectile. It may be possible to retain this alignment in a shoulder graft. We would feel the break. They would, through the rock.\n\nA detached tube remained inert under airborne sound. Pressure applied to the stone bench produced a small displacement at its base. I repeated the test with the second specimen, then removed both from the bench. The displacement ceased. On separate insulated trays, their tubes slowly turned toward the same wall. Beyond that wall is the burrow marked by Okafor's locator." },
    "fork.stilt.harness": { "speaker": "varga", "text": "The alignment survives. Prepare the shoulder graft." },
    "fork.stilt.counter": { "speaker": "varga", "text": "The lattice will suffice. Keep both specimens intact." },
    "m4.debrief.low": { "speaker": "aegis", "trigger": "mission complete with Bloom 0-24", "text": "Caldera yield: {ferrite} ferrite; {marrow} marrow. Two brood sites decommissioned. Stilt research authorization recorded. Standard extraction approved." },
    "m4.debrief.mid": { "speaker": "aegis", "trigger": "mission complete with Bloom 25-49", "text": "Caldera yield: {ferrite} ferrite; {marrow} marrow. Two brood sites decommissioned. Stilt research authorization recorded. Closed-channel traffic requires no staffing amendment." },
    "m4.debrief.high": { "speaker": "aegis", "trigger": "mission complete with Bloom 50+", "text": "Caldera yield: {ferrite} ferrite; {marrow} marrow. Two brood sites decommissioned. Stilt research authorization recorded. Listening intervals are classified as equipment calibration." },
    "unit.spine_lancer.name": { "text": "Spine Lancer" },
    "unit.spine_lancer.description": { "text": "A soldier bearing a shoulder-grafted Stilt spine for long-range fire." },
    "upgrade.rangefinder_lattice.name": { "text": "Rangefinder Lattice" },
    "upgrade.rangefinder_lattice.description": { "text": "Increase Sentry, Rifleman, and tank range with human targeting technology." },
    "ability.sever.name": { "text": "Sever" },
    "ability.sever.description": { "text": "Cut a living vein with a Link Raider to interrupt the Hush supply." },
    "ability.emp.name": { "text": "EMP" },
    "ability.emp.description": { "text": "Interrupt a living vein's feed from range with a Link Raider pulse." },
    "doctrine.sever_charges.name": { "text": "Sever Charges" },
    "doctrine.sever_charges.description": { "text": "Severed veins stay cut 60% longer, and EMP recharges faster." },
    "doctrine.living_rounds.name": { "text": "Living Rounds" },
    "doctrine.living_rounds.description": { "text": "Riflemen and hybrid infantry deal +2 damage. Raises Bloom." },
    // M5 and the endings, pasted verbatim from docs/superpowers/specs/2026-10-08-marscraft-text-m5.json.
    "m5.directive": { "speaker": "aegis", "text": "Terminate Cradle activity. Secure Olympus extraction rights. Recover ferrite and marrow before the next reporting interval." },
    "m5.briefing": { "speaker": "varga", "text": "The Cradle is ahead, beneath the Olympus foothills. Two Spires feed it. Interrupt both veins, or destroy the Spires, to open its ribs. Each Spire will draw a Grief wave when it falls. Expand with a Ferrite Silo and bring Bulwarks forward. Weeping Spines guard the approach. Tenders will regrow any lost Cysts. We keep the ribs closed while we are feeding, Commander. Please give us time to open. The Armory can reinforce your units and extend the grid's capacity. There is enough here for us to finish." },
    "m5.beat.cradle": { "speaker": "varga", "trigger": "at 0:05, when the Cradle is revealed", "text": "We have kept the heart below the frost. There it is." },
    "m5.beat.ribs": { "speaker": "varga", "trigger": "when the player first damages the Cradle while any feeding vein is live", "text": "The veins still feed us. The ribs will hold." },
    "m5.beat.mourner": { "speaker": "okafor", "trigger": "when the first Mourner rises from a Gestation Pit after 6:00; always display a map locator on that Pit", "text": "Hold the line. Heavy load coming up. No hands on the casing." },
    "m5.beat.open": { "speaker": "varga", "trigger": "when the Cradle's ribs open for the first time", "text": "Both feeds are quiet. The ribs are opening." },
    "m5.beat.silence": { "speaker": "okafor", "trigger": "when the Cradle first drops below half health; always ping the Cradle; the line ends as the ribs close and eight seconds of total silence begin, with a wave rising from every burrow", "text": "Commander. Stop digging." },
    "m5.beat.fold": { "speaker": "varga", "trigger": "when the destroyed Cradle folds inward", "text": "We can be still now." },
    "m5.hint.silo": { "text": "Build a Ferrite Silo near distant nodes to shorten Drone haul routes." },
    "m5.hint.factory": { "text": "Build a Factory to train Bulwarks. They deal double damage to large targets." },
    "m5.hint.armory": { "text": "Research Ceramic Plating and Grid Overdrive at the Armory." },
    "m5.hint.ribs": { "text": "Live Spire veins protect the Cradle. Cut both veins or destroy both Spires." },
    "m5.hint.mourner": { "text": "Mourners crush clumped units. Spread out and use Bulwarks against them." },
    "codex.mourner": { "speaker": "varga", "text": "We carry the weight on folded limbs beneath the hood. We distribute each impact through nested plates, keeping the channels between them open. We can crush a compact formation without changing direction. We have called this arrangement armor because we first examined it from outside. From within, we would call it shelter. We retain that distinction in the preparation notes.\n\nThe belly vein carries the heartbeat. It has been listening to our Core since Site Seven. We mistook the alternating load on the drill cable for resistance. We were measuring a reply. We have brought the same rhythm seven hundred kilometres, then farther, in pumps, power links and the intervals between our orders. We know how to wait for the next one.\n\nWe can secure these plates to a Bulwark without interrupting their deeper channels. On Veinfield, we can supply the graft and restore its structure. We should preserve the connection during transfer. We have placed both sections on separate insulated trays. We have disconnected the pump. We can still measure the pulse. We obtain the same trace with the probe against our wrist." },
    "fork.mourner.harness": { "speaker": "varga", "text": "Choose the graft. We can keep the connection alive." },
    "fork.mourner.counter": { "speaker": "varga", "text": "Breach Shells. We could have kept so much more." },
    "m5.debrief.low": { "speaker": "aegis", "trigger": "mission complete with Bloom 0-24", "text": "Olympus yield: {ferrite} ferrite; {marrow} marrow. Cradle activity terminated. Extraction rights secured. Biological monitoring reassigned to routine maintenance." },
    "m5.debrief.mid": { "speaker": "aegis", "trigger": "mission complete with Bloom 25-49", "text": "Olympus yield: {ferrite} ferrite; {marrow} marrow. Cradle activity below operational threshold. Residual periodic signals excluded from downtime calculations." },
    "m5.debrief.high": { "speaker": "aegis", "trigger": "mission complete with Bloom 50+", "text": "Olympus yield: {ferrite} ferrite; {marrow} marrow. Surface integration accepted. Revised atmospheric support demand improves projected operating margin." },
    "ending.quiet": { "trigger": "campaign complete with Bloom under 25", "text": "At first light, the heartbeat stops for the first time since Site Seven. The drills remain off. Varga checks the silent trace until her hands shake. Okafor's last locator fades from the folded Cradle. The Commander keeps the helmet sealed while the air gauge settles. Inside, one human breath follows another." },
    "ending.static": { "trigger": "campaign complete with Bloom 25-49", "text": "At first light, the heartbeat is fainter. Varga turns down the receiver, then presses her palm against the desk. Okafor asks the crew to check their seals; his locator remains beneath the folded Cradle. The Commander's helmet stays closed. Its pressure gauge follows a rhythm the wearer has not set." },
    "ending.voices": { "trigger": "campaign complete with Bloom 50 or higher; the Hush narrate through Varga and Okafor", "text": "We speak through Varga when we name what remains. We speak through Okafor when we ask you to hold the line. At first light, our Cradle lies folded and our work begins above it. The Commander's helmet stays sealed. Nothing inside it needs air. We have learned to leave it closed." },
    "unit.bulwark.name": { "text": "Bulwark" },
    "unit.bulwark.description": { "text": "Heavy tank. Deals double damage against large targets." },
    "unit.chimera.name": { "text": "Chimera" },
    "unit.chimera.description": { "text": "A Bulwark with Mourner carapace. Regenerates on Hush ground." },
    "building.armory.name": { "text": "Armory" },
    "building.armory.description": { "text": "Research Ceramic Plating and Grid Overdrive." },
    "building.ferrite_silo.name": { "text": "Ferrite Silo" },
    "building.ferrite_silo.description": { "text": "A forward ferrite drop-off point for Drone haul routes." },
    "building.factory.name": { "text": "Factory" },
    "building.factory.description": { "text": "Produces Bulwark tanks." },
    "upgrade.ceramic_plating.name": { "text": "Ceramic Plating" },
    "upgrade.ceramic_plating.description": { "text": "Increase unit maximum health by 15%." },
    "upgrade.grid_overdrive.name": { "text": "Grid Overdrive" },
    "upgrade.grid_overdrive.description": { "text": "Power Nodes feed six buildings instead of four." },
    "upgrade.breach_shells.name": { "text": "Breach Shells" },
    "upgrade.breach_shells.description": { "text": "Bulwarks deal 50% more damage to very large targets." },
};
export function text(id) {
    return TEXT[id]?.text ?? 'TODO(text)';
}
export function researchName(id) {
    return RESEARCH.find((row) => row.id === id)?.label ?? text(`upgrade.${id}.name`);
}
// Dissection forks (design 7c): the species and the mission whose win saves its pick.
export const FORKS = { skitter: 'm3', stilt: 'm4', mourner: 'm5' };
// The DOM HUD's top band and command dock on the 1200x760 view.
export const SAFE = { top: 160, dock: { x0: 180, x1: 1020, y: 600 } };
// Grief (design 10): killing a mission-placed structure calls one flat-point wave from the burrow nearest it.
export const GRIEF = { 'tendril-spire': 30, 'brood-cyst': 24, 'gestation-pit': 30 };
export const WAVE_PRICE = { skitter: 2, weaver: 3, stilt: 4, mourner: 12 };
const DIFFICULTY_MULT = { easy: 0.75, medium: 1, hard: 1.35 };
export const MISSIONS = {
    m1: {
        id: 'm1',
        title: 'Drill Site Seven',
        briefing: 'm1.briefing',
        map: { width: 1200, height: 760 },
        ambient: { tint: 0xb8c4d8 },
        start: {
            ore: 300,
            entities: [
                ['player', 'core', 280, 420],
                ['player', 'power-node', 390, 450],
                ['player', 'barracks', 390, 320],
                ['player', 'worker', 225, 360],
                ['player', 'worker', 225, 480],
                ['player', 'worker', 330, 505],
            ],
            links: [[1, 2]],
        },
        ore: [
            [110, 200, 1500],
            [100, 650, 1500],
            [640, 230, 1500],
            [660, 560, 1500],
        ],
        burrows: [
            [1080, 250],
            [1090, 630],
        ],
        // ponytail: dressing spots are a first guess; only the rig position comes from the design doc
        decals: [
            ['neutral.drill-rig', 760, 420],
            ['decal.crater-large', 900, 470],
            ['decal.crater-small', 540, 300],
            ['decal.rocks', 200, 560],
            ['decal.frost', 470, 210],
            ['decal.rover-wreck', 960, 360],
        ],
        waves: { firstMs: 150000, everyMs: 90000, base: 2, perMin: 2.0, disturbance: 0.1, roster: { skitter: 1 }, cap: 30, firstTarget: 'nearest-drone' },
        climaxes: [{ id: 'lift', atMs: 420000, mults: [1.5], target: 'core' }],
        objectives: [
            { id: 'cargo', kind: 'cargo', amount: { easy: 1500, medium: 2000, hard: 2500 } },
            { id: 'lift', kind: 'survive', ms: 480000 },
        ],
        loseIfLost: ['core'],
        story: [
            { id: 'm1.beat.heartbeat', on: { atMs: 120000 }, point: [760, 420] },
            { id: 'm1.beat.heartbeat_response', on: { atMs: 140000 }, point: [760, 420] },
            { id: 'm1.beat.first_contact', on: { atMs: 150000 }, point: [1080, 250] },
        ],
        hints: [
            { id: 'm1.hint.mining', on: { atMs: 10000 }, point: [110, 200] },
            { id: 'm1.hint.drone', on: { atMs: 30000 } },
            { id: 'm1.hint.research', on: { atMs: 60000 } },
            { id: 'm1.hint.groups', on: { atMs: 200000 }, point: [390, 320] },
        ],
        doctrines: ['deep_bore', 'rapid_muster'],
        builds: ['barracks'],
        hud: [],
    },
    m2: {
        id: 'm2',
        title: 'Kepler Relay',
        briefing: 'm2.briefing',
        map: { width: 1200, height: 760 },
        ambient: { tint: 0xc8a888 },
        start: {
            ore: 350,
            entities: [
                ['player', 'core', 600, 470],
                ['player', 'power-node', 680, 470],
                ['player', 'barracks', 500, 370],
                ['player', 'worker', 540, 530],
                ['player', 'worker', 660, 530],
                ['player', 'worker', 545, 415],
                ['player', 'worker', 620, 405],
                ['player', 'infantry', 650, 360],
                ['player', 'infantry', 680, 380],
                ['player', 'infantry', 710, 360],
                ['player', 'infantry', 740, 380],
                // Masts W, E, N; N is 282px from the start node, so it starts linked.
                ['neutral', 'relay-mast', 150, 600],
                ['neutral', 'relay-mast', 1050, 600],
                ['neutral', 'relay-mast', 600, 200],
            ],
            links: [[1, 2]],
        },
        ore: [
            [330, 400, 1500],
            [870, 400, 1500],
            [420, 250, 1500],
        ],
        burrows: [
            [100, 200],
            [1100, 200],
        ],
        // ponytail: dressing spots are a first guess; only the bunker position comes from the design doc
        decals: [
            ['neutral.kepler-bunker', 140, 420],
            ['decal.crater-large', 820, 250],
            ['decal.rocks', 300, 540],
            ['decal.rover-wreck', 960, 470],
        ],
        waves: { firstMs: 150000, everyMs: 75000, base: 3, perMin: 2.0, disturbance: 0.1, roster: { skitter: 0.7, weaver: 0.3 }, cap: 40 },
        climaxes: [{ id: 'uplink', objectiveId: 'masts', mults: [1.5], target: 'weakest-link' }],
        // 180s hold, climax armed at 120s held: the uplink can't finish before the first interval wave.
        objectives: [{ id: 'masts', kind: 'power', of: 'relay-mast', count: 3, ms: 180000, armMs: 120000 }],
        loseIfLost: ['core'],
        story: [
            { id: 'm2.beat.weaver', on: 'first-weaver' },
            { id: 'm2.beat.first_husk', on: 'first-husk' },
            { id: 'm2.beat.link_cut', on: 'first-link-cut' },
            { id: 'm2.beat.bunker', on: { enter: [140, 420] }, point: [140, 420], log: 'log.kepler-bunker' },
        ],
        hints: [
            { id: 'm2.hint.nodes', on: { atMs: 10000 }, point: [150, 600] },
            { id: 'm2.hint.repair', on: 'first-link-cut' },
            { id: 'm2.hint.haul', on: 'first-husk' },
        ],
        doctrines: ['hardline_grid', 'long_relays'],
        builds: ['barracks', 'power-node', 'turret'],
        hud: ['marrow', 'links'],
    },
    // Design 9 M3: the Spire has grown through the drill rig; its Veinfield raises your dead as Hollows.
    m3: {
        id: 'm3',
        title: 'Specimen',
        briefing: 'm3.briefing',
        map: { width: 1200, height: 760 },
        ambient: { tint: 0x8a90a0 },
        start: {
            ore: 400,
            entities: [
                ['player', 'core', 280, 420],
                ['player', 'power-node', 390, 450],
                ['player', 'barracks', 390, 320],
                ['player', 'turret', 500, 360],
                ['player', 'turret', 500, 520],
                ['player', 'worker', 225, 360],
                ['player', 'worker', 225, 480],
                ['player', 'worker', 330, 505],
                ['player', 'worker', 200, 420],
                ['player', 'worker', 330, 370],
                ['player', 'infantry', 430, 390],
                ['player', 'infantry', 430, 440],
                ['player', 'infantry', 460, 415],
                ['player', 'infantry', 490, 390],
                ['player', 'infantry', 490, 440],
                ['player', 'infantry', 520, 415],
                // The first specimens, idle by the rig and ~220px from the Sentries (out of their reach), so the player has to go and get them.
                ['enemy', 'skitter', 720, 370],
                ['enemy', 'skitter', 715, 420],
                ['enemy', 'skitter', 720, 470],
                ['enemy', 'tendril-spire', 760, 420],
                // Bonus: Okafor's empty drone at the edge of the Veinfield (~190px from the Spire).
                ['neutral', 'okafor-drone', 700, 240],
            ],
            // Barracks and both Sentries use 3 of the Node's 4 slots, leaving one for the Lab.
            links: [
                [1, 2],
                [1, 3],
                [1, 4],
            ],
        },
        ore: [
            [110, 200, 1500],
            [100, 650, 1500],
            [640, 230, 1500],
            [660, 560, 1500],
        ],
        burrows: [
            [1080, 250],
            [1090, 630],
        ],
        decals: [
            ['neutral.drill-rig', 760, 420],
            ['decal.crater-large', 900, 470],
            ['decal.crater-small', 540, 300],
            ['decal.rocks', 200, 560],
            ['decal.frost', 470, 210],
            ['decal.rover-wreck', 960, 360],
        ],
        waves: { firstMs: 120000, everyMs: 75000, base: 5, perMin: 3.0, disturbance: 0.2, roster: { skitter: 0.8, weaver: 0.2 }, cap: 45 },
        // The fork's retaliation ramps on the Lab and replaces the interval waves (afterSpawn pushes them back).
        climaxes: [{ id: 'retaliation', objectiveId: 'fork', mults: [1, 1.25, 1.5], gapMs: 45000, minMinutes: 4, target: 'xeno-lab' }],
        objectives: [
            { id: 'lab', kind: 'build', unit: 'xeno-lab' },
            { id: 'specimens', kind: 'specimens', species: 'skitter', count: 3 },
            { id: 'fork', kind: 'fork', species: 'skitter' },
            { id: 'retaliation', kind: 'survive', after: 'fork', ms: 120000 },
        ],
        loseIfLost: ['core', 'xeno-lab'],
        story: [
            { id: 'm3.beat.spire', on: { atMs: 5000 }, point: [760, 420] },
            { id: 'm3.beat.drone', on: { enter: [700, 240] }, point: [700, 240] },
            { id: 'm3.beat.hollow', on: 'first-hollow' },
            { id: 'm3.beat.dissection', on: 'dissected' },
            { id: 'm3.beat.retaliation', on: 'retaliation#0' },
            { id: 'bloom.25', on: 'bloom-25' },
            { id: 'bloom.50', on: 'bloom-50' },
        ],
        hints: [
            { id: 'm3.hint.lab', on: { atMs: 10000 } },
            { id: 'm3.hint.purge', on: 'fork' },
            { id: 'm3.hint.wreck', on: 'first-wreck' },
        ],
        doctrines: ['cryo_sterilization', 'marrow_sutures'],
        builds: ['barracks', 'power-node', 'turret', 'xeno-lab'],
        hud: ['marrow', 'links', 'bloom'],
    },
    // Design 9 M4 layout sheet: the first scrolling map. The base Spire feeds both Cysts; the lone Outrider Spire
    // holds the two rich nodes on its Veinfield, on both Cyst wave lines.
    m4: {
        id: 'm4',
        title: 'Severance',
        briefing: 'm4.briefing',
        map: { width: 2000, height: 1200 },
        ambient: { tint: 0x9fb0c0 },
        start: {
            ore: 400,
            entities: [
                ['player', 'core', 300, 900],
                ['player', 'power-node', 420, 880],
                ['player', 'barracks', 400, 700],
                ['player', 'xeno-lab', 200, 700],
                ['player', 'worker', 250, 840],
                ['player', 'worker', 350, 840],
                ['player', 'worker', 240, 960],
                ['player', 'worker', 360, 960],
                ['player', 'worker', 300, 1010],
                ['player', 'infantry', 470, 790],
                ['player', 'infantry', 500, 820],
                ['player', 'infantry', 530, 790],
                ['player', 'infantry', 470, 850],
                ['player', 'infantry', 500, 880],
                ['player', 'infantry', 530, 850],
                ['player', 'raider', 560, 920],
                ['player', 'raider', 590, 950],
                // 17: the base Spire; 18, 19: Cyst A and Cyst B; 20, 21: its Tenders; 22: the Outrider Spire.
                ['enemy', 'tendril-spire', 1650, 330],
                ['enemy', 'brood-cyst', 1440, 280],
                ['enemy', 'brood-cyst', 1720, 560],
                ['enemy', 'tender', 1620, 400],
                ['enemy', 'tender', 1680, 400],
                ['enemy', 'tendril-spire', 780, 620],
                // Garrisons idle within 120px of each Cyst: 2 Stilts and 4 Skitters, so the map always holds 4 Stilt specimens.
                ['enemy', 'stilt', 1360, 330],
                ['enemy', 'stilt', 1500, 360],
                ['enemy', 'skitter', 1380, 230],
                ['enemy', 'skitter', 1420, 350],
                ['enemy', 'skitter', 1500, 220],
                ['enemy', 'skitter', 1340, 280],
                ['enemy', 'stilt', 1640, 620],
                ['enemy', 'stilt', 1790, 630],
                ['enemy', 'skitter', 1650, 520],
                ['enemy', 'skitter', 1800, 520],
                ['enemy', 'skitter', 1700, 660],
                ['enemy', 'skitter', 1760, 470],
            ],
            // A link takes its source's owner, so the Spire->Cyst veins are enemy links.
            links: [
                [1, 2],
                [1, 3],
                [17, 18],
                [17, 19],
            ],
        },
        ore: [
            [60, 720, 1500],
            [60, 1060, 1500],
            [350, 1170, 1500],
            [860, 500, 2500],
            [700, 760, 2500],
        ],
        // W1 rises inside your expansion (the Outrider's Grief), W2 behind your assault (Cyst and base Spire Grief).
        burrows: [
            [980, 1080],
            [1900, 1000],
        ],
        // ponytail: rim spacing is a first guess; tune the cliff width on the contact page
        decals: [
            ...[200, 600, 1000, 1400, 1800].flatMap((x) => [
                ['decal.cliff-edge', x, 30, 0],
                ['decal.cliff-edge', x, 1170, 180],
            ]),
            ...[200, 600, 1000].flatMap((y) => [
                ['decal.cliff-edge', 30, y, -90],
                ['decal.cliff-edge', 1970, y, 90],
            ]),
            ['decal.frost', 1180, 860],
            ['decal.rocks', 620, 1040],
        ],
        waves: { firstMs: 150000, everyMs: 75000, base: 7, perMin: 3.5, disturbance: 0.2, roster: { skitter: 0.5, stilt: 0.35, weaver: 0.15 }, cap: 60 },
        // If both Cysts still stand at 10:00, a x2 Tide rises from every burrow in place of that interval wave.
        climaxes: [{ id: 'tide', atMs: 600000, mults: [2], target: 'core', unlessKilled: 'brood-cyst', beat: 'm4.beat.tide' }],
        objectives: [
            { id: 'cysts', kind: 'destroy', unit: 'brood-cyst' },
            { id: 'fork', kind: 'fork', species: 'stilt' },
        ],
        loseIfLost: ['core'],
        story: [
            { id: 'm4.beat.caldera', on: { atMs: 5000 }, point: [1650, 330] },
            { id: 'm4.beat.stilt', on: 'first-stilt' },
            { id: 'm4.beat.sever', on: 'first-sever' },
            { id: 'm4.beat.swell', on: 'first-swell' },
            // A real call on the channel shut down at Seven, so it always carries a locator: burrow W1.
            { id: 'm4.beat.okafor', on: { atMs: 240000 }, point: [980, 1080] },
            { id: 'm4.beat.okafor_reply', on: { atMs: 245000 }, point: [980, 1080] },
            { id: 'm4.beat.tide', on: { atMs: 560000 }, point: [1440, 280] },
            { id: 'bloom.25', on: 'bloom-25' },
            { id: 'bloom.50', on: 'bloom-50' },
        ],
        hints: [
            { id: 'm4.hint.camera', on: { atMs: 8000 } },
            { id: 'm4.hint.sever', on: { atMs: 20000 }, point: [1545, 305] },
            { id: 'm4.hint.emp', on: 'first-sever' },
            { id: 'm4.hint.swell', on: 'first-swell' },
            { id: 'm4.hint.outrider', on: { atMs: 45000 }, point: [780, 620] },
        ],
        doctrines: ['sever_charges', 'living_rounds'],
        builds: ['barracks', 'power-node', 'turret', 'xeno-lab'],
        hud: ['marrow', 'links', 'bloom'],
    },
    // Design 9 M5: the full v1 base. Each Spire feeds 4 structures within 320px: a vein to the Cradle, a Cyst, and
    // Weeping Spines (north) or the Gestation Pit and a Spine (south). Nodes run out, so a Silo forward matters.
    // ponytail: the design gives no M5 coordinate sheet; this layout is a first guess shaped like M4's
    m5: {
        id: 'm5',
        title: 'Iron Psalm',
        briefing: 'm5.briefing',
        map: { width: 2400, height: 1400 },
        ambient: { tint: 0xb0b0bc },
        start: {
            ore: 450,
            entities: [
                ['player', 'core', 300, 1120],
                ['player', 'power-node', 430, 1100],
                ['player', 'power-node', 300, 880],
                ['player', 'barracks', 440, 900],
                ['player', 'xeno-lab', 170, 900],
                ['player', 'worker', 250, 1060],
                ['player', 'worker', 350, 1060],
                ['player', 'worker', 240, 1180],
                ['player', 'worker', 360, 1180],
                ['player', 'worker', 300, 1230],
                ['player', 'worker', 200, 1120],
                ['player', 'infantry', 520, 1000],
                ['player', 'infantry', 550, 1030],
                ['player', 'infantry', 580, 1000],
                ['player', 'infantry', 520, 1060],
                ['player', 'infantry', 550, 1090],
                ['player', 'infantry', 580, 1060],
                ['player', 'raider', 620, 1120],
                ['player', 'raider', 650, 1150],
                // 19 the Cradle; 20, 21 Spires N and S; 22, 23 Cysts A and B; 24 the Pit; 25-27 Weeping Spines; 28, 29 Tenders.
                ['enemy', 'cradle', 2050, 350],
                ['enemy', 'tendril-spire', 1780, 250],
                ['enemy', 'tendril-spire', 2000, 620],
                ['enemy', 'brood-cyst', 1600, 400],
                ['enemy', 'brood-cyst', 1750, 760],
                ['enemy', 'gestation-pit', 2250, 560],
                ['enemy', 'weeping-spine', 1860, 400],
                ['enemy', 'weeping-spine', 2020, 150],
                ['enemy', 'weeping-spine', 1900, 560],
                ['enemy', 'tender', 2000, 430],
                ['enemy', 'tender', 2100, 430],
                // Cyst garrisons (design 6): 2 Stilts and 4 Skitters idle within 120px of each.
                ['enemy', 'stilt', 1520, 450],
                ['enemy', 'stilt', 1660, 480],
                ['enemy', 'skitter', 1530, 350],
                ['enemy', 'skitter', 1600, 490],
                ['enemy', 'skitter', 1680, 350],
                ['enemy', 'skitter', 1540, 420],
                ['enemy', 'stilt', 1660, 800],
                ['enemy', 'stilt', 1820, 830],
                ['enemy', 'skitter', 1680, 700],
                ['enemy', 'skitter', 1830, 700],
                ['enemy', 'skitter', 1760, 850],
                ['enemy', 'skitter', 1700, 830],
            ],
            links: [
                [1, 2],
                [2, 3],
                [2, 4],
                [20, 19],
                [21, 19],
                [20, 22],
                [20, 25],
                [20, 26],
                [21, 23],
                [21, 24],
                [21, 27],
            ],
        },
        ore: [
            [60, 1000, 1500],
            [80, 1300, 1500],
            [560, 1300, 1500],
            [1000, 750, 1500],
            [1100, 1050, 1500],
            [1300, 1180, 1500],
        ],
        burrows: [
            [1000, 1330],
            [2300, 1250],
            [1300, 90],
        ],
        // ponytail: dressing spots are a first guess
        decals: [
            ['decal.rocks', 800, 420],
            ['decal.crater-large', 1350, 700],
            ['decal.frost', 620, 620],
            ['decal.crater-small', 1550, 1200],
            ['decal.rocks', 2200, 1000],
            ['decal.frost', 1750, 1150],
        ],
        waves: { firstMs: 150000, everyMs: 75000, base: 10, perMin: 3.5, disturbance: 0.2, roster: { skitter: 0.4, stilt: 0.3, mourner: 0.2, weaver: 0.1 }, cap: 80 },
        // Below 50% the Cradle arms a x2 climax from every burrow, 8s of silence later; it stays closed until 20s after.
        climaxes: [{ id: 'climax', objectiveId: 'cradle', mults: [2], target: 'core' }],
        objectives: [{ id: 'cradle', kind: 'destroy', unit: 'cradle' }],
        loseIfLost: ['core'],
        story: [
            { id: 'm5.beat.cradle', on: { atMs: 5000 }, point: [2050, 350] },
            { id: 'm5.beat.ribs', on: 'first-ribs' },
            // Real Okafor calls carry a map point: the Pit, then the Cradle.
            { id: 'm5.beat.mourner', on: 'first-mourner' },
            { id: 'm5.beat.open', on: 'ribs-open' },
            { id: 'm5.beat.silence', on: 'cradle-half', point: [2050, 350] },
            { id: 'm5.beat.fold', on: 'cradle-fold' },
            { id: 'bloom.25', on: 'bloom-25' },
            { id: 'bloom.50', on: 'bloom-50' },
        ],
        hints: [
            { id: 'm5.hint.factory', on: { atMs: 10000 } },
            { id: 'm5.hint.silo', on: { atMs: 40000 }, point: [1100, 1050] },
            { id: 'm5.hint.armory', on: { atMs: 120000 } },
            { id: 'm5.hint.ribs', on: 'first-ribs' },
            { id: 'm5.hint.mourner', on: 'first-mourner' },
        ],
        builds: ['barracks', 'power-node', 'turret', 'xeno-lab', 'factory', 'armory', 'ferrite-silo'],
        hud: ['marrow', 'links', 'bloom'],
    },
    // The menu's Skirmish (Card 5B): the old prototype's player base against a Hush base, endless waves every 60s from
    // 2:00, won by killing the Cradle. No story, so it needs no TEXT; it plays on M5 rules with everything unlocked.
    // ponytail: Hush layout and wave numbers are a first guess, tuned only by the headless rush check
    skirmish: {
        id: 'skirmish',
        title: 'Skirmish',
        briefing: '',
        map: { width: 1200, height: 760 },
        ambient: { tint: 0xb0b0bc },
        start: {
            ore: 300,
            entities: [
                ['player', 'core', 170, 380],
                ['player', 'power-node', 258, 380],
                ['player', 'barracks', 320, 270],
                ['player', 'factory', 338, 500],
                ['player', 'turret', 462, 346],
                ['player', 'turret', 248, 526],
                ['player', 'worker', 128, 338],
                ['player', 'worker', 128, 418],
                ['player', 'infantry', 408, 344],
                ['player', 'raider', 408, 424],
                ['player', 'heavy', 368, 382],
                ['player', 'infantry', 386, 340],
                // 12 the Cradle; 13 the Spire that feeds it and both Cysts; 14, 15 Cysts A and B; 16, 17 Tenders.
                ['enemy', 'cradle', 1100, 380],
                ['enemy', 'tendril-spire', 980, 380],
                ['enemy', 'brood-cyst', 930, 220],
                ['enemy', 'brood-cyst', 930, 540],
                ['enemy', 'tender', 1060, 300],
                ['enemy', 'tender', 1060, 460],
                // Cyst garrisons (design 6): 2 Stilts and 4 Skitters idle within 120px of each.
                ['enemy', 'stilt', 860, 250],
                ['enemy', 'stilt', 1000, 260],
                ['enemy', 'skitter', 870, 180],
                ['enemy', 'skitter', 990, 180],
                ['enemy', 'skitter', 930, 300],
                ['enemy', 'skitter', 850, 210],
                ['enemy', 'stilt', 860, 510],
                ['enemy', 'stilt', 1000, 500],
                ['enemy', 'skitter', 870, 575],
                ['enemy', 'skitter', 990, 580],
                ['enemy', 'skitter', 930, 460],
                ['enemy', 'skitter', 850, 540],
            ],
            links: [
                [1, 2],
                [1, 3],
                [1, 4],
                [1, 5],
                [13, 12],
                [13, 14],
                [13, 15],
            ],
        },
        ore: [
            [82, 382, 1500],
            [100, 200, 1500],
            [90, 620, 1500],
            [600, 380, 1500],
        ],
        burrows: [
            [1150, 180],
            [1150, 620],
        ],
        decals: [
            ['decal.crater-large', 640, 230],
            ['decal.rocks', 560, 560],
            ['decal.frost', 760, 420],
        ],
        waves: { firstMs: 120000, everyMs: 60000, base: 5, perMin: 3, disturbance: 0.2, roster: { skitter: 0.5, stilt: 0.35, weaver: 0.15 }, cap: 60 },
        // M5's finale: below 50% the Cradle closes and calls a x2 wave from both burrows, budgeted as if at least 10:00 in,
        // so a fast push still has to hold it.
        climaxes: [{ id: 'climax', objectiveId: 'cradle', mults: [2], minMinutes: 10, target: 'core' }],
        objectives: [{ id: 'cradle', kind: 'destroy', unit: 'cradle' }],
        loseIfLost: ['core'],
        story: [],
        hints: [],
        builds: ['barracks', 'power-node', 'turret', 'xeno-lab', 'factory', 'armory', 'ferrite-silo'],
        hud: ['marrow', 'links', 'bloom'],
    },
};
// The climax target: the Relay Mast with the fewest live feeds (ties: the lowest id).
export function weakestMast(state) {
    const feeds = (mast) => state.powerLinks.filter((link) => link.toId === mast.id && link.disabledMs <= 0).length;
    return state.entities.filter((entity) => entity.kind === 'relay-mast').sort((a, b) => feeds(a) - feeds(b) || (a.id < b.id ? -1 : 1))[0];
}
// Campaign order; a row is playable once its MissionDef exists and the mission before it is won.
export const CAMPAIGN = ['m1', 'm2', 'm3', 'm4', 'm5'];
// A survive objective with no `after` is the mission's deadline; without one the clock counts up.
export function missionEndMs(mission) {
    const survive = mission.objectives.find((objective) => objective.kind === 'survive' && !objective.after);
    return survive?.kind === 'survive' ? survive.ms : 3600000;
}
export function waveBudget(w, minutes, mined, difficulty, retries, bloom = 0) {
    return (w.base + w.perMin * minutes + (w.disturbance * mined) / 100) * DIFFICULTY_MULT[difficulty] * Math.max(0.7, 1 - 0.1 * retries) * (1 + bloom / 200);
}
// Most expensive first, each kind buys round(share x budget / price) capped by the points left;
// the leftover buys Skitters; the total is capped at room (expensive units kept first). No RNG.
export function spendBudget(budget, roster, room) {
    const price = (kind) => WAVE_PRICE[kind] ?? 2;
    const kinds = Object.keys(roster).sort((a, b) => price(b) - price(a));
    if (!kinds.includes('skitter'))
        kinds.push('skitter');
    const bought = {};
    let points = budget;
    for (const kind of kinds) {
        const n = Math.min(Math.round(((roster[kind] ?? 0) * budget) / price(kind)), Math.floor(points / price(kind) + 1e-9));
        bought[kind] = n;
        points -= n * price(kind);
    }
    bought.skitter = (bought.skitter ?? 0) + Math.floor(points / price('skitter') + 1e-9);
    return capRoster(bought, room);
}
// Caps a roster at room units, most expensive kept first (an interval wave, or a Cyst's held brood on release).
export function capRoster(roster, room) {
    const price = (kind) => WAVE_PRICE[kind] ?? 2;
    const out = {};
    let left = Math.max(0, room);
    for (const kind of Object.keys(roster).sort((a, b) => price(b) - price(a))) {
        const n = Math.min(roster[kind] ?? 0, left);
        left -= n;
        if (n > 0)
            out[kind] = n;
    }
    return out;
}
// The next interval wave or pending climax. Climaxes win ties, so they replace the wave they collide with.
// An objective climax lands 8000ms after its objective arms (one full silence).
export function nextSpawn(mission, nextWaveMs, fired, objectives) {
    let next = { atMs: nextWaveMs, kind: 'wave', mult: 1 };
    for (const climax of mission.climaxes) {
        const started = objectives?.find((objective) => objective.id === climax.objectiveId)?.startedMs;
        const at = climax.atMs ?? (started === undefined ? undefined : started + 8000);
        if (at === undefined)
            continue;
        climax.mults.forEach((mult, i) => {
            const atMs = at + i * (climax.gapMs ?? 0);
            const fireId = `${climax.id}#${i}`;
            if (!fired.includes(fireId) && atMs <= next.atMs)
                next = { atMs, kind: climax.id, mult, fireId, target: climax.target };
        });
    }
    return next;
}
export function afterSpawn(mission, spawn, match) {
    if (!spawn.fireId) {
        match.nextWaveMs += mission.waves.everyMs;
        return;
    }
    match.fired.push(spawn.fireId);
    match.nextWaveMs = Math.max(match.nextWaveMs, spawn.atMs + mission.waves.everyMs);
}
// Over-cap units are trimmed from interval waves only, never from climaxes.
export function waveUnits(mission, spawn, mined, difficulty, retries, room, bloom = 0) {
    const floor = mission.climaxes.find((climax) => climax.id === spawn.kind)?.minMinutes ?? 0;
    const budget = waveBudget(mission.waves, Math.max(spawn.atMs / 60000, floor), mined, difficulty, retries, bloom) * spawn.mult;
    return spendBudget(budget, mission.waves.roster, spawn.fireId ? Infinity : room);
}
// The whole mission's spawns without running the sim; the design's wave counts come from it.
export function waveSchedule(mission, minedPerMin, difficulty = 'medium') {
    const match = { nextWaveMs: mission.waves.firstMs, fired: [] };
    const out = [];
    for (let spawn = nextSpawn(mission, match.nextWaveMs, match.fired); spawn.atMs < missionEndMs(mission); spawn = nextSpawn(mission, match.nextWaveMs, match.fired)) {
        out.push({ atMs: spawn.atMs, kind: spawn.kind, units: waveUnits(mission, spawn, (minedPerMin * spawn.atMs) / 60000, difficulty, 0, mission.waves.cap) });
        afterSpawn(mission, spawn, match);
    }
    return out;
}
// Disturbance made audible: the drone, the veins, the burrows and the seismograph all beat at this tempo.
export function heartbeatMs(mined) {
    return Math.max(800, 1600 - 0.16 * mined);
}
export function clockText(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(totalSeconds / 60)}:${`${totalSeconds % 60}`.padStart(2, '0')}`;
}
// Live HUD labels ("Lift cargo 1240/2000", "Lift 3:12", "Uplink held 47/180s", "Specimens 1/3").
export function objectiveLabels(state, mission) {
    return mission.objectives.map((objective) => {
        const live = state.match.objectives?.find((item) => item.id === objective.id);
        const label = (() => {
            if (objective.kind === 'cargo')
                return `Lift cargo ${Math.floor(state.players.player.ore)}/${objective.amount[state.match.difficulty]}`;
            if (objective.kind === 'power')
                return `Uplink held ${Math.floor((live?.progressMs ?? 0) / 1000)}/${objective.ms / 1000}s`;
            if (objective.kind === 'build')
                return `Build ${roleFor(objective.unit)}`;
            if (objective.kind === 'specimens')
                return `Specimens ${Math.min(objective.count, state.players.player.specimens[objective.species] ?? 0)}/${objective.count}`;
            if (objective.kind === 'fork')
                return `Dissect: ${roleFor(objective.species, 'enemy')}`;
            if (objective.kind === 'destroy') {
                const placed = mission.start.entities.filter(([owner, kind]) => owner === 'enemy' && kind === objective.unit).length;
                const living = state.entities.filter((entity) => entity.owner === 'enemy' && entity.kind === objective.unit && entity.hp > 0).length;
                return `${roleFor(objective.unit, 'enemy')}${placed > 1 ? 's' : ''} ${placed - living}/${placed}`;
            }
            if (objective.after)
                return `Survive ${clockText(objective.ms - (live?.progressMs ?? 0))}`;
            return `Lift ${clockText(objective.ms - state.timeMs)}`;
        })();
        return { id: objective.id, done: live?.done ?? false, label };
    });
}
// Where the HUD cue points: the first undone objective with a target, a specimens objective's husk nearest the Core,
// or a destroy objective's living target nearest the Core.
// ponytail: one cue at a time, so "each Cyst a target" rings the nearer Cyst until it dies
export function objectiveTarget(state, mission) {
    const done = (id) => state.match.objectives?.find((live) => live.id === id)?.done;
    const objective = mission.objectives.find((item) => (item.target || item.kind === 'specimens' || item.kind === 'destroy') && !done(item.id));
    const core = state.entities.find((entity) => entity.owner === 'player' && entity.kind === 'core') ?? { x: 0, y: 0 };
    const away = (entity) => (entity.x - core.x) ** 2 + (entity.y - core.y) ** 2;
    if (objective?.kind === 'specimens') {
        return state.entities.filter((entity) => entity.kind === 'husk' && entity.sourceKind === objective.species).sort((a, b) => away(a) - away(b))[0];
    }
    if (objective?.kind === 'destroy') {
        return state.entities.filter((entity) => entity.owner === 'enemy' && entity.kind === objective.unit && entity.hp > 0).sort((a, b) => away(a) - away(b))[0];
    }
    return objective?.target && { x: objective.target[0], y: objective.target[1] };
}
// Rebuilds the state and replays the logged commands at the times they were applied.
// ponytail: no download or viewer until someone asks
export function runReplay(input, untilMs) {
    let state = createInitialStateWithOptions(input);
    let next = 0;
    for (;;) {
        while (next < input.log.length && input.log[next][0] <= state.timeMs)
            state = issueSmartCommand(state, input.log[next++][1]);
        if (state.timeMs >= untilMs || state.match.phase === 'complete')
            return state;
        state = tickSimulation(state, 50);
    }
}
const DIFFICULTIES = ['easy', 'medium', 'hard'];
export function emptyProgress() {
    return { version: 1, missions: {}, forks: {}, seenHints: [], difficulty: 'medium' };
}
// Bad JSON or a wrong version gives an empty save; unknown missions and fields are dropped.
export function parseProgress(raw) {
    const out = emptyProgress();
    let data;
    try {
        data = JSON.parse(raw ?? '');
    }
    catch {
        return out;
    }
    if (!data || typeof data !== 'object' || data.version !== 1)
        return out;
    if (DIFFICULTIES.includes(data.difficulty))
        out.difficulty = data.difficulty;
    if (Array.isArray(data.seenHints))
        out.seenHints = data.seenHints.filter((id) => typeof id === 'string');
    for (const [species, side] of Object.entries(data.forks ?? {})) {
        if (side === 'harness' || side === 'counter')
            out.forks[species] = side;
    }
    for (const [id, value] of Object.entries(data.missions ?? {})) {
        if (!MISSIONS[id] || !value || typeof value !== 'object')
            continue;
        const record = value;
        const best = {};
        for (const difficulty of DIFFICULTIES) {
            const entry = record.best?.[difficulty];
            if (entry && typeof entry.ms === 'number' && typeof entry.lost === 'number')
                best[difficulty] = { ms: entry.ms, lost: entry.lost };
        }
        out.missions[id] = {
            won: record.won === true,
            bloomNet: typeof record.bloomNet === 'number' ? record.bloomNet : 0,
            retries: typeof record.retries === 'number' ? record.retries : 0,
            ...(typeof record.doctrine === 'string' ? { doctrine: record.doctrine } : {}),
            ...(Object.keys(best).length > 0 ? { best } : {}),
        };
    }
    return out;
}
export function serializeProgress(progress) {
    return JSON.stringify(progress);
}
// Bloom records (design 5): campaign Bloom is the sum of the mission records; a mission starts at the sum of
// the records before it, so a replay never counts its own old record. The skirmish has none before it.
export function campaignBloom(progress, beforeId) {
    const ids = beforeId ? CAMPAIGN.slice(0, Math.max(0, CAMPAIGN.indexOf(beforeId))) : CAMPAIGN;
    return ids.reduce((sum, id) => sum + (progress.missions[id]?.bloomNet ?? 0), 0);
}
// Graft-side doctrines add +5 to their mission's record when picked.
const GRAFT_DOCTRINES = ['marrow_sutures', 'living_rounds'];
const graftBloom = (doctrine) => (doctrine && GRAFT_DOCTRINES.includes(doctrine) ? 5 : 0);
// Re-picking swaps the graft bonus instead of stacking it.
export function pickDoctrine(progress, id, doctrine) {
    const record = progress.missions[id] ?? { won: true, bloomNet: 0, retries: 0 };
    const bloomNet = record.bloomNet - graftBloom(record.doctrine) + graftBloom(doctrine);
    return { ...progress, missions: { ...progress.missions, [id]: { ...record, doctrine, bloomNet } } };
}
// Saved forks pre-load like doctrines, but only into missions after the one that picks them.
export function forkResearch(progress, missionId) {
    return Object.entries(progress.forks).flatMap(([species, side]) => {
        const from = FORKS[species];
        return from && CAMPAIGN.indexOf(from) < CAMPAIGN.indexOf(missionId) ? [`${side}-${species}`] : [];
    });
}
// A win updates best when faster and overwrites this mission's Bloom record and fork; hints fire once per save.
export function recordResult(progress, state) {
    const id = state.match.missionId;
    if (!id)
        return progress;
    const record = progress.missions[id] ? { ...progress.missions[id] } : { won: false, bloomNet: 0, retries: 0 };
    record.retries = state.match.retries;
    const forks = { ...progress.forks };
    if (state.winner === 'player') {
        record.won = true;
        const best = record.best?.[state.match.difficulty];
        if (!best || state.timeMs < best.ms)
            record.best = { ...record.best, [state.match.difficulty]: { ms: state.timeMs, lost: state.stats.playerUnitsLost } };
        record.bloomNet = state.players.player.bloom - campaignBloom(progress, id) + graftBloom(record.doctrine);
        for (const [species, mission] of Object.entries(FORKS)) {
            const side = ['harness', 'counter'].find((item) => state.players.player.researched.includes(`${item}-${species}`));
            if (mission === id && side)
                forks[species] = side;
        }
    }
    const hints = MISSIONS[id]?.hints.map((hint) => hint.id) ?? [];
    const seen = state.match.fired.filter((fired) => hints.includes(fired) && !progress.seenHints.includes(fired));
    return { ...progress, missions: { ...progress.missions, [id]: record }, forks, seenHints: [...progress.seenHints, ...seen] };
}
export function missionUnlocked(progress, id) {
    const index = CAMPAIGN.indexOf(id);
    return index === 0 || Boolean(progress.missions[CAMPAIGN[index - 1]]?.won);
}
// The ending by campaign Bloom (design 9 M5); TEXT ending.quiet / .static / .voices.
export function endingFor(bloom) {
    return bloom < 25 ? 'quiet' : bloom < 50 ? 'static' : 'new-voices';
}
// Portrait by mission (design 9.1): Varga-1 M1-M3, -2 M4, -3 M5; Okafor-1 M1-M2, -2 M3-M4, -3 M5; Aegis is text only.
export function portraitFor(speaker, missionId) {
    const n = Number(missionId?.slice(1)) || 1;
    if (speaker === 'varga')
        return `portrait/varga-${n <= 3 ? 1 : n === 4 ? 2 : 3}.jpg`;
    if (speaker === 'okafor')
        return `portrait/okafor-${n <= 2 ? 1 : n <= 4 ? 2 : 3}.jpg`;
    return undefined;
}
