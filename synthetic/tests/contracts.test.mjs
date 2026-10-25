import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, toDetectorCall, serialize } from '../src/contracts.mjs';
import { parseCall } from '../../detector/src/contracts.mjs';

test('defaults provide a four-week twelve-call schedule and timing rules', () => {
  assert.deepEqual(resolveConfig(), {schemaVersion:1, seed:42, startDate:'2026-09-28', callsPerWeek:3, weeks:4, timezone:'America/New_York',localHour:10,weekdays:[0,2,4],slotsPerCall:5,pauseCentersMs:[600,850,1100,1400],pauseJitterMs:75,pausesPerCall:8,minDurationMs:180000,maxDurationMs:300000});
  assert.equal(resolveConfig().weeks * resolveConfig().callsPerWeek, 12);
});
test('presets choose exact weekday patterns without shared mutable arrays', () => {
  for (const [callsPerWeek, weekdays] of [[2,[0,3]],[3,[0,2,4]],[4,[0,1,3,4]]]) assert.deepEqual(resolveConfig({callsPerWeek}).weekdays, weekdays);
  const first=resolveConfig(); first.weekdays.push(6); first.pauseCentersMs[0]=0;
  assert.deepEqual(resolveConfig().weekdays,[0,2,4]);
  assert.equal(resolveConfig().pauseCentersMs[0],600);
});
test('strict raw configuration rejects malformed values and unknown own keys', () => {
  for (const raw of [null,[],42,'x',{schemaVersion:2},{schemaVersion:'1'},{weeks:4},{extra:true},{seed:undefined},{seed:-1},{seed:0.5},{seed:4294967296},{seed:NaN},{seed:Infinity},{seed:'42'},{callsPerWeek:1},{callsPerWeek:5},{callsPerWeek:2.5},{callsPerWeek:'3'},{startDate:'2026-02-30'},{startDate:'2026-13-01'},{startDate:'2026-00-01'},{startDate:'2026-09-00'},{startDate:'2026-09-29'},{startDate:'2026-9-28'},{startDate:'1999-12-27'},{startDate:'2100-01-04'},{startDate:'2026-09-28T00:00:00Z'}, {[Symbol('unknown')]:1}]) assert.throws(()=>resolveConfig(raw), `accepted ${String(raw)}`);
});
test('seed endpoints and valid leap-year Monday resolve', () => {
  assert.equal(resolveConfig({seed:0,startDate:'2000-01-03'}).seed,0);
  assert.equal(resolveConfig({seed:4294967295,startDate:'2024-02-26'}).seed,4294967295);
});
function source() {return {elderId:'synthetic-profile',callId:'call_1',startedAt:'2026-09-28T10:00:00-04:00',isSimulated:true,split:'SENTINEL',incidentId:'SENTINEL',expectedMatches:['SENTINEL'],groundTruth:{label:'SENTINEL'},utterances:[{speaker:'caller',text:'I remember the garden.',startMs:0,endMs:1500,words:[{w:'SENTINEL'}],label:'SENTINEL'},{speaker:'agent',text:'Tell me more.',startMs:1600,endMs:2400,incidentId:'SENTINEL'}]};}
test('export uses actual parser and removes every non-allowlisted source field', () => {
  const canonical=source(); const output=toDetectorCall(canonical);
  assert.deepEqual(output,{elderId:'synthetic-profile',callId:'call_1',startedAt:'2026-09-28T14:00:00.000Z',isSimulated:true,utterances:[{speaker:'caller',text:'I remember the garden.',startMs:0,endMs:1500},{speaker:'agent',text:'Tell me more.',startMs:1600,endMs:2400}]});
  assert.deepEqual(parseCall(output),output);
  assert.equal(JSON.stringify(output).includes('SENTINEL'),false);
  output.utterances[0].text='changed'; output.utterances.push({});
  assert.equal(canonical.utterances[0].text,'I remember the garden.'); assert.equal(canonical.utterances.length,2);
});
test('export rejects non-simulated calls and invalid actual detector inputs', () => {
  for (const isSimulated of [false,undefined,1,'true']) assert.throws(()=>toDetectorCall({...source(),isSimulated}));
  for (const change of [{elderId:''},{startedAt:'2026-02-30T10:00:00Z'},{utterances:[{speaker:'other',text:'hi',startMs:0,endMs:1}]},{utterances:[{speaker:'caller',text:'hi',startMs:10,endMs:1}]}]) assert.throws(()=>toDetectorCall({...source(),...change}));
});
test('serialization produces deterministic pretty JSON with a terminal LF', () => {
  assert.equal(serialize({a:[1,2],b:true}),'{\n  "a": [\n    1,\n    2\n  ],\n  "b": true\n}\n');
});
