import { SEED_NUMBERING_BINDINGS, SEED_NUMBERING_RULES, SEED_NUMBERING_VERSIONS } from '@zenith/shared/seed';
import type { NumberingAllocation, NumberingCounter } from '@zenith/shared/platform';

export const mockNumberingRules = structuredClone(SEED_NUMBERING_RULES);
export const mockNumberingVersions = structuredClone(SEED_NUMBERING_VERSIONS);
export const mockNumberingBindings = structuredClone(SEED_NUMBERING_BINDINGS);
export const mockNumberingAllocations: NumberingAllocation[] = [];
export const mockNumberingCounters: (NumberingCounter & { ruleId: number })[] = [];
