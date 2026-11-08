'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calcState, getRisiko, getAutoAction } = require('../src/services/stateEngine');

// Thresholds matching default .env
const AMBANG_ASAP = 300;
const AMBANG_SUHU = 40;

describe('stateEngine — 8 states', () => {
  const cases = [
    // [suhu, mq2, api, expectedState, expectedKipas, expectedPompa, expectedBuzzer]
    [30,   100, 0, 1, 'OFF', 'OFF', 'DIAM'],
    [45,   100, 0, 2, 'ON',  'OFF', 'BERDENYUT'],
    [30,   500, 0, 3, 'ON',  'OFF', 'BERDENYUT'],
    [45,   500, 0, 4, 'ON',  'OFF', 'BERDENYUT'],
    [30,   100, 1, 5, 'OFF', 'ON',  'KONTINU'],
    [45,   100, 1, 6, 'OFF', 'ON',  'KONTINU'],
    [30,   500, 1, 7, 'OFF', 'ON',  'KONTINU'],
    [45,   500, 1, 8, 'OFF', 'ON',  'KONTINU'],
  ];

  for (const [suhu, adc, api, expState, expKipas, expPompa, expBuzzer] of cases) {
    it(`state ${expState}: suhu=${suhu} adc=${adc} api=${api}`, () => {
      const kode = calcState(suhu, adc, api, AMBANG_ASAP, AMBANG_SUHU);
      assert.equal(kode, expState);
      const action = getAutoAction(kode);
      assert.equal(action.kipas,  expKipas);
      assert.equal(action.pompa,  expPompa);
      assert.equal(action.buzzer, expBuzzer);
    });
  }
});

describe('stateEngine — boundary values', () => {
  it('suhu=40 adc=300 api=0 → state 1 (boundaries not included)', () => {
    assert.equal(calcState(40, 300, 0, AMBANG_ASAP, AMBANG_SUHU), 1);
  });

  it('suhu=40.1 adc=301 api=0 → state 4', () => {
    assert.equal(calcState(40.1, 301, 0, AMBANG_ASAP, AMBANG_SUHU), 4);
  });

  it('suhu=null (sensor error) → not panas', () => {
    assert.equal(calcState(null, 100, 0, AMBANG_ASAP, AMBANG_SUHU), 1);
  });

  it('mq2_adc=null (sensor error) → not asap', () => {
    assert.equal(calcState(30, null, 0, AMBANG_ASAP, AMBANG_SUHU), 1);
  });
});

describe('stateEngine — getRisiko', () => {
  it('state 1 → AMAN',    () => assert.equal(getRisiko(1), 'AMAN'));
  it('state 2 → WASPADA', () => assert.equal(getRisiko(2), 'WASPADA'));
  it('state 4 → WASPADA', () => assert.equal(getRisiko(4), 'WASPADA'));
  it('state 5 → BAHAYA',  () => assert.equal(getRisiko(5), 'BAHAYA'));
  it('state 8 → BAHAYA',  () => assert.equal(getRisiko(8), 'BAHAYA'));
});
