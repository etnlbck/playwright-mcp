import { test, expect } from '@playwright/test';

test.describe('MCP Server HTTP Endpoints', () => {
  test('health endpoint should return server status', async ({ request }) => {
    const response = await request.get('/health');
    
    expect(response.status()).toBe(200);
    
    const health = await response.json();
    expect(health).toHaveProperty('status', 'healthy');
    expect(health).toHaveProperty('uptime');
    expect(health).toHaveProperty('memory');
    expect(health).toHaveProperty('timestamp');
    
    // Assert memory structure
    expect(health.memory).toHaveProperty('used');
    expect(health.memory).toHaveProperty('total');
    expect(health.memory).toHaveProperty('percentage');
    
    // Assert uptime is a number
    expect(typeof health.uptime).toBe('number');
    expect(health.uptime).toBeGreaterThan(0);
  });

  test('keepalive endpoint should update activity timestamp', async ({ request }) => {
    const response = await request.get('/keepalive');
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('uptime');
    
    // Assert timestamp is recent (within last 5 seconds)
    const timestamp = new Date(data.timestamp).getTime();
    const now = Date.now();
    expect(now - timestamp).toBeLessThan(5000);
  });

  test('tools endpoint should return available MCP tools', async ({ request }) => {
    const response = await request.get('/tools');
    
    expect(response.status()).toBe(200);
    
    const tools = await response.json();
    expect(tools).toHaveProperty('tools');
    expect(Array.isArray(tools.tools)).toBe(true);
    expect(tools.tools.length).toBeGreaterThan(0);
    
    // Assert expected tools are present
    const toolNames = tools.tools.map((tool: any) => tool.name);
    expect(toolNames).toContain('navigate');
    expect(toolNames).toContain('screenshot');
    expect(toolNames).toContain('scrape');
    expect(toolNames).toContain('click');
    expect(toolNames).toContain('type');
    expect(toolNames).toContain('wait_for');
    expect(toolNames).toContain('get_url');
    expect(toolNames).toContain('close_browser');
    
    // Assert tool structure
    const navigateTool = tools.tools.find((tool: any) => tool.name === 'navigate');
    expect(navigateTool).toHaveProperty('name', 'navigate');
    expect(navigateTool).toHaveProperty('description');
    expect(navigateTool).toHaveProperty('inputSchema');
    expect(navigateTool.inputSchema).toHaveProperty('type', 'object');
    expect(navigateTool.inputSchema).toHaveProperty('properties');
  });

  test('ready endpoint should check browser initialization', async ({ request }) => {
    const response = await request.get('/ready');
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('status', 'ready');
    expect(data).toHaveProperty('browserInitTime');
    expect(data).toHaveProperty('timestamp');
    
    // Assert browser init time is reasonable (less than 30 seconds)
    expect(data.browserInitTime).toBeLessThan(30000);
    expect(data.browserInitTime).toBeGreaterThan(0);
  });
});

test.describe('MCP Tool Execution - Non-Streaming', () => {
  test('navigate tool should work correctly', async ({ request }) => {
    const response = await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com',
          waitUntil: 'load'
        }
      }
    });
    
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    
    const content = result.content[0];
    expect(content).toHaveProperty('type', 'text');
    expect(content.text).toContain('Navigated to https://example.com');
  });

  test('get_url tool should return current URL', async ({ request }) => {
    // First navigate to a page
    await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com'
        }
      }
    });
    
    // Then get the URL
    const response = await request.post('/execute-sync', {
      data: {
        tool: 'get_url',
        arguments: {}
      }
    });
    
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result).toHaveProperty('content');
    
    const content = result.content[0];
    expect(content).toHaveProperty('type', 'text');
    expect(content.text).toBe('https://example.com/');
  });

  test('screenshot tool should capture page screenshot', async ({ request }) => {
    // First navigate to a page
    await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com'
        }
      }
    });
    
    // Then take a screenshot
    const response = await request.post('/execute-sync', {
      data: {
        tool: 'screenshot',
        arguments: {
          fullPage: false,
          type: 'png'
        }
      }
    });
    
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result).toHaveProperty('content');
    
    const content = result.content[0];
    expect(content).toHaveProperty('type', 'image');
    expect(content).toHaveProperty('data');
    expect(content).toHaveProperty('mimeType', 'image/png');
    
    // Assert base64 data is present and reasonable length
    expect(content.data).toBeTruthy();
    expect(content.data.length).toBeGreaterThan(1000);
  });

  test('scrape tool should extract page content', async ({ request }) => {
    // First navigate to a page
    await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com'
        }
      }
    });
    
    // Then scrape content
    const response = await request.post('/execute-sync', {
      data: {
        tool: 'scrape',
        arguments: {
          selector: 'h1',
          attribute: 'textContent'
        }
      }
    });
    
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result).toHaveProperty('content');
    
    const content = result.content[0];
    expect(content).toHaveProperty('type', 'text');
    expect(content.text).toContain('Example Domain');
  });

  test('browser_health tool should return browser status', async ({ request }) => {
    const response = await request.post('/execute-sync', {
      data: {
        tool: 'browser_health',
        arguments: {}
      }
    });
    
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result).toHaveProperty('content');
    
    const content = result.content[0];
    expect(content).toHaveProperty('type', 'text');
    
    const health = JSON.parse(content.text);
    expect(health).toHaveProperty('browserConnected', true);
    expect(health).toHaveProperty('pageConnected', true);
    expect(health).toHaveProperty('browserAge');
    expect(health).toHaveProperty('retryCount');
    
    // Assert browser age is reasonable
    expect(health.browserAge).toBeGreaterThan(0);
    expect(health.retryCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe('MCP Tool Execution - Streaming', () => {
  test('streaming execution should work with navigate tool', async ({ request }) => {
    const response = await request.post('/execute', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com',
          waitUntil: 'load'
        }
      }
    });
    
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');
    
    // Read the stream
    const stream = response.body();
    const chunks: string[] = [];
    
    for await (const chunk of stream) {
      chunks.push(chunk.toString());
    }
    
    const streamData = chunks.join('');
    expect(streamData).toContain('data: ');
    
    // Parse stream events
    const lines = streamData.split('\n');
    const dataLines = lines.filter(line => line.startsWith('data: '));
    
    expect(dataLines.length).toBeGreaterThan(0);
    
    // Check for status event
    const statusEvent = dataLines.find(line => 
      JSON.parse(line.slice(6)).type === 'status'
    );
    expect(statusEvent).toBeTruthy();
    
    // Check for result event
    const resultEvent = dataLines.find(line => 
      JSON.parse(line.slice(6)).type === 'result'
    );
    expect(resultEvent).toBeTruthy();
    
    // Check for complete event
    const completeEvent = dataLines.find(line => 
      JSON.parse(line.slice(6)).type === 'complete'
    );
    expect(completeEvent).toBeTruthy();
  });

  test('streaming execution should work with screenshot tool', async ({ request }) => {
    // First navigate to a page
    await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com'
        }
      }
    });
    
    const response = await request.post('/execute', {
      data: {
        tool: 'screenshot',
        arguments: {
          fullPage: false,
          type: 'png'
        }
      }
    });
    
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');
    
    // Read the stream
    const stream = response.body();
    const chunks: string[] = [];
    
    for await (const chunk of stream) {
      chunks.push(chunk.toString());
    }
    
    const streamData = chunks.join('');
    
    // Parse stream events
    const lines = streamData.split('\n');
    const dataLines = lines.filter(line => line.startsWith('data: '));
    
    // Check for result event with image data
    const resultEvent = dataLines.find(line => {
      try {
        const data = JSON.parse(line.slice(6));
        return data.type === 'result' && 
               data.data?.content?.[0]?.type === 'image';
      } catch {
        return false;
      }
    });
    expect(resultEvent).toBeTruthy();
  });
});

test.describe('Error Handling', () => {
  test('should handle invalid tool names gracefully', async ({ request }) => {
    const response = await request.post('/execute-sync', {
      data: {
        tool: 'invalid_tool',
        arguments: {}
      }
    });
    
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result).toHaveProperty('content');
    
    const content = result.content[0];
    expect(content).toHaveProperty('type', 'text');
    expect(content.text).toContain('error');
  });

  test('should handle invalid URLs gracefully', async ({ request }) => {
    const response = await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'invalid-url'
        }
      }
    });
    
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result).toHaveProperty('content');
    
    const content = result.content[0];
    expect(content).toHaveProperty('type', 'text');
    expect(content.text).toContain('error');
  });

  test('should handle missing required arguments', async ({ request }) => {
    const response = await request.post('/execute-sync', {
      data: {
        tool: 'click',
        arguments: {}
      }
    });
    
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result).toHaveProperty('content');
    
    const content = result.content[0];
    expect(content).toHaveProperty('type', 'text');
    expect(content.text).toContain('error');
  });
});
