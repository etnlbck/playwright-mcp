import { test, expect } from '@playwright/test';

test.describe('MCP Server Integration Tests', () => {
  test('should execute complete workflow: navigate -> scrape -> screenshot', async ({ request }) => {
    // Step 1: Navigate to a page
    const navigateResponse = await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com',
          waitUntil: 'load'
        }
      }
    });
    
    expect(navigateResponse.status()).toBe(200);
    const navigateResult = await navigateResponse.json();
    expect(navigateResult.content[0].text).toContain('Navigated to https://example.com');
    
    // Step 2: Scrape page content
    const scrapeResponse = await request.post('/execute-sync', {
      data: {
        tool: 'scrape',
        arguments: {
          selector: 'h1',
          attribute: 'textContent'
        }
      }
    });
    
    expect(scrapeResponse.status()).toBe(200);
    const scrapeResult = await scrapeResponse.json();
    expect(scrapeResult.content[0].text).toContain('Example Domain');
    
    // Step 3: Take screenshot
    const screenshotResponse = await request.post('/execute-sync', {
      data: {
        tool: 'screenshot',
        arguments: {
          fullPage: true,
          type: 'png'
        }
      }
    });
    
    expect(screenshotResponse.status()).toBe(200);
    const screenshotResult = await screenshotResponse.json();
    expect(screenshotResult.content[0].type).toBe('image');
    expect(screenshotResult.content[0].mimeType).toBe('image/png');
    expect(screenshotResult.content[0].data.length).toBeGreaterThan(1000);
  });

  test('should handle form interaction workflow', async ({ request }) => {
    // Navigate to a form page
    await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://httpbin.org/forms/post'
        }
      }
    });
    
    // Fill form fields using type tool
    const typeNameResponse = await request.post('/execute-sync', {
      data: {
        tool: 'type',
        arguments: {
          selector: 'input[name="custname"]',
          text: 'John Doe'
        }
      }
    });
    
    expect(typeNameResponse.status()).toBe(200);
    
    const typeEmailResponse = await request.post('/execute-sync', {
      data: {
        tool: 'type',
        arguments: {
          selector: 'input[name="custemail"]',
          text: 'john@example.com'
        }
      }
    });
    
    expect(typeEmailResponse.status()).toBe(200);
    
    // Click submit button
    const clickResponse = await request.post('/execute-sync', {
      data: {
        tool: 'click',
        arguments: {
          selector: 'input[type="submit"]'
        }
      }
    });
    
    expect(clickResponse.status()).toBe(200);
    
    // Verify we're on the result page
    const urlResponse = await request.post('/execute-sync', {
      data: {
        tool: 'get_url',
        arguments: {}
      }
    });
    
    expect(urlResponse.status()).toBe(200);
    const urlResult = await urlResponse.json();
    expect(urlResult.content[0].text).toContain('httpbin.org');
  });

  test('should handle streaming workflow with multiple operations', async ({ request }) => {
    // Start streaming execution for navigation
    const navigateStream = await request.post('/execute', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com'
        }
      }
    });
    
    expect(navigateStream.status()).toBe(200);
    expect(navigateStream.headers()['content-type']).toContain('text/event-stream');
    
    // Read and verify navigation stream
    const navigateChunks: string[] = [];
    for await (const chunk of navigateStream.body()) {
      navigateChunks.push(chunk.toString());
    }
    
    const navigateData = navigateChunks.join('');
    expect(navigateData).toContain('data: ');
    expect(navigateData).toContain('"type":"complete"');
    
    // Now take a screenshot via streaming
    const screenshotStream = await request.post('/execute', {
      data: {
        tool: 'screenshot',
        arguments: {
          fullPage: false,
          type: 'png'
        }
      }
    });
    
    expect(screenshotStream.status()).toBe(200);
    
    // Read and verify screenshot stream
    const screenshotChunks: string[] = [];
    for await (const chunk of screenshotStream.body()) {
      screenshotChunks.push(chunk.toString());
    }
    
    const screenshotData = screenshotChunks.join('');
    expect(screenshotData).toContain('"type":"result"');
    expect(screenshotData).toContain('"type":"image"');
  });

  test('should maintain browser state across multiple operations', async ({ request }) => {
    // Navigate to first page
    await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com'
        }
      }
    });
    
    // Get URL to verify navigation
    let urlResponse = await request.post('/execute-sync', {
      data: {
        tool: 'get_url',
        arguments: {}
      }
    });
    
    let urlResult = await urlResponse.json();
    expect(urlResult.content[0].text).toContain('example.com');
    
    // Navigate to second page
    await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://httpbin.org/'
        }
      }
    });
    
    // Get URL again to verify new navigation
    urlResponse = await request.post('/execute-sync', {
      data: {
        tool: 'get_url',
        arguments: {}
      }
    });
    
    urlResult = await urlResponse.json();
    expect(urlResult.content[0].text).toContain('httpbin.org');
    
    // Check browser health to ensure it's still working
    const healthResponse = await request.post('/execute-sync', {
      data: {
        tool: 'browser_health',
        arguments: {}
      }
    });
    
    expect(healthResponse.status()).toBe(200);
    const healthResult = await healthResponse.json();
    const health = JSON.parse(healthResult.content[0].text);
    expect(health.browserConnected).toBe(true);
    expect(health.pageConnected).toBe(true);
  });

  test('should handle error recovery and retry logic', async ({ request }) => {
    // Try to navigate to invalid URL
    const invalidResponse = await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://invalid-domain-that-does-not-exist.com'
        }
      }
    });
    
    expect(invalidResponse.status()).toBe(200);
    const invalidResult = await invalidResponse.json();
    expect(invalidResult.content[0].text).toContain('error');
    
    // Browser should still be healthy after error
    const healthResponse = await request.post('/execute-sync', {
      data: {
        tool: 'browser_health',
        arguments: {}
      }
    });
    
    expect(healthResponse.status()).toBe(200);
    const healthResult = await healthResponse.json();
    const health = JSON.parse(healthResult.content[0].text);
    expect(health.browserConnected).toBe(true);
    
    // Should be able to navigate to valid URL after error
    const validResponse = await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com'
        }
      }
    });
    
    expect(validResponse.status()).toBe(200);
    const validResult = await validResponse.json();
    expect(validResult.content[0].text).toContain('Navigated to https://example.com');
  });

  test('should handle concurrent operations gracefully', async ({ request }) => {
    // Start multiple operations concurrently
    const operations = [
      request.post('/execute-sync', {
        data: {
          tool: 'navigate',
          arguments: {
            url: 'https://example.com'
          }
        }
      }),
      request.post('/execute-sync', {
        data: {
          tool: 'browser_health',
          arguments: {}
        }
      }),
      request.post('/execute-sync', {
        data: {
          tool: 'get_url',
          arguments: {}
        }
      })
    ];
    
    // Wait for all operations to complete
    const results = await Promise.all(operations);
    
    // All should succeed
    results.forEach(result => {
      expect(result.status()).toBe(200);
    });
    
    // Verify results
    const navigateResult = await results[0].json();
    expect(navigateResult.content[0].text).toContain('Navigated to https://example.com');
    
    const healthResult = await results[1].json();
    const health = JSON.parse(healthResult.content[0].text);
    expect(health.browserConnected).toBe(true);
    
    const urlResult = await results[2].json();
    expect(urlResult.content[0].text).toContain('example.com');
  });

  test('should handle large page content and performance', async ({ request }) => {
    // Navigate to a page with substantial content
    await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://httpbin.org/',
          waitUntil: 'load'
        }
      }
    });
    
    // Scrape all links to test performance with multiple elements
    const scrapeResponse = await request.post('/execute-sync', {
      data: {
        tool: 'scrape',
        arguments: {
          selector: 'a',
          attribute: 'href',
          multiple: true
        }
      }
    });
    
    expect(scrapeResponse.status()).toBe(200);
    const scrapeResult = await scrapeResponse.json();
    expect(scrapeResult.content[0].text).toBeTruthy();
    
    // Take full page screenshot to test performance
    const screenshotResponse = await request.post('/execute-sync', {
      data: {
        tool: 'screenshot',
        arguments: {
          fullPage: true,
          type: 'png',
          quality: 90
        }
      }
    });
    
    expect(screenshotResponse.status()).toBe(200);
    const screenshotResult = await screenshotResponse.json();
    expect(screenshotResult.content[0].type).toBe('image');
    expect(screenshotResult.content[0].data.length).toBeGreaterThan(1000);
  });

  test('should handle wait conditions and timeouts', async ({ request }) => {
    // Navigate to a page
    await request.post('/execute-sync', {
      data: {
        tool: 'navigate',
        arguments: {
          url: 'https://example.com'
        }
      }
    });
    
    // Wait for specific element
    const waitResponse = await request.post('/execute-sync', {
      data: {
        tool: 'wait_for',
        arguments: {
          selector: 'h1',
          state: 'visible',
          timeout: 5000
        }
      }
    });
    
    expect(waitResponse.status()).toBe(200);
    const waitResult = await waitResponse.json();
    expect(waitResult.content[0].text).toContain('Element found');
    
    // Test timeout with non-existent element
    const timeoutResponse = await request.post('/execute-sync', {
      data: {
        tool: 'wait_for',
        arguments: {
          selector: '.non-existent-element',
          state: 'visible',
          timeout: 1000
        }
      }
    });
    
    expect(timeoutResponse.status()).toBe(200);
    const timeoutResult = await timeoutResponse.json();
    expect(timeoutResult.content[0].text).toContain('timeout');
  });
});
