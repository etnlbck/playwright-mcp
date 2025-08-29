#!/usr/bin/env node

/**
 * Test script for HTTP streamable Playwright MCP server
 * This demonstrates both streaming and non-streaming execution
 */

const port = process.env.PORT || 3000;
const baseUrl = `http://localhost:${port}`;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testHealthCheck() {
  log('cyan', '\n🔍 Testing Health Check...');
  try {
    const response = await fetch(`${baseUrl}/health`);
    const health = await response.json();
    log('green', `✅ Health check passed - Uptime: ${Math.round(health.uptime)}s`);
    log('blue', `📊 Memory: ${health.memory.used}MB used / ${health.memory.total}MB total`);
    return true;
  } catch (error) {
    log('red', `❌ Health check failed: ${error.message}`);
    return false;
  }
}

async function testKeepalive() {
  log('cyan', '\n💓 Testing Keepalive...');
  try {
    const response = await fetch(`${baseUrl}/keepalive`);
    const data = await response.json();
    log('green', `✅ Keepalive successful - ${data.timestamp}`);
    return true;
  } catch (error) {
    log('red', `❌ Keepalive failed: ${error.message}`);
    return false;
  }
}

async function testToolsList() {
  log('cyan', '\n🛠️ Testing Tools List...');
  try {
    const response = await fetch(`${baseUrl}/tools`);
    const tools = await response.json();
    log('green', `✅ Found ${tools.tools.length} available tools:`);
    tools.tools.forEach(tool => {
      log('blue', `  - ${tool.name}: ${tool.description}`);
    });
    return true;
  } catch (error) {
    log('red', `❌ Tools list failed: ${error.message}`);
    return false;
  }
}

async function testNonStreamingExecution() {
  log('cyan', '\n📡 Testing Non-Streaming Execution...');
  try {
    const response = await fetch(`${baseUrl}/execute-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'navigate',
        arguments: {
          url: 'https://example.com',
          waitUntil: 'load'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    log('green', '✅ Non-streaming execution successful');
    log('blue', `📄 Result: ${JSON.stringify(result, null, 2)}`);
    return true;
  } catch (error) {
    log('red', `❌ Non-streaming execution failed: ${error.message}`);
    return false;
  }
}

async function testStreamingExecution() {
  log('cyan', '\n🌊 Testing Streaming Execution...');
  try {
    const response = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'screenshot',
        arguments: {
          fullPage: false,
          type: 'png'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    log('green', '✅ Streaming execution started');
    
    // Read the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            log('magenta', `📦 Stream data: ${data.type}`);
            
            if (data.type === 'status') {
              log('yellow', `  Status: ${data.message}`);
            } else if (data.type === 'result') {
              log('blue', `  Result received (${data.data.content.length} items)`);
              if (data.data.content[0]?.type === 'image') {
                log('green', `  📸 Screenshot captured (${data.data.content[0].data.length} chars base64)`);
              }
            } else if (data.type === 'error') {
              log('red', `  ❌ Error: ${data.message}`);
            } else if (data.type === 'complete') {
              log('green', '  ✅ Stream completed');
            }
          } catch (parseError) {
            log('red', `  ⚠️ Failed to parse stream data: ${line}`);
          }
        }
      }
    }

    return true;
  } catch (error) {
    log('red', `❌ Streaming execution failed: ${error.message}`);
    return false;
  }
}

async function testBrowserHealth() {
  log('cyan', '\n🔧 Testing Browser Health...');
  try {
    const response = await fetch(`${baseUrl}/execute-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'browser_health',
        arguments: {}
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const health = JSON.parse(result.content[0].text);
    
    log('green', '✅ Browser health check successful');
    log('blue', `🌐 Browser connected: ${health.browserConnected}`);
    log('blue', `📄 Page connected: ${health.pageConnected}`);
    log('blue', `⏰ Browser age: ${Math.round(health.browserAge / 1000)}s`);
    log('blue', `🔄 Retry count: ${health.retryCount}`);
    
    return true;
  } catch (error) {
    log('red', `❌ Browser health check failed: ${error.message}`);
    return false;
  }
}

async function testReadyCheck() {
  log('cyan', '\n🚀 Testing Ready Check...');
  try {
    const response = await fetch(`${baseUrl}/ready`);
    const data = await response.json();
    
    if (response.ok) {
      log('green', `✅ Ready check passed - Browser init time: ${data.browserInitTime}ms`);
    } else {
      log('red', `❌ Ready check failed: ${data.error}`);
    }
    
    return response.ok;
  } catch (error) {
    log('red', `❌ Ready check failed: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  log('bright', '🧪 Starting HTTP Streamable Playwright MCP Server Tests\n');
  
  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Keepalive', fn: testKeepalive },
    { name: 'Tools List', fn: testToolsList },
    { name: 'Ready Check', fn: testReadyCheck },
    { name: 'Browser Health', fn: testBrowserHealth },
    { name: 'Non-Streaming Execution', fn: testNonStreamingExecution },
    { name: 'Streaming Execution', fn: testStreamingExecution }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      log('red', `❌ Test "${test.name}" crashed: ${error.message}`);
      failed++;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  log('bright', `\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    log('green', '🎉 All tests passed! Server is working correctly.');
  } else {
    log('red', '⚠️ Some tests failed. Check the server logs for details.');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('yellow', '\n🛑 Tests interrupted by user');
  process.exit(0);
});

// Run tests
runAllTests().catch(error => {
  log('red', `❌ Test suite failed: ${error.message}`);
  process.exit(1);
});

