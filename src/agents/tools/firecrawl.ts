import type { Tool } from '../../types.js';

/**
 * Firecrawl 工具 - 搜索和抓取网页内容
 * 替代 SDK 内置的 WebFetch/WebSearch
 */
export const firecrawlTool: Tool = {
  name: 'firecrawl',
  description: 'Search and scrape web content using Firecrawl. Use for: web search, extracting content from URLs, crawling websites. Args: action (search|scrape|map), query (for search), url (for scrape/map), options',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'scrape', 'map'],
        description: 'Firecrawl action: search (web search), scrape (extract content from URL), map (discover URLs on site)'
      },
      query: {
        type: 'string',
        description: 'Search query (for search action)'
      },
      url: {
        type: 'string',
        description: 'URL to scrape or map (for scrape/map actions)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (for search)'
      },
      onlyMainContent: {
        type: 'boolean',
        description: 'Extract only main content, remove navigation/ads (for scrape)'
      },
      waitFor: {
        type: 'number',
        description: 'Wait for JavaScript to render (ms) (for scrape)'
      }
    },
    required: ['action']
  },
  execute: async (params: Record<string, unknown>) => {
    const { spawn } = await import('child_process');
    const { writeFile, mkdir } = await import('fs/promises');
    const { existsSync } = await import('fs');
    const path = await import('path');

    const action = params.action as string;
    const cwd = process.cwd();
    const outputDir = path.join(cwd, '.firecrawl');

    // 确保输出目录存在
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const outputFile = `${outputDir}/firecrawl-${action}-${timestamp}`;

    return new Promise((resolve, reject) => {
      const args: string[] = [];

      switch (action) {
        case 'search':
          args.push('search');
          if (params.query) args.push(params.query as string);
          args.push('--limit', String(params.limit || 10));
          args.push('--json');
          args.push('-o', outputFile + '.json');
          break;

        case 'scrape':
          args.push('scrape');
          if (params.url) args.push(params.url as string);
          if (params.onlyMainContent) args.push('--only-main-content');
          if (params.waitFor) args.push('--wait-for', String(params.waitFor));
          args.push('-o', outputFile + '.md');
          break;

        case 'map':
          args.push('map');
          if (params.url) args.push(params.url as string);
          args.push('--json');
          args.push('-o', outputFile + '.json');
          break;

        default:
          reject(new Error(`Unknown action: ${action}`));
          return;
      }

      console.log(`[Firecrawl] Running: firecrawl ${args.join(' ')}`);

      const child = spawn('firecrawl', args, {
        cwd,
        env: { ...process.env },
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', async (code) => {
        if (code !== 0) {
          console.error(`[Firecrawl] Error: ${stderr}`);
          reject(new Error(`Firecrawl exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          let result: unknown;

          if (action === 'scrape') {
            // 读取抓取的 markdown 文件
            const { readFile } = await import('fs/promises');
            const content = await readFile(outputFile + '.md', 'utf-8');
            result = { type: 'markdown', content };
          } else {
            // 读取 JSON 结果
            const { readFile } = await import('fs/promises');
            const jsonContent = await readFile(outputFile + '.json', 'utf-8');
            result = JSON.parse(jsonContent);
          }

          resolve(result);
        } catch (err) {
          // 如果读取失败，返回原始输出
          resolve({ stdout, stderr, code });
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }
};
