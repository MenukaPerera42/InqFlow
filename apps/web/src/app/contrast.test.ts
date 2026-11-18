import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/app/globals.css', 'utf8');

function token(name: string): string {
  const value = styles.match(
    new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'),
  )?.[1];
  if (!value) throw new Error(`Missing ${name} color token`);
  return value;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('brand color contrast', () => {
  it('keeps coral readable as small text on the canvas and white button text', () => {
    expect(contrast(token('coral'), token('canvas'))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(token('coral'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});
