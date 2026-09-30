import { sql, type SQLWrapper } from 'drizzle-orm';
import { CMS_NON_PUBLICATION_FIELDS } from '@zenith/shared/cms';

/** A change fingerprint only; revision integrity continues to use SHA-256. */
export function cmsPublicationDigestSql(snapshot: SQLWrapper) {
  const excluded = sql.raw(`ARRAY[${CMS_NON_PUBLICATION_FIELDS.map((field) => `'${field}'`).join(',')}]::text[]`);
  return sql<string>`md5((${snapshot} - ${excluded})::text)`;
}
