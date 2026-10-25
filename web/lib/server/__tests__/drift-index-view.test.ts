import { afterEach, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '@/db/migrate';
import { runDriftIndex } from '@/lib/analysis/drift-index';
const adapter = await import('../drift-index-view').catch(() => null);
const db = new Database(':memory:'); migrate(db);
afterEach(() => { db.exec('DELETE FROM call_markers; DELETE FROM calls; DELETE FROM elders'); });
function setup(n: number) {
 db.prepare("INSERT INTO elders(id,display_name,preferred_name,language,primary_contact_name,created_at) VALUES('e','E','E','en','F','now')").run();
 for(let i=0;i<n;i++) {
 const at = new Date(Date.UTC(2026,0,1)+ (Math.floor(i/3)*7+i%3*2)*86400000).toISOString();
 db.prepare("INSERT INTO calls(id,elder_id,started_at,language,status,created_at,is_simulated) VALUES(?,'e',?,'en','done','now',1)").run(String(i),at);
 db.prepare("INSERT INTO call_markers(call_id,marker,value,unit,confidence) VALUES(?,'speech_rate',?,'wpm','high')").run(String(i),120-i);
 }
}
function view(mood=false) { expect(adapter?.buildDriftIndexView).toBeTypeOf('function'); return adapter!.buildDriftIndexView(db,'e','en',{speechTrends:true,mood})!; }
it('withholds all computation without speech consent', () => { setup(12); expect(adapter?.buildDriftIndexView).toBeTypeOf('function'); expect(adapter!.buildDriftIndexView(db,'e','en',{speechTrends:false,mood:true})).toBeUndefined(); });
it('reports insufficient baseline without fabricating monitoring', () => { setup(5); const v=view(); expect(v.baselineProgress).toEqual({familiarizationCalls:2,familiarizationRequired:2,baselineCalls:3,baselineRequired:8,ready:false}); expect(v.result.baseline).toBeNull(); expect(v.monitoredCallCount).toBe(0); });
it('keeps the twelve-call four-week schedule at two monitored calls and zero completed monitoring weeks', () => {
 setup(12); const before=db.serialize(); const v=view();
 expect(v.eligibleCallCount).toBe(12); expect(v.monitoredCallCount).toBe(2); expect(v.completedMonitoringWeeks).toBe(0);
 expect(v.repeatCoverage).toEqual({knownCallCount:0,unknownCallCount:12,unpromptedStoryCount:0});
 expect(v.result).toEqual(runDriftIndex(Array.from({length:12},(_,i)=>({callId:String(i),day:Math.floor(i/3)*7+i%3*2,adequate:true,values:{speech_rate:120-i},repeats:null,moodLow:null}))));
 expect(db.serialize()).toEqual(before); expect(JSON.stringify(v)).not.toMatch(/utterances|quote|embedding/);
});
it('filters language, status, nonfinite and low-confidence markers', () => {
 setup(12); db.prepare("UPDATE calls SET language='zh' WHERE id='0'").run(); db.prepare("UPDATE calls SET status='failed' WHERE id='1'").run(); db.prepare("UPDATE call_markers SET confidence='low' WHERE call_id='2'").run(); db.prepare("UPDATE call_markers SET value=? WHERE call_id='3'").run(Infinity);
 const v=view(); expect(v.eligibleCallCount).toBe(8); expect(v.result.baseline).toBeNull();
});

it('keeps mood unknown without separate consent and honors known low mood with it', () => {
 setup(12); db.prepare("UPDATE calls SET mood_label='low'").run();
 expect(view(false).result.weeks.every(w=>!w.wellbeingCard)).toBe(true);
 expect(view(true).result.weeks.at(-1)!.wellbeingCard).toBe(true);
 expect(view().provenance.timing).toBe('unknown');
});
