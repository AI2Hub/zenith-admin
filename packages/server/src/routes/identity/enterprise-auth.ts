import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  commonErrorResponses,
  jsonContent,
  ok,
  okBody,
  validationHook,
} from '../../lib/openapi-schemas';
import { EnterpriseIdentityDiscoveryDTO, LoginResultDTO } from '../../lib/openapi-dtos';
import {
  discoverEnterpriseIdentityProviders,
  exchangeEnterpriseSamlTicket,
  generateEnterpriseAuthUrl,
  handleEnterpriseLdapLogin,
  handleEnterpriseOidcCallback,
  handleEnterpriseSamlAcs,
} from '../../services/identity/identity-providers.service';
import { getClientInfo } from '../../services/identity/auth.service';
import { enterpriseLdapLoginSchema } from '@zenith/shared/validation';

const router = new OpenAPIHono({ defaultHook: validationHook });

const discoverRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/providers',
    tags: ['EnterpriseAuth'],
    summary: '发现企业身份源',
    security: [],
    request: {
      query: z.object({
        tenantCode: z.string().optional(),
      }),
    },
    responses: { ...ok(EnterpriseIdentityDiscoveryDTO, 'ok'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { tenantCode } = c.req.valid('query');
    return c.json(okBody(await discoverEnterpriseIdentityProviders(tenantCode)), 200);
  },
});

const authUrlRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['EnterpriseAuth'],
    summary: '获取企业身份源授权链接',
    security: [],
    request: {
      params: z.object({
        id: z.coerce.number().int().positive().openapi({ param: { name: 'id', in: 'path' }, example: 1 }),
      }),
      query: z.object({
        redirect: z.string().optional(),
      }),
    },
    responses: { ...ok(z.object({ authUrl: z.string(), state: z.string().nullable() }), 'ok'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { redirect } = c.req.valid('query');
    const { ip, ua } = getClientInfo(c.req.raw.headers);
    return c.json(okBody(await generateEnterpriseAuthUrl(id, { ip, ua, redirectTo: redirect })), 200);
  },
});

const callbackRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/callback',
    tags: ['EnterpriseAuth'],
    summary: '企业 OIDC 登录回调',
    security: [],
    request: {
      body: {
        content: jsonContent(z.object({
          code: z.string(),
          state: z.string(),
        }).openapi('EnterpriseOidcCallbackBody')),
        required: true,
      },
    },
    responses: { ...ok(z.object({ loginResult: LoginResultDTO, redirectTo: z.string().nullable().optional() }), 'ok'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { code, state } = c.req.valid('json');
    return c.json(okBody(await handleEnterpriseOidcCallback(code, state)), 200);
  },
});

const ldapLoginRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/ldap/login',
    tags: ['EnterpriseAuth'],
    summary: '企业 LDAP/AD 登录',
    security: [],
    request: {
      body: {
        content: jsonContent(enterpriseLdapLoginSchema),
        required: true,
      },
    },
    responses: { ...ok(z.object({ loginResult: LoginResultDTO, redirectTo: z.string().nullable().optional() }), 'ok'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const body = c.req.valid('json');
    const { ip, ua } = getClientInfo(c.req.raw.headers);
    return c.json(okBody(await handleEnterpriseLdapLogin({ ...body, ip, ua })), 200);
  },
});

const samlAcsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/saml/acs',
    tags: ['EnterpriseAuth'],
    summary: '企业 SAML ACS 回调',
    security: [],
    responses: {
      302: { description: '重定向至前端企业登录回调页' },
      ...commonErrorResponses,
    },
  }),
  handler: async (c) => {
    const body = await c.req.parseBody();
    const samlResponse = typeof body.SAMLResponse === 'string' ? body.SAMLResponse : '';
    const relayState = typeof body.RelayState === 'string' ? body.RelayState : '';
    const result = await handleEnterpriseSamlAcs(samlResponse, relayState);
    return c.redirect(result.redirectUrl, 302);
  },
});

const samlExchangeRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/saml/exchange',
    tags: ['EnterpriseAuth'],
    summary: '兑换企业 SAML 登录票据',
    security: [],
    request: {
      body: {
        content: jsonContent(z.object({
          ticket: z.string(),
        }).openapi('EnterpriseSamlExchangeBody')),
        required: true,
      },
    },
    responses: { ...ok(z.object({ loginResult: LoginResultDTO, redirectTo: z.string().nullable().optional() }), 'ok'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { ticket } = c.req.valid('json');
    return c.json(okBody(await exchangeEnterpriseSamlTicket(ticket)), 200);
  },
});

router.openapiRoutes([discoverRoute, authUrlRoute, callbackRoute, ldapLoginRoute, samlAcsRoute, samlExchangeRoute] as const);

export default router;
