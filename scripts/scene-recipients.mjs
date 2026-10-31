// Shared scene recipients, including synthetic actors from unlinked tokens.
export function sceneTagRecipientsShared(scene, user = game.user) {
  const actors = new Map();
  for (const token of scene?.tokens?.contents ?? []) {
    const actor = token.actor;
    if (!actor || (!user.isGM && token.hidden) || !["character", "litm-character", "litm-npc"].includes(actor.type)
        || !Array.isArray(actor.system.floatingTagsAndStatuses)) continue;
    actors.set(actor.uuid, actor);
  }
  return [...actors.values()].sort((a, b) => a.name.localeCompare(b.name));
}

