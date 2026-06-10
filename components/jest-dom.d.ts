// Extend Vitest's Assertion type with @testing-library/jest-dom matchers.
// This file is referenced via tsconfig so TSC knows about matchers like toBeInTheDocument.
/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/vitest';
