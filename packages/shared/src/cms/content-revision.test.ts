import { describe, expect, it } from 'vitest';
import { cmsEditorialStatusAfterPublication, cmsEditorialStatusAfterEdit, cmsPublicationValuesEqual } from './content-revision';

describe('editorial consistency after publication', () => {
  it('marks a retained newer working copy as draft when delivery rolls back', () => {
    expect(cmsEditorialStatusAfterPublication('clean', false)).toBe('draft');
  });
  it('keeps active review and decision states when another revision is delivered', () => {
    for (const state of ['draft', 'pending', 'rejected', 'approved'] as const) expect(cmsEditorialStatusAfterPublication(state, false)).toBe(state);
  });
  it('recognizes the exact matching publication', () => {
    expect(cmsEditorialStatusAfterPublication('approved', true)).toBe('clean');
  });
});

describe('publication changes are independent of editorial state', () => {
  it('preserves review decisions for unchanged public content', () => {
    for (const state of ['clean', 'draft', 'pending', 'rejected', 'approved'] as const) {
      expect(cmsEditorialStatusAfterEdit(state, false, true)).toBe(state);
    }
    expect(cmsEditorialStatusAfterEdit('approved', true, false)).toBe('draft');
    expect(cmsEditorialStatusAfterEdit('draft', true, true)).toBe('clean');
  });
  it('ignores operational metadata and document node identities without ignoring dependencies', () => {
    const source = { title: 'Title', body: '<p>Text</p>', ownerId: 1, dueAt: null, bodyDocument: { id: 'a' }, assetVersions: { '1': 1 } };
    expect(cmsPublicationValuesEqual(source, { ...source, ownerId: 2, dueAt: '2026-10-01', bodyDocument: { id: 'b' } })).toBe(true);
    expect(cmsPublicationValuesEqual(source, { ...source, title: 'Changed' })).toBe(false);
    expect(cmsPublicationValuesEqual(source, { ...source, assetVersions: { '1': 2 } })).toBe(false);
  });
});
