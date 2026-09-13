import { OpenAPIHono } from '@hono/zod-openapi';
import { sslCertificateContract } from '@zenith/shared/ops';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { fileBody, okBody, validationHook } from '../../lib/openapi-schemas';
import {
  deleteSslCertificate,
  generateSelfSignedCert,
  getSslCertificate,
  getSslCertificateDownload,
  listSslCertificates,
  uploadCert,
} from '../../services/ops/ssl-certificates.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const view = [authMiddleware, guard({ permission: 'system:ssl:view' })] as const;
const generateRoute = defineContractRoute(sslCertificateContract.generate, {
  middleware: [
    authMiddleware,
    guard({
      permission: 'system:ssl:create',
      audit: { description: '生成 SSL 证书', module: 'SSL 证书', recordBody: false },
    }),
  ],
  handler: async (c) => c.json(okBody(await generateSelfSignedCert(c.req.valid('json')), '证书已生成'), 200),
});

const uploadRoute = defineContractRoute(sslCertificateContract.upload, {
  middleware: [
    authMiddleware,
    guard({
      permission: 'system:ssl:create',
      audit: { description: '上传 SSL 证书', module: 'SSL 证书', recordBody: false },
    }),
  ],
  handler: async (c) => c.json(okBody(await uploadCert(c.req.valid('json')), '证书已上传'), 200),
});
const downloadRoute = defineContractRoute(sslCertificateContract.download, {
  middleware: view,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { kind = 'cert' } = c.req.valid('query');
    const download = await getSslCertificateDownload(id, kind);
    return fileBody(download.content, download.filename, download.contentType);
  },
});

mountCrud(router, sslCertificateContract,
  { list: listSslCertificates, get: getSslCertificate, remove: deleteSslCertificate },
  {
    permission: { read: 'system:ssl:view', write: 'system:ssl:delete' },
    label: ' SSL 证书',
    module: 'SSL 证书',
    messages: { remove: '证书已删除' },
  },
  [generateRoute, uploadRoute, downloadRoute],
);

export default router;
