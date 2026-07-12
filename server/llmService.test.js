const test = require('node:test');
const assert = require('node:assert');
const { parseJsonResponse, validateAndNormalize, normalizeAxis } = require('./llmService');

function gridPayload(overrides = {}) {
  const squares = [];
  let n = 1;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      squares.push({ number: n++, row, col, owner: n % 3 === 0 ? 'Sam' : '' });
    }
  }
  return {
    type: '5x5',
    xTeamName: 'Chiefs',
    yTeamName: '49ers',
    xAxis: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    yAxis: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    squares,
    prizes: { q1: 50, half: 100, q3: 50, final: 200 },
    ...overrides
  };
}

test('parseJsonResponse strips markdown code fences', () => {
  const payload = gridPayload();
  const wrapped = '```json\n' + JSON.stringify(payload) + '\n```';
  const result = parseJsonResponse(wrapped);
  assert.strictEqual(result.type, '5x5');
  assert.strictEqual(result.squares.length, 25);
});

test('parseJsonResponse throws a helpful error on truncated JSON', () => {
  assert.throws(
    () => parseJsonResponse('{"type": "5x5", "xTeamName": "Chi'),
    /Failed to parse LLM response as JSON/
  );
});

test('validateAndNormalize keeps a clean grid board intact with no warnings', () => {
  const result = validateAndNormalize(gridPayload());
  assert.deepStrictEqual(result.warnings, []);
  assert.deepStrictEqual(result.xAxis, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.strictEqual(result.prizes.final, 200);
});

test('validateAndNormalize rejects wrong square counts and bad types', () => {
  assert.throws(() => validateAndNormalize(gridPayload({ squares: [] })), /Expected 25 squares/);
  assert.throws(() => validateAndNormalize(gridPayload({ type: '7x7' })), /Invalid or missing board type/);
  assert.throws(() => validateAndNormalize(gridPayload({ xTeamName: '' })), /Missing team names/);
});

test('normalizeAxis repairs duplicates and reports what it changed', () => {
  const warnings = [];
  const result = normalizeAxis([0, 1, 2, 3, 4, 5, 6, 7, 8, 8], 'X-axis', warnings);
  assert.strictEqual(new Set(result).size, 10);
  assert.ok(result.includes(9));
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /X-axis position 10/);
  assert.match(warnings[0], /duplicate/);
});

test('normalizeAxis repairs unreadable digits and short axes with warnings', () => {
  const warnings = [];
  const result = normalizeAxis([0, 'x', 2, 3, 4, 5, 6, 7], 'Y-axis', warnings);
  assert.strictEqual(result.length, 10);
  assert.strictEqual(new Set(result).size, 10);
  assert.ok(warnings.some(w => /only 8 of 10 digits/.test(w)));
  assert.ok(warnings.some(w => /unreadable/.test(w)));
});

test('strip-10 squares get deduped digits with warnings', () => {
  const payload = {
    type: 'strip-10',
    xTeamName: 'Chiefs',
    yTeamName: '49ers',
    xAxis: [],
    yAxis: [],
    squares: Array.from({ length: 10 }, (_, i) => ({
      number: i + 1,
      owner: `P${i + 1}`,
      xDigits: i === 0 ? [3, 3, 5, 7, 9] : [0, 1, 2, 3, 4],
      yDigits: [i % 10, (i + 1) % 10]
    })),
    prizes: {}
  };
  const result = validateAndNormalize(payload);
  assert.deepStrictEqual(result.squares[0].xDigits, [3, 5, 7, 9]);
  assert.ok(result.warnings.some(w => /Square #1: duplicate digits/.test(w)));
  assert.ok(result.warnings.some(w => /Square #1: read 4 X-team digits/.test(w)));
});
