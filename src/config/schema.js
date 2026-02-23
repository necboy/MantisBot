"use strict";
// src/config/schema.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = exports.PluginConfigSchema = exports.SlackConfigSchema = exports.FeishuConfigSchema = exports.ModelConfigSchema = exports.ServerConfigSchema = void 0;
const zod_1 = require("zod");
exports.ServerConfigSchema = zod_1.z.object({
    host: zod_1.z.string().default('0.0.0.0'),
    port: zod_1.z.number().default(3000),
    cors: zod_1.z.boolean().default(true),
    wsPath: zod_1.z.string().default('/ws'),
});
exports.ModelConfigSchema = zod_1.z.object({
    name: zod_1.z.string(),
    type: zod_1.z.enum(['openai', 'anthropic', 'minimax', 'custom']),
    model: zod_1.z.string(),
    apiKey: zod_1.z.string().optional(),
    baseUrl: zod_1.z.string().optional(),
});
exports.FeishuConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    appId: zod_1.z.string().optional(),
    appSecret: zod_1.z.string().optional(),
    verificationToken: zod_1.z.string().optional(),
    encryptKey: zod_1.z.string().optional(),
});
exports.SlackConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    botToken: zod_1.z.string().optional(),
    signingSecret: zod_1.z.string().optional(),
    appToken: zod_1.z.string().optional(),
});
exports.PluginConfigSchema = zod_1.z.object({
    name: zod_1.z.string(),
    enabled: zod_1.z.boolean().default(true),
    config: zod_1.z.record(zod_1.z.unknown()).optional(),
});
exports.ConfigSchema = zod_1.z.object({
    server: exports.ServerConfigSchema,
    models: zod_1.z.array(exports.ModelConfigSchema).min(1),
    defaultModel: zod_1.z.string().optional(),
    feishu: exports.FeishuConfigSchema.optional(),
    slack: exports.SlackConfigSchema.optional(),
    plugins: zod_1.z.array(exports.PluginConfigSchema).default([]),
    memory: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        vectorDimension: zod_1.z.number().default(1536),
    }).optional(),
});
