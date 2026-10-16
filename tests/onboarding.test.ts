import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingStep } from '../src/lib/onboarding.ts';

// Pure function: the counts → spine-state collapse. onboardingCounts itself is
// a D1 read, exercised by the live e2e; here we pin the precedence rules.
const counts = (over: Partial<Parameters<typeof onboardingStep>[0]> = {}) => ({
  flights: 0,
  verified: 0,
  vouches: 0,
  devices: 0,
  pending: 0,
  ...over,
});

test('onboardingStep: not-paired with no devices, no pending, no flights', () => {
  assert.equal(onboardingStep(counts()), 'not-paired');
  // vouches never advance the spine on their own.
  assert.equal(onboardingStep(counts({ vouches: 3 })), 'not-paired');
});

test('onboardingStep: paired-no-flight once a device is linked', () => {
  assert.equal(onboardingStep(counts({ devices: 1 })), 'paired-no-flight');
  assert.equal(onboardingStep(counts({ devices: 4 })), 'paired-no-flight');
});

test('onboardingStep: flight-in-review while a submission is live and nothing published', () => {
  assert.equal(onboardingStep(counts({ devices: 1, pending: 1 })), 'flight-in-review');
  // A by-hand flight files without a device, so pending alone qualifies.
  assert.equal(onboardingStep(counts({ pending: 2 })), 'flight-in-review');
});

test('onboardingStep: published dominates once a flight is published', () => {
  assert.equal(onboardingStep(counts({ flights: 1 })), 'published');
  // Published wins even with a device linked and another flight still pending.
  assert.equal(onboardingStep(counts({ flights: 3, pending: 2, devices: 1 })), 'published');
});

test('onboardingStep: verified is an overlay, not a step', () => {
  assert.equal(onboardingStep(counts({ flights: 2, verified: 2 })), 'published');
});
