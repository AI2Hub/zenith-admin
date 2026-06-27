import { http, HttpResponse } from 'msw';
import type { TenantIdentityProvider } from '@zenith/shared';
import { mockDateTime } from '../utils/date';

const API = import.meta.env.VITE_API_BASE_URL || '';

let nextId = 3;

const providers: TenantIdentityProvider[] = [
  {
    id: 1,
    tenantId: 1,
    tenantName: '演示租户',
    name: '演示 OIDC',
    code: 'demo_oidc',
    type: 'oidc',
    status: 'enabled',
    issuer: 'https://idp.example.com',
    authorizationEndpoint: 'https://idp.example.com/oauth2/authorize',
    tokenEndpoint: 'https://idp.example.com/oauth2/token',
    userinfoEndpoint: 'https://idp.example.com/oauth2/userinfo',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    clientId: 'demo-client',
    clientSecret: '******',
    scopes: 'openid profile email',
    samlSsoUrl: null,
    samlEntityId: null,
    samlCertificate: '',
    attributeMapping: { subject: 'sub', email: 'email', username: 'preferred_username', nickname: 'name' },
    jitEnabled: true,
    defaultRoleIds: [2],
    remark: '演示身份源',
    createdAt: mockDateTime(),
    updatedAt: mockDateTime(),
  },
  {
    id: 2,
    tenantId: null,
    tenantName: null,
    name: '平台 SAML',
    code: 'platform_saml',
    type: 'saml',
    status: 'disabled',
    issuer: null,
    authorizationEndpoint: null,
    tokenEndpoint: null,
    userinfoEndpoint: null,
    jwksUri: null,
    clientId: null,
    clientSecret: '',
    scopes: 'openid profile email',
    samlSsoUrl: 'https://idp.example.com/saml/sso',
    samlEntityId: 'https://idp.example.com/saml/metadata',
    samlCertificate: '******',
    attributeMapping: { subject: 'NameID', email: 'email', username: 'username', nickname: 'displayName' },
    jitEnabled: false,
    defaultRoleIds: [],
    remark: '',
    createdAt: mockDateTime(),
    updatedAt: mockDateTime(),
  },
];

function ok<T>(data: T, message = 'ok') {
  return HttpResponse.json({ code: 0, message, data });
}

export const identityProvidersHandlers = [
  http.get(`${API}/api/identity-providers`, ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') || '1');
    const pageSize = Number(url.searchParams.get('pageSize') || '10');
    const keyword = url.searchParams.get('keyword') || '';
    const type = url.searchParams.get('type') || '';
    const status = url.searchParams.get('status') || '';
    let list = [...providers];
    if (keyword) list = list.filter((item) => item.name.includes(keyword) || item.code.includes(keyword));
    if (type) list = list.filter((item) => item.type === type);
    if (status) list = list.filter((item) => item.status === status);
    const total = list.length;
    list = list.slice((page - 1) * pageSize, page * pageSize);
    return ok({ list, total, page, pageSize });
  }),

  http.get(`${API}/api/identity-providers/:id`, ({ params }) => {
    const item = providers.find((provider) => provider.id === Number(params.id));
    if (!item) return HttpResponse.json({ code: 404, message: '身份源不存在', data: null });
    return ok(item);
  }),

  http.post(`${API}/api/identity-providers`, async ({ request }) => {
    const body = await request.json() as Partial<TenantIdentityProvider>;
    const item: TenantIdentityProvider = {
      id: nextId++,
      tenantId: body.tenantId ?? null,
      tenantName: body.tenantId ? '演示租户' : null,
      name: body.name || '新身份源',
      code: body.code || `idp_${nextId}`,
      type: body.type || 'oidc',
      status: body.status || 'disabled',
      issuer: body.issuer ?? null,
      authorizationEndpoint: body.authorizationEndpoint ?? null,
      tokenEndpoint: body.tokenEndpoint ?? null,
      userinfoEndpoint: body.userinfoEndpoint ?? null,
      jwksUri: body.jwksUri ?? null,
      clientId: body.clientId ?? null,
      clientSecret: body.clientSecret ? '******' : '',
      scopes: body.scopes || 'openid profile email',
      samlSsoUrl: body.samlSsoUrl ?? null,
      samlEntityId: body.samlEntityId ?? null,
      samlCertificate: body.samlCertificate ? '******' : '',
      attributeMapping: body.attributeMapping || { subject: 'sub', email: 'email', username: 'preferred_username', nickname: 'name' },
      jitEnabled: body.jitEnabled ?? false,
      defaultRoleIds: body.defaultRoleIds || [],
      remark: body.remark ?? '',
      createdAt: mockDateTime(),
      updatedAt: mockDateTime(),
    };
    providers.unshift(item);
    return ok(item, '创建成功');
  }),

  http.put(`${API}/api/identity-providers/:id`, async ({ params, request }) => {
    const item = providers.find((provider) => provider.id === Number(params.id));
    if (!item) return HttpResponse.json({ code: 404, message: '身份源不存在', data: null });
    const body = await request.json() as Partial<TenantIdentityProvider>;
    Object.assign(item, body, {
      tenantName: body.tenantId ? '演示租户' : null,
      clientSecret: body.clientSecret && body.clientSecret !== '******' ? '******' : item.clientSecret,
      samlCertificate: body.samlCertificate && body.samlCertificate !== '******' ? '******' : item.samlCertificate,
      updatedAt: mockDateTime(),
    });
    return ok(item, '更新成功');
  }),

  http.delete(`${API}/api/identity-providers/:id`, ({ params }) => {
    const index = providers.findIndex((provider) => provider.id === Number(params.id));
    if (index === -1) return HttpResponse.json({ code: 404, message: '身份源不存在', data: null });
    providers.splice(index, 1);
    return ok(null, '删除成功');
  }),

  http.get(`${API}/api/auth/enterprise/providers`, ({ request }) => {
    const url = new URL(request.url);
    const tenantCode = url.searchParams.get('tenantCode');
    const visible = providers
      .filter((item) => item.status === 'enabled' && (tenantCode ? item.tenantId === 1 : item.tenantId === null))
      .map(({ id, name, code, type }) => ({ id, name, code, type }));
    return ok({ tenantCode, providers: visible });
  }),

  http.get(`${API}/api/auth/enterprise/:id`, ({ params }) => {
    return ok({
      authUrl: `/enterprise/callback?code=demo-code&state=demo-state-${params.id}`,
      state: `demo-state-${params.id}`,
    });
  }),

  http.post(`${API}/api/auth/enterprise/callback`, () => {
    return HttpResponse.json({
      code: 0,
      message: '登录成功',
      data: {
        redirectTo: '/',
        loginResult: {
          user: {
            id: 1,
            username: 'admin',
            nickname: '管理员',
            email: 'admin@example.com',
            status: 'enabled',
            roles: [],
            createdAt: mockDateTime(),
            updatedAt: mockDateTime(),
          },
          token: { accessToken: 'mock-enterprise-access-token', refreshToken: 'mock-enterprise-refresh-token' },
        },
      },
    });
  }),
];
