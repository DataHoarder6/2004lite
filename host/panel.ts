// Host settings panel: DOM, outside the canvas (ADR-0008). Renders one section
// per plugin from its config schema; edits persist immediately.

import type { LoadedPlugin, PluginLoadError } from './loader.js';
import type { ConfigField, ConfigSchema } from '#api/config.js';

export class SettingsPanel {
    private root: HTMLElement | null = null;
    private readonly onPluginToggle: (id: string, enabled: boolean) => void;
    private readonly getSchema: (pluginId: string) => ConfigSchema | null;
    private readonly getFailures: () => PluginLoadError[];

    constructor(onPluginToggle: (id: string, enabled: boolean) => void, getSchema: (pluginId: string) => ConfigSchema | null, getFailures: () => PluginLoadError[] = () => []) {
        this.onPluginToggle = onPluginToggle;
        this.getSchema = getSchema;
        this.getFailures = getFailures;
    }

    mount(): void {
        if (this.root) {
            return;
        }
        const root = document.createElement('div');
        root.id = 'lite4-host-panel';
        this.applyStyles(root);
        root.innerHTML = `
            <div class="lite4-head">
                <span class="lite4-title">2004lite</span>
                <button class="lite4-close" type="button">&times;</button>
            </div>
            <div class="lite4-body"></div>
        `;
        root.querySelector('.lite4-close')!.addEventListener('click', () => this.hide());
        document.body.appendChild(root);
        this.root = root;
    }

    show(): void {
        this.mount();
        this.root!.style.display = 'block';
    }

    hide(): void {
        if (this.root) {
            this.root.style.display = 'none';
        }
    }

    toggle(): void {
        if (!this.root || this.root.style.display === 'none') {
            this.show();
        } else {
            this.hide();
        }
    }

    render(plugins: LoadedPlugin[]): void {
        if (!this.root) {
            return;
        }
        const body = this.root.querySelector('.lite4-body') as HTMLElement;
        body.innerHTML = '';

        if (plugins.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'lite4-note';
            empty.textContent = 'No plugins loaded.';
            body.appendChild(empty);
        }

        for (const loaded of plugins) {
            body.appendChild(this.renderPlugin(loaded));
        }

        for (const failure of this.getFailures()) {
            const row = document.createElement('div');
            row.className = 'lite4-plugin lite4-failed';
            const head = document.createElement('div');
            head.className = 'lite4-plugin-head';
            head.textContent = failure.id;
            row.appendChild(head);
            const err = document.createElement('div');
            err.className = 'lite4-error';
            err.textContent = `failed to load: ${failure.reason}`;
            row.appendChild(err);
            body.appendChild(row);
        }
    }

    private renderPlugin(loaded: LoadedPlugin): HTMLElement {
        const section = document.createElement('div');
        section.className = 'lite4-plugin';

        const head = document.createElement('div');
        head.className = 'lite4-plugin-head';

        const name = document.createElement('span');
        name.textContent = `${loaded.manifest.name} (${loaded.manifest.version})`;
        head.appendChild(name);

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = loaded.enabled;
        toggle.disabled = loaded.error !== null;
        toggle.addEventListener('change', () => {
            this.onPluginToggleInternal(loaded, toggle.checked);
        });
        head.appendChild(toggle);
        section.appendChild(head);

        if (loaded.error) {
            const err = document.createElement('div');
            err.className = 'lite4-error';
            err.textContent = `disabled after error: ${loaded.error}`;
            section.appendChild(err);
            return section;
        }

        const schema = this.getSchema(loaded.manifest.id);
        if (schema && schema.fields.length > 0) {
            for (const field of schema.fields) {
                section.appendChild(this.renderField(loaded, field));
            }
        } else {
            const note = document.createElement('div');
            note.className = 'lite4-note';
            note.textContent = 'no settings';
            section.appendChild(note);
        }

        return section;
    }

    private onPluginToggleInternal(loaded: LoadedPlugin, enabled: boolean): void {
        this.onPluginToggle(loaded.manifest.id, enabled);
        // re-render happens via host callback on state change
    }

    private renderField(loaded: LoadedPlugin, field: ConfigField): HTMLElement {
        const row = document.createElement('label');
        row.className = 'lite4-field';

        const current = () => {
            switch (field.type) {
                case 'boolean':
                    return loaded.context.config.get(field.key) as boolean;
                case 'number':
                    return loaded.context.config.get(field.key) as number;
                default:
                    return loaded.context.config.get(field.key) as string;
            }
        };

        const label = document.createElement('span');
        label.textContent = field.label;
        if (field.description) {
            label.title = field.description;
        }
        row.appendChild(label);

        let input: HTMLInputElement | HTMLSelectElement;
        if (field.type === 'boolean') {
            input = document.createElement('input');
            (input as HTMLInputElement).type = 'checkbox';
            (input as HTMLInputElement).checked = current() as boolean;
            input.addEventListener('change', () => {
                loaded.context.config.set(field.key, (input as HTMLInputElement).checked);
            });
        } else if (field.type === 'enum') {
            const select = document.createElement('select');
            for (const option of field.options) {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option;
                select.appendChild(opt);
            }
            select.value = current() as string;
            select.addEventListener('change', () => {
                loaded.context.config.set(field.key, select.value);
            });
            input = select;
        } else if (field.type === 'number') {
            input = document.createElement('input');
            (input as HTMLInputElement).type = 'number';
            (input as HTMLInputElement).value = String(current());
            if (field.min !== undefined) {
                (input as HTMLInputElement).min = String(field.min);
            }
            if (field.max !== undefined) {
                (input as HTMLInputElement).max = String(field.max);
            }
            input.addEventListener('change', () => {
                const value = Number((input as HTMLInputElement).value);
                if (!Number.isNaN(value)) {
                    loaded.context.config.set(field.key, value);
                }
            });
        } else if (field.type === 'string' && String(field.default).includes('\n')) {
            const area = document.createElement('textarea');
            area.rows = 4;
            area.value = current() as string;
            area.addEventListener('change', () => {
                loaded.context.config.set(field.key, area.value);
            });
            row.appendChild(area);
            return row;
        } else {
            input = document.createElement('input');
            (input as HTMLInputElement).type = 'text';
            (input as HTMLInputElement).value = current() as string;
            input.addEventListener('change', () => {
                loaded.context.config.set(field.key, (input as HTMLInputElement).value);
            });
        }
        row.appendChild(input);
        return row;
    }

    private applyStyles(root: HTMLElement): void {
        root.style.cssText = `
            display: none;
            position: fixed;
            top: 12px;
            right: 12px;
            width: 300px;
            max-height: 80vh;
            overflow-y: auto;
            background: #2b2620;
            color: #d8ccb4;
            border: 1px solid #55492f;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            z-index: 1000;
        `;
        const style = document.createElement('style');
        style.textContent = `
            #lite4-host-panel .lite4-head { display:flex; justify-content:space-between; align-items:center;
                padding:6px 8px; background:#1d1a15; border-bottom:1px solid #55492f; }
            #lite4-host-panel .lite4-title { font-weight:bold; color:#ffd700; }
            #lite4-host-panel .lite4-body { padding:8px; }
            #lite4-host-panel .lite4-plugin { margin-bottom:10px; padding:6px; background:#231f19;
                border:1px solid #3d3526; }
            #lite4-host-panel .lite4-plugin-head { display:flex; justify-content:space-between;
                align-items:center; margin-bottom:4px; font-weight:bold; }
            #lite4-host-panel .lite4-field { display:flex; justify-content:space-between; align-items:center;
                gap:8px; margin:3px 0; }
            #lite4-host-panel .lite4-error { color:#ff6b6b; }
            #lite4-host-panel .lite4-note { color:#8a7f68; }
        `;
        document.head.appendChild(style);
    }
}
