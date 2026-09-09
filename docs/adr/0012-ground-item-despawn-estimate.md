# Ground-item despawn is a client estimate, not server truth

RuneLite trusts server-provided `TileItem.getDespawnTime/getVisibleTime`
ticks. The 2004 protocol (`OBJ_ADD/DEL/REVEAL/COUNT`) carries no durations,
while Engine-TS despawns per server rules (reveal 100t, durations 100/200/300
by source, merge resets). Exactness needs Engine-TS to send durations
(separate repo, future work). Labeled estimate so a future reader doesn't
mistake it for protocol data.

Windows: private-from-spawn stacks (own drops, killer loot) count the fixed
200-tick standard loot window from first-seen (quantity merges reset it,
mirroring the server). Reveal-origin stacks are matched to OBJ_REVEAL records
by world tile + id (`hostRevealed` drain in `Client.hostState`, 10-cycle TTL)
and count only their 100-tick public phase: a revealed stack is ~100 ticks
old already, so a fresh 200-tick window would over-read by the private phase.
