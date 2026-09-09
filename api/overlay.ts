// Facade overlay surface. Overlays draw on the game canvas after the game's
// draw pass (ADR-0004), in screen space (765x503 unless fullscreen).

export interface OverlayRenderContext {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    loopCycle: number;
}

export interface Overlay {
    /** Drawn every render frame while the plugin is enabled and in-game. */
    render(context: OverlayRenderContext): void;
}

/** Convenience: register a plain draw function as an overlay. */
export function overlay(render: (context: OverlayRenderContext) => void): Overlay {
    return { render };
}
