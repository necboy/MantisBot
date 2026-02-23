"use strict";
// src/config/loader.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.getConfig = getConfig;
exports.getDefaultConfig = getDefaultConfig;
exports.updateConfig = updateConfig;
const fs_1 = require("fs");
const path_1 = require("path");
const url_1 = require("url");
const schema_js_1 = require("./schema.js");
const __dirname = (0, path_1.dirname)((0, url_1.fileURLToPath)(import.meta.url));
let config = null;
function loadConfig(configPath) {
    const path = configPath || (0, path_1.join)(__dirname, '../../config/config.json');
    try {
        const content = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(content);
        config = schema_js_1.ConfigSchema.parse(parsed);
        return config;
    }
    catch (error) {
        console.warn('[Config] Failed to load config, using defaults:', error);
        config = getDefaultConfig();
        return config;
    }
}
function getConfig() {
    if (!config) {
        return loadConfig();
    }
    return config;
}
function getDefaultConfig() {
    return {
        server: {
            host: '0.0.0.0',
            port: 3000,
            cors: true,
            wsPath: '/ws',
        },
        models: [
            {
                name: 'default',
                type: 'minimax',
                model: 'abab6.5s-chat',
            },
        ],
        feishu: {
            enabled: false,
        },
        slack: {
            enabled: false,
        },
        plugins: [],
        memory: {
            enabled: true,
            vectorDimension: 1536,
        },
    };
}
function updateConfig(updates) {
    const current = getConfig();
    config = { ...current, ...updates };
    return config;
}
