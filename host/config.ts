// Host config persistence: localStorage keyed per plugin (ADR-0008).

import type { ConfigField, ConfigSchema, ConfigStore, ConfigValues } from '#api/config.js';

const STORAGE_PREFIX = '2004lite:config:';

function storageKey(pluginId: string): string {
    return `${STORAGE_PREFIX}${pluginId}`;
}

export class PluginConfig implements ConfigStore {
    private values: ConfigValues;
    private schemaFields: ConfigField[] = [];

    constructor(private readonly pluginId: string) {
        this.values = this.read();
    }

    declare(fields: ConfigField[]): void {
        this.schemaFields = fields;
        // Drop stale persisted keys no longer in the schema; keep unknown-but-
        // declared ones untouched.
    }

    get<T extends boolean | number | string = boolean>(key: string): T {
        const field = this.field(key);
        const value = this.values[key];
        if (value === undefined) {
            return (field ? field.default : false) as T;
        }
        return value as T;
    }

    set(key: string, value: boolean | number | string): boolean {
        const field = this.field(key);
        if (!field) {
            return false;
        }
        if (field.type === 'boolean') {
            if (typeof value !== 'boolean') {
                return false;
            }
        } else if (field.type === 'number') {
            if (typeof value !== 'number') {
                return false;
            }
            if (field.min !== undefined && value < field.min) {
                return false;
            }
            if (field.max !== undefined && value > field.max) {
                return false;
            }
        } else if (field.type === 'enum') {
            if (typeof value !== 'string' || !field.options.includes(value)) {
                return false;
            }
        } else {
            if (typeof value !== 'string') {
                return false;
            }
        }
        this.values[key] = value;
        this.write();
        return true;
    }

    all(): ConfigValues {
        return { ...this.values };
    }

    schema(): ConfigSchema {
        return { pluginId: this.pluginId, fields: this.schemaFields };
    }

    /** Reset to schema defaults (used by the settings panel "Reset"). */
    reset(): void {
        this.values = {};
        for (const field of this.schemaFields) {
            this.values[field.key] = field.default;
        }
        this.write();
    }

    private field(key: string): ConfigField | undefined {
        return this.schemaFields.find(f => f.key === key);
    }

    private read(): ConfigValues {
        try {
            const raw = localStorage.getItem(storageKey(this.pluginId));
            return raw ? (JSON.parse(raw) as ConfigValues) : {};
        } catch {
            return {};
        }
    }

    private write(): void {
        try {
            localStorage.setItem(storageKey(this.pluginId), JSON.stringify(this.values));
        } catch {
            // private browsing / quota: values stay in-memory for this session
        }
    }
}
