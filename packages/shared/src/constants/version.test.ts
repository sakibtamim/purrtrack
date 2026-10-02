import { describe, it, expect } from 'vitest';
import { APP_VERSION, APP_NAME, APP_VERSION_STRING, APP_VERSION_LABEL } from './version.js';

describe('Version Constants', () => {
  it('exports semantic version adhering to semver format', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_VERSION).toBe('1.0.0');
  });

  it('exports formatted version string and label', () => {
    expect(APP_NAME).toBe('PurrTrack');
    expect(APP_VERSION_STRING).toBe('v1.0.0');
    expect(APP_VERSION_LABEL).toBe('PurrTrack v1.0.0');
  });
});
