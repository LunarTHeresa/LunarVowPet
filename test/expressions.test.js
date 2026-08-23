const test = require('node:test');
const assert = require('node:assert/strict');
const { EXPRESSIONS, expressionByName, pickExpression } = require('../src/expressions');

test('all expressions provide a unique render state and interaction copy', () => {
  assert.ok(EXPRESSIONS.length >= 6);
  assert.equal(new Set(EXPRESSIONS.map(({ name }) => name)).size, EXPRESSIONS.length);
  for (const expression of EXPRESSIONS) {
    assert.match(expression.name, /^[a-z]+$/);
    assert.ok(expression.label.length > 0);
    assert.ok(expression.symbol.length > 0);
    assert.ok(expression.line.length > 0);
  }
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

test('invalid random values are clamped safely', () => {
  assert.equal(pickExpression('', () => Number.NaN), EXPRESSIONS[0]);
  assert.equal(pickExpression('', () => -20), EXPRESSIONS[0]);
  assert.equal(pickExpression('', () => 20), EXPRESSIONS.at(-1));
});
