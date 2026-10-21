// Which conversation an NPC talks with: the one authored on the map, else the default for its faction
// (data/adaptation/exploration/defaultConversations.json), else none. Resolved when the player picks Talk, so editing a
// faction's default needs no change to any map.
import defaults from '../data/adaptation/exploration/defaultConversations.json'

export const conversationIdFor = (npc) => npc?.conversationId || defaults.byFaction[npc?.faction] || null
