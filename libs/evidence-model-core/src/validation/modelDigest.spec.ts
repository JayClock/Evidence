import { describe, expect, it } from 'vitest';
import { createProcurementModel } from '../testing/modelFixture.js';
import { digestOf } from './modelDigest.js';

describe('canonical model digest', () => {
  it('keeps fixed SHA-256 vectors including UTF-8 and the final newline', () => {
    expect(digestOf(null)).toBe(
      'sha256:38e0b9de817f645c4bec37c0d4a3e58baecccb040f5718dc069a72c7385a0bed',
    );
    expect(digestOf({ b: [true, null, '履约'], a: 1 })).toBe(
      'sha256:809d8d435c38f365e0e2ecb0dcb8de52f673bf1afb9bf0a32be73eaaed190bf0',
    );
  });

  it('pins a complete model digest and ignores object key order', () => {
    const model = createProcurementModel();
    expect(digestOf(model)).toBe(
      'sha256:ccf346727688c1945b6488b1fa5813f07b62ca37004eaedb16da69f77339bd0e',
    );
    expect(digestOf({ z: model, a: 1 })).toBe(digestOf({ a: 1, z: model }));
  });
});
