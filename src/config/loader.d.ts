import { Config } from './schema.js';
export declare function loadConfig(configPath?: string): Config;
export declare function getConfig(): Config;
export declare function getDefaultConfig(): Config;
export declare function updateConfig(updates: Partial<Config>): Config;
