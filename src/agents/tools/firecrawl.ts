import type { Tool } from '../../types.js';
import { broadcastToClients } from '../../channels/http-ws/ws-server.js';

/**
 * Firecrawl 工具 - 搜索和抓取网页内容
 * 替代 SDK 内置的 WebFetch/WebSearch
 * 搜索结果 URL 会在前端浏览器面板展示
 *
 * ⚡ 推荐：优先使用此工具而非 Bash+Python，内置搜索能力，无需自行拼接搜索 API
 */
export const firecrawlTool: Tool = {
  name: 'firecrawl',
  description: '【推荐】使用 Firecrawl 搜索和抓取网页。支持 web search、URL 内容提取、网站结构扫描。搜索结果的 URL 会在前端浏览器面板以列表形式展示。相比 Bash+Python 更便捷：内置搜索能力，无需拼接搜索 API，自动处理 JSON 解析和错误。Args: action (search|scrape|map), query (搜索词), url (抓取URL)',
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
            const targetFile = outputFile + '.md';
            console.log(`[Firecrawl] Reading scrape output: ${targetFile}`);
            const content = await readFile(targetFile, 'utf-8');
            result = { type: 'markdown', content };
            resolve(result);
          } else if (action === 'search') {
            // 读取搜索结果 JSON
            const { readFile, access } = await import('fs/promises');
            const targetFile = outputFile + '.json';
            console.log(`[Firecrawl] Reading search output: ${targetFile}`);

            // 检查文件是否存在
            try {
              await access(targetFile);
            } catch {
              console.error(`[Firecrawl] Output file not found: ${targetFile}`);
              resolve({
                success: false,
                error: `Output file not found: ${targetFile}`,
                cwd,
                stdout,
                stderr
              });
              return;
            }

            const jsonContent = await readFile(targetFile, 'utf-8');
            const searchResult = JSON.parse(jsonContent);

            // 提取 URL 列表并广播到前端
            // Firecrawl search 返回格式: { success: true, data: { web: [...] } }
            // 也兼容旧格式: { data: [...] } 或直接是数组
            let items: any[] = [];
            if (Array.isArray(searchResult)) {
              items = searchResult;
            } else if (searchResult.data?.web && Array.isArray(searchResult.data.web)) {
              items = searchResult.data.web;
            } else if (Array.isArray(searchResult.data)) {
              items = searchResult.data;
            }
            const urls = items.map((item: any) => ({
              title: item.title || item.markdown?.slice(0, 100) || item.url,
              url: item.url
            })).filter((item: any) => item.url);

            if (urls.length > 0) {
              console.log(`[Firecrawl] Broadcasting ${urls.length} URLs to frontend`);
              broadcastToClients('search-urls', {
                query: params.query,
                urls: urls,
                timestamp: Date.now()
              });
            }

            // 返回搜索结果给 agent（包含标题、URL、摘要）
            resolve({
              success: true,
              query: params.query,
              results: items.map((item: any) => ({
                title: item.title || '',
                url: item.url || '',
                description: item.description || ''
              })),
              url_count: urls.length
            });
          } else {
            // map action - 读取 JSON 结果
            const { readFile } = await import('fs/promises');
            const jsonContent = await readFile(outputFile + '.json', 'utf-8');
            result = JSON.parse(jsonContent);
            resolve(result);
          }
        } catch (err) {
          // 如果读取失败，返回详细错误信息
          console.error(`[Firecrawl] Failed to read output file:`, err);
          resolve({
            success: false,
            error: err instanceof Error ? err.message : String(err),
            outputFile: outputFile + (action === 'scrape' ? '.md' : '.json'),
            stdout,
            stderr,
            code
          });
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }
};
