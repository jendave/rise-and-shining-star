/**
 * Restores the persistent Sequencer effects that belong to this module's adventures.
 *
 * Sequencer 4.x keeps persistent effects in a world-level JournalEntry named "sequencerDatabase"
 * rather than on the Scene or its Tokens, so an Adventure compendium cannot carry them. This module
 * writes the baked-in effect data into that journal entry once the adventure's documents exist.
 *
 * Sequencer owns that journal entry: it creates it during its own "ready" handler and caches the id.
 * Creating it ourselves races Sequencer's check-then-create and can leave the world with two entries
 * of the same name, in which case Sequencer caches the empty one and reads no effects at all. So we
 * only ever write to an entry Sequencer has already made, and we hang the work off Sequencer's own
 * ready hook, which fires after the database exists and once per canvas load.
 */

import { WIND_CITY_EFFECTS } from "./wind-city-effects.js";

const MODULE_ID = "rise-and-shining-star";
const SEQUENCER_ID = "sequencer";
const SEQUENCER_DATABASE_NAME = "sequencerDatabase";
const EFFECTS_FLAG = `flags.${SEQUENCER_ID}.effects`;
const RESTORED_SETTING = "restoredEffects";

const ADVENTURE_EFFECTS = {
	eEQyRYPlSFCBgbqj: WIND_CITY_EFFECTS
};

let reloading = false;

Hooks.once("init", () => {
	game.settings.register(MODULE_ID, RESTORED_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});
});

Hooks.on("preImportAdventure", (adventure, options) => {
	const effects = ADVENTURE_EFFECTS[adventure.id];
	if (!effects) return;
	options.postImport.push(() => restoreEffects(adventure.id, effects));
});

/**
 * Cover the Quickstart path, which imports adventures server-side before any client connects and so
 * never fires the import hooks. Also repairs worlds that imported the adventure before this module
 * shipped. The recorded setting stops effects the GM has since deleted from being resurrected, and
 * `reloading` stops the re-read we trigger below from calling us straight back.
 */
Hooks.on("sequencerEffectManagerReady", async () => {
	if (!game.user.isGM || reloading) return;
	const restored = game.settings.get(MODULE_ID, RESTORED_SETTING);
	for (const [adventureId, effects] of Object.entries(ADVENTURE_EFFECTS)) {
		if (restored[adventureId]) continue;
		await restoreEffects(adventureId, effects);
	}
});

/**
 * Write an adventure's persistent effects into the Sequencer database journal entry.
 * @param {string} adventureId              The `_id` of the adventure the effects belong to.
 * @param {Record<string, Array>} effects   Effect data keyed by dash-encoded document UUID.
 * @returns {Promise<void>}
 */
async function restoreEffects(adventureId, effects) {
	if (!game.modules.get(SEQUENCER_ID)?.active) return;

	const database = game.journal.getName(SEQUENCER_DATABASE_NAME);
	if (!database) return;

	const applicable = filterResolvable(effects);
	if (foundry.utils.isEmpty(applicable)) return;

	await database.update({ [EFFECTS_FLAG]: applicable });

	const restored = foundry.utils.deepClone(game.settings.get(MODULE_ID, RESTORED_SETTING));
	restored[adventureId] = true;
	await game.settings.set(MODULE_ID, RESTORED_SETTING, restored);

	const count = Object.values(applicable).reduce((total, entries) => total + entries.length, 0);
	console.log(`${MODULE_ID} | Restored ${count} persistent Sequencer effect(s)`);

	await reloadPersistentEffects();
}

/**
 * Keep only the entries whose owning document is present in this world. Sequencer discards effects
 * whose UUID does not resolve, so writing entries for documents the GM chose not to import would
 * just be garbage collected.
 * @param {Record<string, Array>} effects   Effect data keyed by dash-encoded document UUID.
 * @returns {Record<string, Array>}
 */
function filterResolvable(effects) {
	const resolvable = {};
	for (const [key, entries] of Object.entries(effects)) {
		if (fromUuidSync(key.replaceAll("-", "."))) resolvable[key] = entries;
	}
	return resolvable;
}

/**
 * Make Sequencer re-read its database. Sequencer loads persistent effects once per canvas load and
 * does not watch the journal entry for changes, so without this the effects we just wrote would not
 * appear until the scene was reopened.
 * @returns {Promise<void>}
 */
async function reloadPersistentEffects() {
	if (!game.canvas?.ready) return;
	reloading = true;
	try {
		await Sequencer.EffectManager.initializePersistentEffects();
	} finally {
		reloading = false;
	}
}
