import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canVouch, validateStatement, STATEMENT_MAX } from '../src/lib/vouches.ts';

test('canVouch: only rider and above', () => {
  assert.equal(canVouch('rider'), true);
  assert.equal(canVouch('wingleader'), true);
  assert.equal(canVouch('fledgling'), false);
  assert.equal(canVouch(null), false);
  assert.equal(canVouch(''), false);
});

test('validateStatement: requires non-empty, bounded', () => {
  assert.equal(validateStatement('   ').ok, false);
  assert.equal(validateStatement('x'.repeat(STATEMENT_MAX + 1)).ok, false);
  const ok = validateStatement('  Flew three hard flights with me.  ');
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.statement, 'Flew three hard flights with me.');
});
