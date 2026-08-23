const test = require('node:test');
const assert = require('node:assert/strict');
const { EXPRESSIONS, expressionByName, createExpressionPicker, pickExpression } = require('../src/expressions');

test('all expressions provide a unique render state and interaction copy', () => {
  assert.equal(EXPRESSIONS.length, 7);
  assert.equal(new Set(EXPRESSIONS.map(({ name }) => name)).size, EXPRESSIONS.length);
  for (const expression of EXPRESSIONS) {
    assert.match(expression.name, /^[a-z]+$/);
    assert.ok(expression.label.length > 0);
    assert.ok(expression.symbol.length > 0);
    assert.ok(expression.line.length > 0);
  }
});

test('idle artwork is a first-class selectable state', () => {
  const expression = expressionByName('idle');
  assert.equal(expression.name, 'idle');
  assert.equal(expression.label, '待机');
});

test('yandere is a first-class selectable expression', () => {
  const expression = expressionByName('yandere');
  assert.equal(expression.name, 'yandere');
  assert.equal(expression.label, '病娇');
  assert.match(expression.line, /身边/);
});

test('random expression does not immediately repeat', () => {
  for (const previous of EXPRESSIONS.map(({ name }) => name)) {
    assert.notEqual(pickExpression(previous, () => 0).name, previous);
    assert.notEqual(pickExpression(previous, () => 0.999999).name, previous);
  }
});

test('shuffle bag shows every state once before starting a new cycle', () => {
  const picker = createExpressionPicker(() => 0.42);
  let previous = '';
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const seen = [];
    for (let index = 0; index < EXPRESSIONS.length; index += 1) {
      const expression = picker(previous);
      assert.notEqual(expression.name, previous);
      seen.push(expression.name);
      previous = expression.name;
    }
    assert.deepEqual(new Set(seen), new Set(EXPRESSIONS.map(({ name }) => name)));
  }
});

test('invalid random values are clamped safely', () => {
  for (const value of [Number.NaN, -20, 20]) {
    const picker = createExpressionPicker(() => value);
    const seen = [];
    let previous = '';
    for (let index = 0; index < EXPRESSIONS.length; index += 1) {
      const expression = picker(previous);
      assert.ok(EXPRESSIONS.includes(expression));
      assert.notEqual(expression.name, previous);
      seen.push(expression.name);
      previous = expression.name;
    }
    assert.equal(new Set(seen).size, EXPRESSIONS.length);
  }
});
