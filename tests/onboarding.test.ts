import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingStep, onboardingRail, ONBOARDING_STEPS, RAIL_BY_HAND_LABEL, RAIL_FOOTNOTE } from '../src/lib/onboarding.ts';

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

// The rail: counts → four steps, the current one, and the rider's minutes.
// Same D1 counts as the spine, re-read for the /start rail and strip.
const rail = (over: Partial<Parameters<typeof onboardingRail>[0]> = {}) =>
  onboardingRail({ handleClaimed: true, devices: 0, pending: 0, flights: 0, profileDone: false, ...over });
const doneOf = (r: ReturnType<typeof onboardingRail>) => r.steps.map((s) => s.done);

test('ONBOARDING_STEPS: four steps, numbered, only the profile optional, hands-on minutes 1·3·1·1', () => {
  assert.deepEqual(ONBOARDING_STEPS.map((s) => s.id), ['handle', 'agent', 'flight', 'profile']);
  assert.deepEqual(ONBOARDING_STEPS.map((s) => s.n), [1, 2, 3, 4]);
  assert.deepEqual(ONBOARDING_STEPS.map((s) => s.required), [true, true, true, false]);
  assert.deepEqual(ONBOARDING_STEPS.map((s) => s.minutes), [1, 3, 1, 1]);
  assert.deepEqual(ONBOARDING_STEPS.map((s) => s.name), ['Claim your handle', 'Enable your agent', 'First flight', 'Your profile']);
});

test('onboardingRail: unclaimed handle → step 1 current, about 4 min', () => {
  const r = rail({ handleClaimed: false });
  assert.equal(r.current, 'handle');
  assert.equal(r.minutesLeft, 4);
  assert.equal(r.label, 'about 4 min of yours');
  assert.equal(r.flight, false);
  assert.equal(r.requiredDone, false);
  assert.equal(r.footnote, RAIL_FOOTNOTE);
  assert.deepEqual(doneOf(r), [false, false, false, false]);
  assert.deepEqual(r.steps.map((s) => s.n), [1, 2, 3, 4]);
});

test('onboardingRail: fresh (claimed, nothing else) → step 2 current, about 3 min', () => {
  const r = rail();
  assert.equal(r.current, 'agent');
  assert.equal(r.minutesLeft, 3);
  assert.equal(r.label, 'about 3 min of yours');
  assert.equal(r.footnote, "Your agent's part isn't on the clock.");
  assert.deepEqual(doneOf(r), [true, false, false, false]);
});

test('onboardingRail: paired → step 3 current, the flight joins the clock, about 1 min', () => {
  const r = rail({ devices: 1 });
  assert.equal(r.current, 'flight');
  assert.equal(r.minutesLeft, 1);
  assert.equal(r.label, 'about 1 min of yours');
  assert.equal(r.flight, false);
  assert.equal(r.requiredDone, false);
  assert.equal(r.footnote, RAIL_FOOTNOTE);
  assert.deepEqual(doneOf(r), [true, true, false, false]);
});

test('onboardingRail: by hand (pending, no device) → flight "hand", step 3 hollow, step 2 still current', () => {
  for (const over of [{ pending: 1 }, { flights: 1 }, { pending: 2, flights: 1 }]) {
    const r = rail(over);
    assert.equal(r.flight, 'hand', JSON.stringify(over));
    assert.equal(r.steps[2].done, 'hand');
    assert.equal(r.current, 'agent');
    assert.equal(r.requiredDone, false);
    assert.equal(r.label, RAIL_BY_HAND_LABEL);
    assert.equal(r.label, 'Flying by hand — pair your agent and the next flight is signed.');
    assert.doesNotMatch(r.label, /\d/); // a sentence, never a number
    assert.equal(r.footnote, null);
    assert.deepEqual(doneOf(r), [true, false, 'hand', false]);
  }
});

test('onboardingRail: in review with a device → nothing current, Done., 0 min, no footnote', () => {
  for (const over of [{ devices: 1, pending: 1 }, { devices: 2, flights: 1 }, { devices: 1, pending: 1, flights: 3 }]) {
    const r = rail(over);
    assert.equal(r.flight, 'agent', JSON.stringify(over));
    assert.equal(r.current, null);
    assert.equal(r.requiredDone, true);
    assert.equal(r.minutesLeft, 0);
    assert.equal(r.label, 'Done.');
    assert.equal(r.footnote, null);
    assert.deepEqual(doneOf(r), [true, true, true, false]);
  }
});

test('onboardingRail: the optional step is never current and never moves the clock', () => {
  const states = [
    { handleClaimed: false },
    {},
    { devices: 1 },
    { pending: 1 },
    { devices: 1, pending: 1 },
    { devices: 1, flights: 2 },
  ];
  for (const over of states) {
    const off = rail({ ...over, profileDone: false });
    const on = rail({ ...over, profileDone: true });
    assert.equal(on.current, off.current, JSON.stringify(over));
    assert.equal(on.minutesLeft, off.minutesLeft, JSON.stringify(over));
    assert.equal(on.label, off.label, JSON.stringify(over));
    assert.equal(on.footnote, off.footnote, JSON.stringify(over));
    assert.equal(on.requiredDone, off.requiredDone, JSON.stringify(over));
    assert.equal(off.steps[3].done, false);
    assert.equal(on.steps[3].done, true);
    assert.notEqual(on.current, 'profile');
  }
  // required steps done, profile not → still nothing current, still Done.
  const r = rail({ devices: 1, pending: 1, profileDone: false });
  assert.equal(r.current, null);
  assert.equal(r.label, 'Done.');
});

test('onboardingRail: step shape carries id, n, name, minutes, required, done', () => {
  const r = rail({ devices: 1 });
  assert.deepEqual(r.steps[1], { id: 'agent', n: 2, name: 'Enable your agent', minutes: 3, required: true, done: true });
  assert.deepEqual(r.steps[3], { id: 'profile', n: 4, name: 'Your profile', minutes: 1, required: false, done: false });
  // the step table itself is never mutated by a call
  assert.equal('done' in ONBOARDING_STEPS[0], false);
});
