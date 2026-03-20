import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('should return service status', async ({ request }) => {
    const response = await request.get('/');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('appoint');
  });
});
