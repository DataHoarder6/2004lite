// Facade packet-observer surface (ADR-0014, amending ADR-0005).
// Read-only parsed packets for debugging: direction + opcode name + size.
// Never carries full payloads (small-packet hex rides `hex`), and plugins
// can observe only — there is no send path here by design.

/** Packet direction, named per CONTEXT.md (Upstream/Downstream Packet). */
export type PacketDirection = 'upstream' | 'downstream';

export interface ParsedPacket {
    direction: PacketDirection;
    /** Numeric opcode on the wire. */
    opcode: number;
    /** Enum name (e.g. OBJ_ADD), `UNKNOWN-<id>` when unmapped. */
    name: string;
    /** Payload bytes, excluding opcode/length framing. */
    size: number;
    /** Extra tap context (e.g. entity counts on bulk packets). */
    note: string;
    /**
     * Hex of the payload when small (<=64B at the tap), null for bulk.
     * parsed fields are NOT decoded per-packet (out of scope, ADR-0014).
     */
    hex: string | null;
    loopCycle: number;
}

export type PacketHandler = (packet: ParsedPacket) => void;

export interface PacketBus {
    on(handler: PacketHandler): void;
    off(handler: PacketHandler): void;
}
