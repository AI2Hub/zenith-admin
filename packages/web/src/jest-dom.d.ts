// Ambient type augmentation bridging @testing-library/jest-dom matchers into
// Vitest's Assertion interface. Vitest v4 moved its `expect` typings into the
// `@vitest/expect` package (the `vitest` package only re-exports the type),
// so jest-dom's own `./vitest` type augmentation (which targets the `vitest`
// module) no longer merges. We re-declare the same augmentation against
// `@vitest/expect` instead so matchers like `toBeInTheDocument()` type-check.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module '@vitest/expect' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- mirrors jest-dom's own augmentation pattern
  interface Assertion<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- mirrors jest-dom's own augmentation pattern
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}

export {};
