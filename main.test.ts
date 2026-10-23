import {assert,assertEquals,harness,bounded,readBenchCheckpoint,BENCH_GRAPH_KEY} from '../design-bench/test-support.ts';
const entry=new URL('./main.ts',import.meta.url).href;
const manifest=JSON.parse(await Deno.readTextFile(new URL('./manifest.json',import.meta.url)));
const png=btoa(String.fromCharCode(...[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0]));
const image=()=>({mime:'image/png',base64:png});
async function refused(work:Promise<any>,code:string){let error:any;try{await work}catch(e){error=e}assertEquals(error?.code,code);}
async function fixture(afterAppend?:(value:any)=>void){
 const saved:any[]=[],latest=new Map<string,any>(),waiting=new Map<string,(value:any)=>void>();
 const h=await harness({entry,packageId:'design-studio',files:new Map(),compactAssetIds:true,assetMetadata:true,agentSessions:[{windowId:'coder-1',ready:true,workspaceId:'qa-origin'}],imageSave:async a=>{saved.push(a);return {path:a.path,file:a.path,mime:'image/png',width:1,height:1,sha256:'saved',bytes:29}},onCheckpointAppend:(_key,_revision,value)=>{for(const run of value.runs||[]){latest.set(run.id,run);if(['completed','failed','handed-off','cancelled'].includes(run.status))waiting.get(run.id)?.(run)}afterAppend?.(value)}});
 const ctx={windowId:'person'};await h.spec.onOpen(ctx);
 const state=()=>h.call('benchState',{},ctx);
 const first=(await state()).workspace.selected;
 const input=(await h.call('benchSaveInputs',{name:'Relay',brief:'Live streams into editable shorts',references:[],revises:first},ctx)).artifact;
 async function approve(id:string){await h.call('benchOpen',{artifactId:id},ctx);const content=await h.call('benchContent',{artifactId:id},ctx);await h.spec.onMessage({...ctx,payload:{type:'benchApprove',artifactId:id,contentHash:content.contentHash}});assert((await state()).workspace.nodes.find((n:any)=>n.id===id).approved,'human approved exact revision');}
 const terminal=(run:any)=>latest.get(run.id)&&['completed','failed','handed-off','cancelled'].includes(latest.get(run.id).status)?Promise.resolve(latest.get(run.id)):bounded(new Promise<any>(resolve=>waiting.set(run.id,resolve)),'native run did not settle');
 return {h,ctx,state,input,approve,terminal,saved};
}
async function boards(afterAppend?:(value:any)=>void){
 const f=await fixture(afterAppend),{h,ctx,input,approve}=f;
 const directions=(await h.call('benchImportArtifact',{artifactId:input.id,images:[image(),image(),image(),image()]},ctx)).artifact;await approve(directions.id);
 const artboard=(await h.call('benchImportArtifact',{artifactId:directions.id,variant:1,images:[image()]},ctx)).artifact;await approve(artboard.id);
 const components=(await h.call('benchImportArtifact',{artifactId:artboard.id,images:[image()]},ctx)).artifact;await approve(components.id);
 const working=(await h.call('benchImportArtifact',{artifactId:components.id,format:'html',html:'<!doctype html><button>Make shorts</button>'},ctx)).artifact;
 await h.call('benchOpen',{artifactId:working.id},ctx);
 return {...f,directions,artboard,components,working};
}
Deno.test('Design Studio registers exact native manifest and binds one project family per window',async()=>{
 const {h,ctx,state,input}=await fixture();
 assertEquals(Object.keys(h.spec.commands).sort(),Object.keys(manifest.commands).sort());
 assertEquals(manifest.tabs.max,1);assertEquals(h.spec.commands.setHtml,undefined);
 const before=(await state()).workspace.studio.projectId;
 const opened=await h.call('studioNewWindow',{},ctx);assertEquals(opened.windowId,opened.hostId);
 await h.spec.onOpen({windowId:opened.windowId,hostId:opened.hostId,params:{studioNewProject:true}});
 const other=await h.call('benchState',{}, {windowId:opened.windowId});
 assert(other.workspace.studio.projectId!==before,'new window has a distinct project');
 assert(!other.workspace.nodes.some((n:any)=>n.id===input.id),'no cross-project content in snapshot');
 await refused(h.call('benchContent',{artifactId:input.id},{windowId:opened.windowId}),'forbidden');
 await refused(h.call('benchOpen',{artifactId:other.workspace.selected},ctx),'forbidden');
 await refused(h.call('benchContent',{artifactId:input.id,tabId:'closed'},{}),'invalid_args');
 await refused(h.call('benchSaveInputs',{name:'hidden project',brief:'x',references:[]},{}),'invalid_args');
 const checkpoint=readBenchCheckpoint(h).value;
 assert(checkpoint.workspace.nodes.length>=3,'native checkpoint retains both projects');
 await h.call('studioDraft',{artifactId:input.id,kind:'selection',text:'Keep tape',selection:{operationId:'retained-identity',attempt:{images:{ui:'asset-1'}}}},ctx);
 await h.call('studioPreferences',{reviewer:'Alex',autoAdvance:false},ctx);
 const confirmed=await state();assertEquals(confirmed.workspace.studio.preferences,{reviewer:'Alex',autoAdvance:false});
 assertEquals(confirmed.workspace.studio.drafts[input.id+':selection'].selection.operationId,'retained-identity');
});
Deno.test('four-stage production path derives components from artboard and ends at working HTML',async()=>{
 const f=await boards();const {h,ctx,artboard,components,working,terminal}=f;
 assertEquals(components.kind,'components');assertEquals(components.parent,artboard.id);
 const {run}=await h.call('benchGenerate',{artifactId:artboard.id},ctx);const done=await terminal(run);
 assertEquals(done.status,'completed');assertEquals(h.imageRequests.length,1);assertEquals(h.imageRequests[0].images.length,1);
 assert(h.imageRequests[0].prompt.includes('Concept artboard'),'ordered source label');
 await refused(h.call('benchGenerate',{artifactId:working.id},ctx),'invalid_args');
 const revise=await h.call('benchGenerate',{artifactId:working.id,note:'Preserve the tape',builder:'codex',builderWindowId:'coder-1'},ctx);
 const revised=await terminal(revise.run);assertEquals(revised.format,'html');assertEquals(revised.revises,working.id);assertEquals(revised.status,'handed-off');
 assert(h.agentCalls.some(c=>c.command==='ask'&&c.args.prompt.includes('wm.apps["design-studio"].publishBuild')),'native coding dispatch names Studio');
});
Deno.test('comparison evidence pins exact content and replaying one send dispatches once',async()=>{
 const {h,ctx,working,terminal,saved,state}=await boards();
 const content=await h.call('benchContent',{artifactId:working.id},ctx),staged=await h.call('benchStageInput',{...image(),name:'render'},ctx);
 const imageId=staged.id||staged.assetId||staged.asset?.id;
 assert(imageId,'staging returns owned asset');
 const capture=await h.call('studioCapture',{artifactId:working.id,contentHash:content.contentHash,imageId,width:1,height:1,theme:'dark'},ctx);
 const args={artifactId:working.id,captureId:capture.id,operationId:'send-comparison-0001',comment:'Match tape edges',area:{x:0,y:0,width:1,height:1},bounds:{x:0,y:0,width:1,height:1,totalWidth:1,totalHeight:1},images:{artwork:imageId,ui:imageId,difference:imageId},builder:'codex',builderWindowId:'coder-1'};
 const [first,replay]=await Promise.all([h.call('studioFeedback',args,ctx),h.call('studioFeedback',args,ctx)]);
 assertEquals(first.run.id,replay.run.id);const done=await terminal(first.run);assertEquals(done.status,'handed-off');
 assertEquals(h.agentCalls.filter(c=>c.command==='ask').length,1);assertEquals(saved.length,3);
 const annotation=done.studio.feedback.annotationId;
 await h.call('benchReplyAnnotation',{artifactId:working.id,id:annotation,text:'Keep this thread',operationId:'comparison-reply'},ctx);
 await h.call('benchRemoveAnnotation',{artifactId:working.id,id:annotation},ctx);
 assert((await h.call('benchAnnotationHistory',{artifactId:working.id},ctx)).annotations.some((note:any)=>note.id===annotation),'comparison thread remains in resolved history');
 await h.call('benchReopenAnnotation',{artifactId:working.id,id:annotation},ctx);
 assert(saved.every(a=>a.fallback.includes('not AI generated')),'truthful native image-save provenance');
 assert(h.agentCalls.find(c=>c.command==='ask').args.prompt.includes(saved[0].path),'agent receives actual evidence paths');
 assertEquals((await h.call('studioFeedback',args,ctx)).run.id,first.run.id);
 await refused(h.call('studioFeedback',{...args,comment:'different'},ctx),'conflict');
 const evidence=await h.call('studioEvidence',{artifactId:working.id,feedbackId:first.feedback.id,imageId},ctx);assertEquals(evidence.feedback.capture.contentHash,content.contentHash);
 assertEquals((await state()).workspace.studio.feedback[0].id,first.feedback.id);
 await refused(h.call('studioCapture',{artifactId:working.id,contentHash:'stale',imageId,width:1,height:1,theme:'dark'},ctx),'conflict');
 await refused(h.call('studioFeedback',{...args,operationId:'new-invalid-crop',bounds:{...args.bounds,width:2}},ctx),'invalid_args');
 const other=await h.call('studioNewWindow',{},ctx);await h.spec.onOpen({windowId:other.windowId});
 const published=await h.call('publishBuild',{runId:done.id,screen:'bench-build',version:done.id,html:'<!doctype html><button>Refined tape</button>',sourceHashes:done.sources},{windowId:other.windowId});
 assertEquals(published.run.status,'completed');assertEquals(published.artifact.revises,working.id);
 assertEquals((await h.call('benchState',{}, {windowId:other.windowId})).workspace.nodes.some((n:any)=>n.id===published.artifact.id),false);

});

Deno.test('an uncertain queued feedback save recovers the same run and dispatches once',async()=>{
 let armed=false,appends=0;
 const {h,ctx,working,terminal}=await boards(value=>{appends++;if(armed&&value.runs.some((r:any)=>r.studio?.operationId==='uncertain-send-0001')){armed=false;throw Object.assign(Error('Saved but acknowledgement lost'),{code:'state_durability_uncertain'})}});
 const content=await h.call('benchContent',{artifactId:working.id},ctx),{id}=await h.call('benchStageInput',{...image(),name:'render'},ctx);
 const capture=await h.call('studioCapture',{artifactId:working.id,contentHash:content.contentHash,imageId:id,width:1,height:1,theme:'light'},ctx);
 const args={artifactId:working.id,captureId:capture.id,operationId:'uncertain-send-0001',comment:'Match selection',area:{x:0,y:0,width:1,height:1},bounds:{x:0,y:0,width:1,height:1,totalWidth:1,totalHeight:1},images:{artwork:id,ui:id,difference:id},builder:'codex',builderWindowId:'coder-1'};
 armed=true;await refused(h.call('studioFeedback',args,ctx),'state_durability_uncertain');
 assertEquals(h.agentCalls.filter(c=>c.command==='ask').length,0,'no dispatch before acknowledged queue');
 const beforeReads=appends,uncertain=await h.call('benchState',{},ctx);
 assert(uncertain.storageError,'read retains uncertain durability boundary');
 await h.call('benchContent',{artifactId:working.id},ctx);await h.call('studioEvidence',{artifactId:working.id},ctx);
 assertEquals(appends,beforeReads,'reads must not acknowledge an uncertain mutation');
 const recovered=await h.call('studioFeedback',args,ctx),settled=await terminal(recovered.run);
 assertEquals(settled.status,'handed-off');assertEquals(h.agentCalls.filter(c=>c.command==='ask').length,1);
 const state=await h.call('benchState',{},ctx);assertEquals(state.runs.filter((r:any)=>r.studio?.operationId===args.operationId).length,1);
});

Deno.test('HTML changing between capture validation and queueing is never rebased onto old pixels',async()=>{
 const {h,ctx,working}=await boards(),content=await h.call('benchContent',{artifactId:working.id},ctx),{id}=await h.call('benchStageInput',{...image(),name:'render'},ctx);
 const capture=await h.call('studioCapture',{artifactId:working.id,contentHash:content.contentHash,imageId:id,width:1,height:1,theme:'light'},ctx);
 const app=(globalThis as any).app,call=app.call;let armed=true;
 app.call=async(agent:string,command:string,args:any)=>{if(armed&&command==='status'){armed=false;const path=[...h.files.keys()].find(path=>path.endsWith(`/${working.legacyScreen}/${working.legacyVersion}/index.html`))!;h.files.set(path,'<!doctype html><button>Changed during session lookup</button>')}return await call(agent,command,args)};
 await refused(h.call('studioFeedback',{artifactId:working.id,captureId:capture.id,operationId:'raced-feedback-0001',area:{x:0,y:0,width:1,height:1},bounds:{x:0,y:0,width:1,height:1,totalWidth:1,totalHeight:1},images:{artwork:id,ui:id,difference:id},builder:'codex',builderWindowId:'coder-1'},ctx),'conflict');
 assertEquals(h.agentCalls.filter(c=>c.command==='ask').length,0);assertEquals((await h.call('benchState',{},ctx)).runs.filter((r:any)=>r.studio?.operationId==='raced-feedback-0001').length,0);
});

Deno.test('Studio native input save opens its receipt in the same window and preserves newer edits',async()=>{
 const {h,ctx,state,input}=await fixture();await h.call('benchOpen',{artifactId:input.id},ctx);
 const read=await h.call('benchDraftRead',{},ctx),draft={artifactId:input.id,name:'Saved project',brief:'Saved real native draft',url:'',refs:[]};
 const written=await h.call('benchDraftWrite',{expectedRevision:read.revision,draft},ctx);
 await h.call('benchDraftBegin',{expectedRevision:written.revision,operationId:'native-save-0001',draft},ctx);
 const saved=await h.call('benchDraftCommit',{operationId:'native-save-0001'},ctx);
 await h.call('benchOpen',{artifactId:saved.artifact.id},ctx);assertEquals((await state()).workspace.selected,saved.artifact.id);
 const baseline=await h.call('benchDraftRead',{},ctx),unchanged={artifactId:saved.artifact.id,name:saved.artifact.name,brief:saved.artifact.brief,url:'',refs:saved.artifact.references};
 await h.call('benchDraftWrite',{expectedRevision:baseline.revision,draft:unchanged},ctx);
 const directions=(await h.call('benchImportArtifact',{artifactId:saved.artifact.id,images:[image(),image(),image(),image()]},ctx)).artifact;
 await h.call('benchOpen',{artifactId:directions.id},ctx);
 await h.call('benchOpen',{artifactId:saved.artifact.id},ctx);
 const fresh=await h.call('benchDraftRead',{},ctx);
 await h.call('benchDraftWrite',{expectedRevision:fresh.revision,draft:{...unchanged,brief:'Newer unsaved edit'}},ctx);
 await refused(h.call('benchOpen',{artifactId:directions.id},ctx),'conflict');
 assertEquals((await h.call('benchDraftRead',{},ctx)).value.draft.brief,'Newer unsaved edit');
});

Deno.test('uncertain clean navigation preserves active recovery for retry and cold native restore',async()=>{
 for(const cold of [false,true]){
  let armed=false;const f=await fixture(value=>{if(armed&&value.artifactId===f.input.id){armed=false;throw Object.assign(Error('Navigation acknowledgement lost'),{code:'state_durability_uncertain'})}});
  const {h,ctx,input}=f;await h.call('benchOpen',{artifactId:input.id},ctx);
  const read=await h.call('benchDraftRead',{},ctx),draft={artifactId:input.id,name:input.name,brief:input.brief,url:'',refs:input.references};
  await h.call('benchDraftWrite',{expectedRevision:read.revision,draft},ctx);
  const directions=(await h.call('benchImportArtifact',{artifactId:input.id,images:[image(),image(),image(),image()]},ctx)).artifact;
  armed=true;await refused(h.call('benchOpen',{artifactId:directions.id},ctx),'state_durability_uncertain');
  assertEquals((await h.call('benchState',{},ctx)).workspace.selected,input.id,'uncertain navigation stays on original input');
  if(cold){
   const restored=await harness({entry,packageId:'design-studio',store:h.store,checkpoints:h.checkpoints,files:h.files,compactAssetIds:true,assetMetadata:true});
   const restoredCtx={windowId:'restored'};await restored.spec.onOpen({...restoredCtx,reason:'restore',params:{artifactId:input.id,draftId:read.draftId}});
   assertEquals((await restored.call('benchDraftRead',{},restoredCtx)).value.draft.brief,input.brief);
   await restored.call('benchOpen',{artifactId:directions.id},restoredCtx);assertEquals((await restored.call('benchState',{},restoredCtx)).workspace.selected,directions.id);
  }else{
   await h.call('benchOpen',{artifactId:directions.id},ctx);assertEquals((await h.call('benchState',{},ctx)).workspace.selected,directions.id);
  }
 }
});

Deno.test('Studio Stop suppresses output and interrupts the exact coder despite graph storage failure',async()=>{
 const {h,ctx,working,terminal}=await boards();
 const {run}=await h.call('benchGenerate',{artifactId:working.id,note:'Refine controls',builder:'codex',builderWindowId:'coder-1'},ctx);await terminal(run);
 const checkpoints=(globalThis as any).app.checkpoints,read=checkpoints.read,append=checkpoints.append;
 checkpoints.read=(key:string)=>{if(key===BENCH_GRAPH_KEY)throw Error('Graph unreadable');return read(key)};
 checkpoints.append=(key:string,...rest:any[])=>{if(key===BENCH_GRAPH_KEY)throw Object.assign(Error('Graph write denied'),{code:'state_write_failed'});return append(key,...rest)};
 try{
  const [first,replay]=await Promise.all([h.call('benchCancel',{runId:run.id},ctx),h.call('benchCancel',{runId:run.id},ctx)]);
  assertEquals(first.stop.outputSuppressed,true);assertEquals(replay.stop.runId,run.id);
  assertEquals(first.stop.interrupt.status,'requested');assertEquals(first.stop.persistence.status,'pending');
  assertEquals(h.agentCalls.filter(c=>c.command==='interrupt').map(c=>[c.agent,c.args.windowId]),[['codex','coder-1']]);
 }finally{checkpoints.read=read;checkpoints.append=append}
 const repaired=await h.call('benchCancel',{runId:run.id},ctx);assertEquals(repaired.stop.persistence.status,'recorded');
 assertEquals(h.agentCalls.filter(c=>c.command==='interrupt').length,1);
 assertEquals(readBenchCheckpoint(h).value.runs.find((r:any)=>r.id===run.id).cancelRequested,true);
});
