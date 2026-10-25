import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRng,shuffle,stableId} from '../src/random.mjs';
test('SHA-256 little-endian seed and mulberry32 sequence are reproducible',()=>{
 const rng=makeRng(42,'schedule');
 assert.deepEqual(Array.from({length:4},()=>rng()),[0.7987425299361348,0.17692595347762108,0.1270128923933953,0.9869534957688302]);
});
test('named streams are independent and every draw is in [0,1)',()=>{
 const a=makeRng(42,'a'), b=makeRng(42,'a'), other=makeRng(42,'b');
 other(); other();
 for(let i=0;i<1000;i++){const next=a();assert.equal(next,b());assert.ok(next>=0 && next<1);}
 assert.notEqual(makeRng(42,'a')(),makeRng(42,'b')());
 assert.notEqual(makeRng(42,'a')(),makeRng(43,'a')());
});
test('Fisher-Yates returns a copy and uses the supplied stream',()=>{
 const input=['a','b','c','d'];
 assert.deepEqual(shuffle(input,()=>0),['b','c','d','a']);
 assert.deepEqual(input,['a','b','c','d']); assert.notEqual(shuffle(input,()=>0),input);
 assert.deepEqual(shuffle([],()=>0),[]);
});
test('stable IDs hash an unambiguous parts tuple and retain namespace',()=>{
 assert.equal(stableId('call','a',1),'call_135f17a475a61afdeeaf3759');
 assert.notEqual(stableId('call','a','b'),stableId('call','a,b'));
 assert.equal(stableId('other','a',1),'other_135f17a475a61afdeeaf3759');
});
