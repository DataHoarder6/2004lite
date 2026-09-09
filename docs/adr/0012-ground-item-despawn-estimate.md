# Ground-item despawn is a client estimate, not server truth

RuneLite trusts server-provided `TileItem.getDespawnTime/getVisibleTime`
ticks. The 2004 protocol (`OBJ_ADD/DEL/REVEAL/COUNT`) carries no durations,
while Engine-TS despawns per server rules (reveal 100t, durations 100/200/300
by source, merge resets). The client counts down a fixed 200-tick standard
loot window from first-seen (quantity merges reset it, mirroring the server),
with no private/public distinction. Exactness needs Engine-TS to send
durations (separate repo, future work). Labeled estimate so a future reader
doesn't mistake it for protocol data.
