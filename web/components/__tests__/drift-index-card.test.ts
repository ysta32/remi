import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { HowHesDoing } from '../HowHesDoing';
import { DriftIndexChart, DriftLegend, DriftIndexTooltip } from '../research/DriftIndexChart';
import { runDriftIndex } from '@/lib/analysis/drift-index';
import type { DriftIndexView, Timeline } from '@/lib/types';
vi.stubGlobal('React', React);
const view = {
 language:'en', baselineProgress:{ familiarizationCalls:2,familiarizationRequired:2,baselineCalls:8,baselineRequired:8,ready:true },
 eligibleCallCount:12,monitoredCallCount:2,completedMonitoringWeeks:0,
 repeatCoverage:{knownCallCount:12,unknownCallCount:0,unpromptedStoryCount:7},
 provenance:{isSimulated:true,timing:'synthetic_authored',computation:'read_only',notificationDelivery:'not_performed'},
 rules:{},
 result:runDriftIndex(Array.from({length:12},(_,i)=>({callId:String(i),day:Math.floor(i/3)*7+i%3*2,adequate:true,values:{speech_rate:120-i},repeats:0,moodLow:null}))),
} as DriftIndexView;
const timeline = {elder:{preferredName:'Hal'},consent:{elderConfirmed:true,effective:{speechTrends:true}},markers:[],repeats:[],driftIndex:view} as unknown as Timeline;
const render = (t=timeline) => renderToStaticMarkup(React.createElement(HowHesDoing,{timeline:t}));
it('renders exact twelve-call baseline and monitoring state even without other markers',()=>{
 const html=render();
 for(const text of ['Drift Index','12 eligible calls','2 of 2 familiarization calls','8 of 8 baseline calls','2 calls after baseline','0 completed monitoring weeks','No completed monitoring week yet','7 unprompted repeated stories','12 of 12 eligible calls','authored','not measured from audio','No notification has been sent']) expect(html).toContain(text);
 expect(html.match(/<td>learning his usual<\/td>/g)).toHaveLength(4);
});
it('preserves omission and respects consent even if a stale DTO is present',()=>{
 expect(render({...timeline,driftIndex:undefined})).not.toContain('Drift Index');
 expect(render({...timeline,consent:{...timeline.consent,effective:{...timeline.consent.effective,speechTrends:false}}})).not.toContain('Drift Index');
 expect(render({...timeline,consent:{...timeline.consent,elderConfirmed:false}})).not.toContain('Drift Index');
});
it('describes incomplete baseline, unknown repeats and unknown timing honestly',()=>{
 const html=render({...timeline,driftIndex:{...view,baselineProgress:{...view.baselineProgress,baselineCalls:3,ready:false},repeatCoverage:{knownCallCount:0,unknownCallCount:12,unpromptedStoryCount:0},provenance:{...view.provenance,timing:'unknown'}}});
 for(const text of ['Learning his usual','3 of 8 baseline calls','12 calls have unknown repeat results','Repeat counts are unavailable','Timing provenance is unknown']) expect(html).toContain(text);
 expect(html).not.toContain('0 unprompted repeated stories');
});
it('uses computed wording throughout chart while retaining research defaults',()=>{
 const weeks=[{week:1,weeklyD:2,ewma:2,baselineWeek:false,watch:false,nudge:true}];
 const family=renderToStaticMarkup(React.createElement(DriftIndexChart,{weeks,title:'test',computedStates:true}));
 expect(family).toContain('nudge rule met'); expect(family).not.toContain('family note');
 expect(renderToStaticMarkup(React.createElement(DriftLegend,{computedStates:true}))).toContain('Nudge rule line');
 expect(renderToStaticMarkup(React.createElement(DriftIndexChart,{weeks,title:'research'}))).toContain('family note');
});

it('distinguishes known zero and stored timing, and renders computed tooltip flags without delivery claims',()=>{
 const html=render({...timeline,driftIndex:{...view,repeatCoverage:{knownCallCount:12,unknownCallCount:0,unpromptedStoryCount:0},provenance:{...view.provenance,isSimulated:false,timing:'stored_call_timing'}}});
 expect(html).toContain('0 unprompted repeated stories'); expect(html).toContain('Computed from stored call timing');
 const point={week:5,weeklyD:2,baselineWeek:false,watch:false,nudge:true,wellbeingCard:true};
 const tooltip=renderToStaticMarkup(React.createElement(DriftIndexTooltip,{active:true,payload:[{payload:point}],computedStates:true}));
 expect(tooltip).toContain('Nudge rule met · no notification sent'); expect(tooltip).toContain('Wellbeing rule met (computed only)'); expect(tooltip).not.toContain('Family note sent'); expect(tooltip).not.toContain('card shown');
 expect(renderToStaticMarkup(React.createElement(DriftIndexTooltip,{active:true,payload:[{payload:point}]}))).toContain('Family note sent');
});

it('shows monitoring computed states instead of a delivered family message',()=>{
 const week={...view.result.weeks[0],week:4,baselineWeek:false,weeklyD:2,nudge:true,watch:false};
 const html=render({...timeline,driftIndex:{...view,completedMonitoringWeeks:1,result:{...view.result,weeks:[week]}}});
 expect(html).toContain('Nudge rule met (computed only)'); expect(html).not.toContain('Family note sent');
 const wellbeing=renderToStaticMarkup(React.createElement(DriftIndexChart,{weeks:[{...week,nudge:false,wellbeingCard:true}],title:'test',computedStates:true}));
 expect(wellbeing).toContain('wellbeing rule met (computed only)');
});
it('labels an unscored monitoring week as insufficient data only in family mode',()=>{
 const weeks=[{week:5,weeklyD:null,ewma:null,baselineWeek:false,watch:false,nudge:false}];
 const family=renderToStaticMarkup(React.createElement(DriftIndexChart,{weeks,title:'family',computedStates:true}));
 expect(family).toContain('<td>insufficient monitoring data</td>');
 expect(family).not.toContain('<td>steady</td>');
 const research=renderToStaticMarkup(React.createElement(DriftIndexChart,{weeks,title:'research'}));
 expect(research).toContain('<td>steady</td>');
});
