import { sql } from 'drizzle-orm';
import { cmsContentWorkingCopies } from '../../db/schema/cms-revisions';

/** Use materialized small hashes: list/filter/count must not load whole documents. */
export function cmsWorkingHasUnpublishedChanges() {
  return sql<boolean>`(${cmsContentWorkingCopies.publishedRevisionId} is null or ${cmsContentWorkingCopies.publicationHash} is distinct from ${cmsContentWorkingCopies.publishedHash})`;
}
