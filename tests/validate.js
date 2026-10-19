const fs = require('fs');
const vm = require('vm');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('В index.html не найден встроенный JavaScript');

const source = match[1];
new vm.Script(source);

const instrumented = source.replace(
  /selectModel\(\);\s*}\)\(\);\s*$/,
  `globalThis.inspectLayout=(i,axis,mode,rowCount)=>{
    selector.value=i;
    diameterMode.value=mode;
    selectedAxis=axis;
    selectModel();
    shownRows=Math.min(rowCount,model.rows.length);
    rowsInput.value=shownRows;
    renderChoices();
    update();
    return {model,alternatives,tubeState,validation,metrics:el('metrics').innerHTML,cards:el('orientationOptions').innerHTML};
  };
  globalThis.demoVariantCount=variants.length;
  selectModel();})();`
);

const elements = new Map();
const defaults = {
  variant: 0,
  diameterMode: 'max',
  action: 'orbit',
  density: 7850,
  tare: '',
  acceleration: 0.3,
};
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, {
      value: defaults[id] ?? '', checked: true, innerHTML: '', textContent: '',
      appendChild() {}, addEventListener() {},
    });
  }
  return elements.get(id);
};

const sandbox = {
  document: {
    getElementById: element,
    createElement: () => ({appendChild() {}, label: ''}),
  },
  ResizeObserver: class { observe() {} },
  requestAnimationFrame() {},
  console,
};
vm.runInNewContext(instrumented, sandbox);

let states = 0;
for (let i = 0; i < sandbox.demoVariantCount; i++) {
  for (const mode of ['nominal', 'max']) {
    for (const axis of ['X', 'Y', 'Z']) {
      const initial = sandbox.inspectLayout(i, axis, mode, 1);
      for (let rows = 1; rows <= initial.model.rows.length; rows++) {
        const result = sandbox.inspectLayout(i, axis, mode, rows);
        const active = result.tubeState.filter((tube) => tube.level < rows);
        if (result.validation.outside.size || result.validation.pairs) {
          throw new Error(`Ошибка геометрии: вариант=${i}, ось=${axis}, режим=${mode}, ряды=${rows}`);
        }
        const formattedCount = active.length.toLocaleString('ru-RU', {maximumFractionDigits: 1});
        if (!result.metrics.includes(`${formattedCount} шт.`)) {
          throw new Error(`Не совпало количество: вариант=${i}, ось=${axis}, режим=${mode}, ряды=${rows}`);
        }
        states++;
      }
    }
  }
}

if (/ЧСГС|ООО|DN\s*\d|\\\\server|Производство/.test(html)) {
  throw new Error('Обнаружены возможные производственные идентификаторы');
}

console.log(`PASS: ${sandbox.demoVariantCount} демонстрационных позиций, ${states} проверенных состояний`);
