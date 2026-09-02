/* 測試執行器：node tests/run.js */
'use strict';
const { runAll } = require('./harness');

require('./rules.test.js');
require('./spells.test.js');
require('./ui.test.js');
require('./flow.test.js');

runAll().then(bad => process.exit(bad ? 1 : 0));
