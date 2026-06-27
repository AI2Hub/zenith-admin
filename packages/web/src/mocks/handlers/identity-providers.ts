import { http, HttpResponse } from 'msw';
import type { LdapDirectoryUser, TenantIdentityProvider } from '@zenith/shared';
import { mockDateTime } from '../utils/date';

const API = import.meta.env.VITE_API_BASE_URL || '';

let nextId = 4;

const directoryUsers: LdapDirectoryUser[] = [
  {
    dn: 'cn=Alice Chen,ou=users,dc=example,dc=com',
    subject: 'demo-guid-alice',
    username: 'alice.chen',
    nickname: 'Alice Chen',
    email: 'alice.chen@example.com',
    phone: '13800000001',
    department: '研发中心',
  },
  {
    dn: 'cn=Bob Li,ou=users,dc=example,dc=com',
    subject: 'demo-guid-bob',
    username: 'bob.li',
    nickname: 'Bob Li',
    email: 'bob.li@example.com',
    phone: '13800000002',
    department: '产品部',
  },
];

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
    ldapUrl: null,
    ldapStartTls: false,
    ldapSkipTlsVerify: false,
    ldapBaseDn: null,
    ldapBindDn: null,
    ldapBindPassword: '',
    ldapUserFilter: null,
    ldapUserSearchFilter: null,
    ldapSyncFilter: null,
    ldapGroupBaseDn: null,
    ldapGroupFilter: null,
    ldapTimeoutMs: 5000,
    attributeMapping: { subject: 'sub', email: 'email', username: 'preferred_username', nickname: 'name', phone: 'phone_number', department: 'department' },
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
    status: 'enabled',
    issuer: 'https://idp.example.com/saml/metadata',
    authorizationEndpoint: null,
    tokenEndpoint: null,
    userinfoEndpoint: null,
    jwksUri: null,
    clientId: null,
    clientSecret: '',
    scopes: 'openid profile email',
    samlSsoUrl: 'https://idp.example.com/saml/sso',
    samlEntityId: 'https://zenith.example.com/saml/sp',
    samlCertificate: '******',
    ldapUrl: null,
    ldapStartTls: false,
    ldapSkipTlsVerify: false,
    ldapBaseDn: null,
    ldapBindDn: null,
    ldapBindPassword: '',
    ldapUserFilter: null,
    ldapUserSearchFilter: null,
    ldapSyncFilter: null,
    ldapGroupBaseDn: null,
    ldapGroupFilter: null,
    ldapTimeoutMs: 5000,
    attributeMapping: { subject: 'NameID', email: 'email', username: 'username', nickname: 'displayName', phone: 'phone', department: 'department' },
    jitEnabled: false,
    defaultRoleIds: [],
    remark: '',
    createdAt: mockDateTime(),
    updatedAt: mockDateTime(),
  },
  {
    id: 3,
    tenantId: null,
    tenantName: null,
    name: '平台 AD',
    code: 'platform_ad',
    type: 'ad',
    status: 'enabled',
    issuer: null,
    authorizationEndpoint: null,
    tokenEndpoint: null,
    userinfoEndpoint: null,
    jwksUri: null,
    clientId: null,
    clientSecret: '',
    scopes: 'openid profile email',
    samlSsoUrl: null,
    samlEntityId: null,
    samlCertificate: '',
    ldapUrl: 'ldap://ad.example.com:389',
    ldapStartTls: true,
    ldapSkipTlsVerify: false,
    ldapBaseDn: 'dc=example,dc=com',
    ldapBindDn: 'cn=readonly,dc=example,dc=com',
    ldapBindPassword: '******',
    ldapUserFilter: '(&(objectClass=person)(|(sAMAccountName={{username}})(mail={{username}})))',
    ldapUserSearchFilter: '(&(objectClass=person)(|(displayName=*{{keyword}}*)(sAMAccountName=*{{keyword}}*)(mail=*{{keyword}}*)))',
    ldapSyncFilter: '(&(objectClass=person)(|(sAMAccountName=*)(mail=*)))',
    ldapGroupBaseDn: 'ou=groups,dc=example,dc=com',
    ldapGroupFilter: '(member={{dn}})',
    ldapTimeoutMs: 5000,
    attributeMapping: { subject: 'objectGUID', email: 'mail', username: 'sAMAccountName', nickname: 'displayName', phone: 'telephoneNumber', department: 'department' },
    jitEnabled: true,
    defaultRoleIds: [2],
    remark: '演示 AD 身份源',
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
      ldapUrl: body.ldapUrl ?? null,
      ldapStartTls: body.ldapStartTls ?? false,
      ldapSkipTlsVerify: body.ldapSkipTlsVerify ?? false,
      ldapBaseDn: body.ldapBaseDn ?? null,
      ldapBindDn: body.ldapBindDn ?? null,
      ldapBindPassword: body.ldapBindPassword ? '******' : '',
      ldapUserFilter: body.ldapUserFilter ?? null,
      ldapUserSearchFilter: body.ldapUserSearchFilter ?? null,
      ldapSyncFilter: body.ldapSyncFilter ?? null,
      ldapGroupBaseDn: body.ldapGroupBaseDn ?? null,
      ldapGroupFilter: body.ldapGroupFilter ?? null,
      ldapTimeoutMs: body.ldapTimeoutMs ?? 5000,
      attributeMapping: body.attributeMapping || { subject: 'sub', email: 'email', username: 'preferred_username', nickname: 'name', phone: 'phone_number', department: 'department' },
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
      ldapBindPassword: body.ldapBindPassword && body.ldapBindPassword !== '******' ? '******' : item.ldapBindPassword,
      updatedAt: mockDateTime(),
    });
    return ok(item, '更新成功');
  }),

  http.post(`${API}/api/identity-providers/:id/test`, ({ params }) => {
    const item = providers.find((provider) => provider.id === Number(params.id));
    if (!item) return HttpResponse.json({ code: 404, message: '身份源不存在', data: null });
    return ok({ ok: item.type === 'ldap' || item.type === 'ad', message: '连接成功', sampleUsers: directoryUsers.slice(0, 2) });
  }),

  http.get(`${API}/api/identity-providers/:id/ldap/users`, ({ request, params }) => {
    const item = providers.find((provider) => provider.id === Number(params.id));
    if (!item) return HttpResponse.json({ code: 404, message: '身份源不存在', data: null });
    const url = new URL(request.url);
    const keyword = (url.searchParams.get('keyword') || '').toLowerCase();
    const list = keyword
      ? directoryUsers.filter((user) => [user.username, user.nickname, user.email, user.department].some((value) => value?.toLowerCase().includes(keyword)))
      : directoryUsers;
    return ok(list);
  }),

  http.post(`${API}/api/identity-providers/:id/sync`, ({ params }) => {
    const item = providers.find((provider) => provider.id === Number(params.id));
    if (!item) return HttpResponse.json({ code: 404, message: '身份源不存在', data: null });
    return ok({
      logId: 1,
      status: 'success',
      total: directoryUsers.length,
      created: 1,
      linked: 0,
      updated: 1,
      skipped: 0,
      failed: 0,
      message: '同步完成：创建 1，绑定 0，更新 1，跳过 0，失败 0',
    }, '同步完成');
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

  http.post(`${API}/api/auth/enterprise/ldap/login`, async ({ request }) => {
    const body = await request.json() as { providerId: number; username: string; password: string; redirectTo?: string | null };
    const provider = providers.find((item) => item.id === body.providerId);
    if (!provider || (provider.type !== 'ldap' && provider.type !== 'ad')) {
      return HttpResponse.json({ code: 400, message: '身份源不可用', data: null });
    }
    if (!body.username || !body.password) {
      return HttpResponse.json({ code: 400, message: '目录账号或密码错误', data: null });
    }
    return HttpResponse.json({
      code: 0,
      message: '登录成功',
      data: {
        redirectTo: body.redirectTo || '/',
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
          token: { accessToken: 'mock-ldap-access-token', refreshToken: 'mock-ldap-refresh-token' },
        },
      },
    });
  }),

  http.get(`${API}/api/auth/enterprise/:id`, ({ params }) => {
    const provider = providers.find((item) => item.id === Number(params.id));
    return ok({
      authUrl: provider?.type === 'saml'
        ? `/enterprise/callback?samlTicket=demo-saml-ticket-${params.id}`
        : `/enterprise/callback?code=demo-code&state=demo-state-${params.id}`,
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

  http.post(`${API}/api/auth/enterprise/saml/exchange`, () => {
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
          token: { accessToken: 'mock-saml-access-token', refreshToken: 'mock-saml-refresh-token' },
        },
      },
    });
  }),
];
