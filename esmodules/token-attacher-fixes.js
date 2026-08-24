/**
 * Keeps Token Attacher formations moving in lockstep.
 *
 * Foundry's "Automatically Rotate Tokens" setting (core.tokenAutoRotate, enabled by default) writes a
 * rotation matching the direction of travel into every drag or arrow-key move. Token Attacher reads a
 * base rotation change as a rigid-body rotation, so it swings the attached tokens around the base
 * instead of translating them with it. Because the tokens in this module's scenes set lockRotation,
 * the base never appears to turn and the effect looks like the attachments orbiting on their own.
 *
 * Suppressing auto-rotation for the tokens taking part in an attachment fixes the movement without
 * touching the world setting, so tokens outside these scenes keep the GM's chosen behaviour.
 */

const TOKEN_ATTACHER_ID = "token-attacher";

Hooks.on("preMoveToken", (document, movement) => {
	if (!game.modules.get(TOKEN_ATTACHER_ID)?.active) return;
	const attachment = document.flags?.[TOKEN_ATTACHER_ID];
	if (attachment?.attached || attachment?.parent) movement.autoRotate = false;
});
