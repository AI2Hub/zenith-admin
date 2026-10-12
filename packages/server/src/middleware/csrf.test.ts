import { Hono, type MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { errBody, okBody } from '../lib/openapi-schemas';
import { tagMiddleware } from '../lib/route-facts';
import { createCsrfMiddleware } from './csrf';

const ALLOWED_ORIGIN = 'https://admin.example.com';
const AUTHORIZATION = 'Bearer test-valid-token';
const CSRF_MESSAGE = '请求来源校验失败';

function bearerGate(kind: 'auth' | 'member-auth' = 'auth') {
  const middleware: MiddlewareHandler = async (c, next) => {
    if (c.req.header('Authorization') !== AUTHORIZATION) {
      throw new HTTPException(401, { message: '登录已过期' });
    }
    await next();
  };
  return tagMiddleware(middleware, { kind });
}

function createApp() {
  const app = new Hono();
  app.use('*', createCsrfMiddleware({ allowedOrigins: [ALLOWED_ORIGIN] }));
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json(errBody(error.message, error.status), error.status);
    }
    throw error;
  });
  return app;
}

async function expectCsrfRejection(response: Response) {
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual(errBody(CSRF_MESSAGE, 403));
}

describe('CSRF middleware', () => {
  it.each(['auth', 'member-auth'] as const)(
    'allows an originless DELETE through the %s Bearer gate',
    async (kind) => {
      const app = createApp();
      app.delete('/api/documents/7', bearerGate(kind), (c) => c.json(okBody(null, '删除成功'), 200));

      const response = await app.request('/api/documents/7', {
        method: 'DELETE',
        headers: { Authorization: AUTHORIZATION },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(okBody(null, '删除成功'));
    },
  );

  it('preserves originless form POST and multipart upload bodies after the Bearer gate', async () => {
    const app = createApp();
    app.post('/api/documents', bearerGate(), async (c) => {
      const body = await c.req.parseBody();
      const file = body.file;
      return c.json(okBody({
        title: body.title,
        file: file instanceof File ? { name: file.name, text: await file.text() } : null,
      }), 200);
    });

    const formResponse = await app.request('/api/documents', {
      method: 'POST',
      headers: { Authorization: AUTHORIZATION },
      body: new URLSearchParams({ title: '表单文档' }),
    });
    expect(formResponse.status).toBe(200);
    expect(await formResponse.json()).toEqual(okBody({ title: '表单文档', file: null }));

    const upload = new FormData();
    upload.set('title', '上传文档');
    upload.set('file', new File(['document content'], 'document.txt', { type: 'text/plain' }));
    const uploadResponse = await app.request('/api/documents', {
      method: 'POST',
      headers: { Authorization: AUTHORIZATION },
      body: upload,
    });
    expect(uploadResponse.status).toBe(200);
    expect(await uploadResponse.json()).toEqual(okBody({
      title: '上传文档',
      file: { name: 'document.txt', text: 'document content' },
    }));
  });

  it.each([undefined, '', 'Bearer', 'Bearer   ', 'Basic credentials', 'Bearer fake token'])(
    'does not exempt missing or malformed Authorization %j',
    async (authorization) => {
      const app = createApp();
      app.delete('/api/documents/7', bearerGate(), (c) => c.json(okBody(null), 200));

      await expectCsrfRejection(await app.request('/api/documents/7', {
        method: 'DELETE',
        headers: authorization === undefined ? {} : { Authorization: authorization },
      }));
    },
  );

  it('leaves invalid token rejection to authentication after the exemption', async () => {
    const app = createApp();
    app.delete('/api/documents/7', bearerGate(), (c) => c.json(okBody(null), 200));

    const response = await app.request('/api/documents/7', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer invalid-token' },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errBody('登录已过期', 401));
  });

  it('does not exempt public or Cookie-authenticated endpoints merely because Bearer is present', async () => {
    const app = createApp();
    app.post('/api/public/action', (c) => c.json(okBody(null), 200));
    app.post('/api/cookie/action', (c) => {
      if (getCookie(c, 'session') !== 'valid') throw new HTTPException(401, { message: '会话无效' });
      return c.json(okBody(null), 200);
    });

    for (const path of ['/api/public/action', '/api/cookie/action']) {
      await expectCsrfRejection(await app.request(path, {
        method: 'POST',
        headers: { Authorization: AUTHORIZATION, Cookie: 'session=valid' },
      }));
    }
  });

  it.each<Record<string, string>>([
    { Origin: 'null' },
    { Origin: '' },
    { Origin: 'https://untrusted.example.com' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'none' },
    { 'Sec-Fetch-Site': '' },
  ])('does not exempt a Bearer request carrying browser source headers %j', async (headers) => {
    const app = createApp();
    app.delete('/api/documents/7', bearerGate(), (c) => c.json(okBody(null), 200));

    await expectCsrfRejection(await app.request('/api/documents/7', {
      method: 'DELETE',
      headers: { Authorization: AUTHORIZATION, ...headers },
    }));
  });

  it.each<Record<string, string>>([
    { Origin: ALLOWED_ORIGIN },
    { 'Sec-Fetch-Site': 'same-origin' },
  ])('preserves Hono source validation for trusted browser headers %j', async (headers) => {
    const app = createApp();
    app.post('/api/public/action', (c) => c.json(okBody(null), 200));

    const response = await app.request('/api/public/action', { method: 'POST', headers });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(okBody(null));
  });

  it('preserves the existing JSON and safe-method behavior without any Bearer exemption', async () => {
    const app = createApp();
    app.on(['GET', 'OPTIONS', 'POST'], '/api/public/action', (c) => c.json(okBody(null), 200));

    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const response = await app.request('/api/public/action', { method });
      expect(response.status).toBe(200);
    }
    const response = await app.request('/api/public/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example.com' },
      body: '{}',
    });
    expect(response.status).toBe(200);
  });

  it('keeps external protocol exceptions without extending them to similarly prefixed paths', async () => {
    const app = createApp();
    const exemptPaths = [
      '/api/auth/enterprise/saml/acs',
      '/api/oauth2/token',
      '/api/oauth2/authorize',
      '/api/open/integrations/action',
    ];
    const protectedPaths = [
      '/api/auth/enterprise/saml/acs-extra',
      '/api/oauth2/token-extra',
      '/api/oauth2/authorize-extra',
      '/api/open-extra/action',
    ];
    for (const path of [...exemptPaths, ...protectedPaths]) {
      app.post(path, (c) => c.json(okBody(null), 200));
    }

    for (const path of exemptPaths) {
      const response = await app.request(path, { method: 'POST' });
      expect(response.status).toBe(200);
    }
    for (const path of protectedPaths) {
      await expectCsrfRejection(await app.request(path, { method: 'POST' }));
    }
  });

  it('does not borrow the auth gate from a later parameter route for a public static route', async () => {
    const app = createApp();
    app.delete('/api/documents/public', (c) => c.json(okBody('public'), 200));
    app.delete('/api/documents/:id', bearerGate(), (c) => c.json(okBody('protected'), 200));

    await expectCsrfRejection(await app.request('/api/documents/public', {
      method: 'DELETE',
      headers: { Authorization: AUTHORIZATION },
    }));
    const protectedResponse = await app.request('/api/documents/7', {
      method: 'DELETE',
      headers: { Authorization: AUTHORIZATION },
    });
    expect(protectedResponse.status).toBe(200);
    expect(await protectedResponse.json()).toEqual(okBody('protected'));
  });

  it('recognizes the Bearer gate when a mounted router wraps handlers for its own onError', async () => {
    const app = createApp();
    const child = new Hono();
    child.onError((error, c) => {
      if (error instanceof HTTPException) {
        return c.json(errBody(`子路由：${error.message}`, error.status), error.status);
      }
      throw error;
    });
    child.delete('/7', bearerGate(), (c) => c.json(okBody(null), 200));
    app.route('/api/documents', child);

    const response = await app.request('/api/documents/7', {
      method: 'DELETE',
      headers: { Authorization: AUTHORIZATION },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(okBody(null));

    const invalidResponse = await app.request('/api/documents/7', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(invalidResponse.status).toBe(401);
    expect(await invalidResponse.json()).toEqual(errBody('子路由：登录已过期', 401));
  });

  it('does not borrow a later Bearer gate when a public handler is registered first at the same path', async () => {
    const app = createApp();
    app.delete('/api/documents/7', (c) => c.json(okBody('public'), 200));
    app.delete('/api/documents/7', bearerGate(), (c) => c.json(okBody('protected'), 200));

    await expectCsrfRejection(await app.request('/api/documents/7', {
      method: 'DELETE',
      headers: { Authorization: AUTHORIZATION },
    }));
  });

  it.each([undefined, ALLOWED_ORIGIN])('preserves later permission and business 403 messages with Origin %j', async (origin) => {
    const app = createApp();
    const permissionGate: MiddlewareHandler = () => {
      throw new HTTPException(403, { message: '没有操作权限' });
    };
    app.delete('/api/documents/permission-denied', bearerGate(), permissionGate, (c) => c.json(okBody(null), 200));
    app.delete('/api/documents/business-denied', bearerGate(), () => {
      throw new HTTPException(403, { message: '文档已锁定' });
    });

    for (const [path, message] of [
      ['/api/documents/permission-denied', '没有操作权限'],
      ['/api/documents/business-denied', '文档已锁定'],
    ]) {
      const response = await app.request(path, {
        method: 'DELETE',
        headers: { Authorization: AUTHORIZATION, ...(origin === undefined ? {} : { Origin: origin }) },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual(errBody(message, 403));
    }
  });
});
