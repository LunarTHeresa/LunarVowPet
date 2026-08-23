const EXPRESSIONS = Object.freeze([
  Object.freeze({
    name: 'happy',
    label: '开心',
    symbol: '♥',
    line: '见到你，我就心情很好。'
  }),
  Object.freeze({
    name: 'shy',
    label: '害羞',
    symbol: '♡',
    line: '别、别一直这样看着我呀……'
  }),
  Object.freeze({
    name: 'curious',
    label: '好奇',
    symbol: '?',
    line: '嗯？你是不是在想什么有趣的事？'
  }),
  Object.freeze({
    name: 'sleepy',
    label: '困倦',
    symbol: 'Zzz',
    line: '稍微陪我安静一会儿，也很好。'
  }),
  Object.freeze({
    name: 'sparkle',
    label: '得意',
    symbol: '✦',
    line: '今天也要优雅地把事情做好。'
  }),
  Object.freeze({
    name: 'yandere',
    label: '病娇',
    symbol: '♥',
    line: '你会一直留在我身边的，对吧？'
  })
]);

function expressionByName(name) {
  return EXPRESSIONS.find((expression) => expression.name === name) || EXPRESSIONS[0];
}

function pickExpression(previousName = '', random = Math.random) {
  const choices = EXPRESSIONS.filter((expression) => expression.name !== previousName);
  const value = Number(random());
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(value, 0.999999999)) : 0;
  return choices[Math.floor(normalized * choices.length)];
}

module.exports = { EXPRESSIONS, expressionByName, pickExpression };
