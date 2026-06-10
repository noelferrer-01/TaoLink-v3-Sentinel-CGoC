// Vitest component test setup — extends expect with @testing-library/jest-dom matchers
// and wires up automatic DOM cleanup after each test.
import { expect, afterEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);

// Cleanup after every test so DOM doesn't leak between cases
afterEach(cleanup);
