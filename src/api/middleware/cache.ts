import { Context, Next } from 'hono';
import { Env } from '../../db/types';

export function cacheMiddleware(maxAge: number = 300) {
  return async (c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> => {
    await next();

    const response = c.res;

    // Only cache GET requests
    if (c.req.method === 'GET') {
      response.headers.set('Cache-Control', `public, max-age=${maxAge}`);
      response.headers.set('ETag', `"${Date.now()}"`);
    }
  };
}

export function staticAssetCache() {
  return async (c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> => {
    await next();

    const response = c.res;

    // Cache static assets (CSS, JS, images) for longer
    if (
      c.req.url.endsWith('.css') ||
      c.req.url.endsWith('.js') ||
      c.req.url.endsWith('.png') ||
      c.req.url.endsWith('.jpg') ||
      c.req.url.endsWith('.svg')
    ) {
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  };
}
