// Facade config schema surface. Plugins declare a schema; the host renders
// the settings panel and persists values in localStorage (ADR-0008).

export type ConfigType = 'boolean' | 'number' | 'string' | 'enum';

export interface ConfigFieldBase {
    key: string;
    label: string;
    description?: string;
}

export interface BooleanConfigField extends ConfigFieldBase {
    type: 'boolean';
    default: boolean;
}

export interface NumberConfigField extends ConfigFieldBase {
    type: 'number';
    default: number;
    min?: number;
    max?: number;
}

export interface StringConfigField extends ConfigFieldBase {
    type: 'string';
    default: string;
}

export interface EnumConfigField extends ConfigFieldBase {
    type: 'enum';
    default: string;
    options: string[];
}

export type ConfigField = BooleanConfigField | NumberConfigField | StringConfigField | EnumConfigField;

export type ConfigValues = Record<string, boolean | number | string>;

export interface ConfigStore {
    /** Current effective value for a key (schema default if unset). */
    get<T extends boolean | number | string = boolean>(key: string): T;
    /** Update a value; persists immediately. Returns false for unknown keys. */
    set(key: string, value: boolean | number | string): boolean;
    /** All current values, for rendering. */
    all(): ConfigValues;
}

export interface ConfigSchema {
    pluginId: string;
    fields: ConfigField[];
}
