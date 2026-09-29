import { boolean, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { cmsSites } from './cms';
import { idColumn, timestampColumns } from './common';

/** Small derived state retained with the site, independent of event retention. */
export const cmsCollectionStates = pgTable('cms_collection_states', {
  siteId: integer().primaryKey().references(() => cmsSites.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull(), knownSince: timestamp({ withTimezone: true }).notNull().defaultNow(),
  purgedThrough: timestamp({ withTimezone: true }), ...timestampColumns({ withTimezone: true }),
});
/** State transitions prove pauses; the absence of page views never proves a pause. */
export const cmsCollectionTransitions = pgTable('cms_collection_transitions', {
  id: idColumn(), siteId: integer().notNull().references(() => cmsSites.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull(), reason: varchar({ length: 40 }).notNull(), deploymentId: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, t => [index('cms_collection_transitions_site_created_idx').on(t.siteId, t.createdAt, t.id)]);
