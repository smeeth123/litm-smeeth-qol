import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { restoreForetoldForPrediction } from "./destiny-improvements.mjs";
const MODULE_ID = "litm-smeeth-qol", KEY = "foresee-the-outcome";
const clone = value => foundry.utils.deepClone(value);
const has = theme => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && entry.name?.trim().toLowerCase() === "foresee the outcome");
const systemFields = ["powertags","weaknesstags","items","floatingTagsAndStatuses","fellowships","improve","abandon","milestone","selected"];
const flagFields = [SPECIAL_USES,"specialImprovementMessages","usedThisSession","luckyBastardMessage","virtuosoMessage","catchMeWhenIFallMessage","fumblingImproveOverflow","diligentImprovements","diligentTrackSpent","nascentTheme","singleUseTagRecords","singleUseFloatingTags"];
const read = (doc,path) => foundry.utils.getProperty(doc,path);
const same = (a,b) => {
  if (a === MISSING || b === MISSING) return a === b;
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
};
const MISSING = Symbol("missing");
const conflict = () => { throw new Error("A resource changed after this roll. Undo that later change first, then retry Foresee the Outcome."); };
let operation;
export function configureForeseeOperation(callback) { operation = callback; }
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !["selected","toBurn"].includes(key)).map(([key,value]) => [key,clean(value)]));
  return value;
}
function snapshotDoc(doc, previous) {
  const tagIds = new Set((doc.system.floatingTagsAndStatuses ?? []).map(tag => tag.litmQolId).filter(Boolean));
  for (const field of previous?.values ?? []) if (field.path.endsWith('.singleUseTagRecords') || field.path.endsWith('.singleUseFloatingTags')) for (const record of field.value ?? []) tagIds.add(record.id);
  const values = [];
  for (const path of [...systemFields.filter(field => field !== 'selected').map(field=>`system.${field}`),...flagFields.map(field=>`flags.${MODULE_ID}.${field}`)]) {
    let value = read(doc,path);
    if (path.endsWith('.singleUseTagRecords') && value === undefined) value = doc.getFlag(MODULE_ID,'singleUseFloatingTags');
    if (value === undefined && ["fumblingImproveOverflow","diligentImprovements","diligentTrackSpent"].some(key => path.endsWith(`.${key}`))) value = 0;
    const exists = value !== undefined;
    if (Array.isArray(value) && (path.endsWith('.singleUseTagRecords') || path.endsWith('.singleUseFloatingTags'))) value = value.filter(record => tagIds.has(record.id));
    values.push({ path, exists, ...(exists ? { value: clean(clone(value)) } : {}) });
  }
  return { uuid: doc.uuid, values };
}
async function documentsFor(context, payload = {}) {
  const docs = new Map(), actors = new Map();
  const addActor = actor => { if(actor){actors.set(actor.uuid,actor);docs.set(actor.uuid,actor);for(const item of actor.items??[])if(['themebook','backpack','rote','quintessence'].includes(item.type))docs.set(item.uuid,item);} };
  for (const uuid of [context.actorUuid,payload.recipientActorUuid]) if(uuid)addActor(await fromUuid(uuid));
  if (!context.actorUuid) addActor(game.actors.get(context.actorId));
  for (const id of [...(context.group?.actorIds??[]),payload.actorId,...(context.helperActorIds??[])].filter(Boolean)) addActor(game.actors.get(id));
  for(const entry of [...(context.help?.burns??[]),...(context.help?.weaknesses??[]),...(context.help?.relationships??[]),...(context.help?.fellowshipTags??[]),...(context.help?.adversity??[])])addActor(entry.actorUuid?await fromUuid(entry.actorUuid):game.actors.get(entry.actorId));
  for(const use of context.singleUse??[]){const doc=await fromUuid(use.actorUuid);if(doc?.documentName==='Item'||doc?.type==='scene-data')docs.set(doc.uuid,doc);else addActor(doc);}
  for(const actor of [...actors.values()]){const card=game.actors.get(actor.system.actorSharedSingleThemecardId)??actor.sheet?.getActorFellowshipThemecard?.();if(card)addActor(card);}
  if(payload.themeUuid){const theme=await fromUuid(payload.themeUuid);if(theme){docs.set(theme.uuid,theme);addActor(theme.parent);}}
  for(const id of [context.sceneId,payload.sceneId].filter(Boolean)){const doc=game.items.find(item=>item.type==='scene-data'&&item.system.sceneKey===id);if(doc)docs.set(doc.uuid,doc);}
  for(const entry of context.extraDocs??[]) {const doc=await fromUuid(entry);if(doc)docs.set(doc.uuid,doc);}
  for(const entry of context.before??[]){const doc=await fromUuid(entry.uuid);if(doc)docs.set(doc.uuid,doc);}
  for(const entry of context.journal??[]){const doc=await fromUuid(entry.uuid);if(doc)docs.set(doc.uuid,doc);}
  return [...docs.values()].filter(doc=>doc.uuid);
}
export async function captureForeseeBefore(app, applied, help, singleUse) {
  if(!['quick','detailed','reaction'].includes(app.rollType))return null;
  const affected=app._litmQolGroupRoll?(app._litmQolGroupRoll.actorIds??[]).map(id=>game.actors.get(id)).filter(Boolean):[app.actor];
  const sources=[];for(const actor of affected)for(const theme of actor.items??[])if(has(theme)&&!specialUsed(theme,KEY))sources.push({actorUuid:actor.uuid,actorId:actor.id,itemId:theme.id});
  if(!sources.length)return null;
  const helperActorIds=[...new Set([...applied.map(tag=>tag.helperActorId??tag.actorId),...(app.helpingTags??[]).map(tag=>tag.helperActorId)].filter(Boolean))];
  const extraDocs=[...new Set(applied.map(tag=>tag.sceneDataItemId&&game.items.get(tag.sceneDataItemId)?.uuid).filter(Boolean))];
  const context={actorUuid:app.actor.uuid,actorId:app.actor.id,help,singleUse,group:app._litmQolGroupRoll,helperActorIds,extraDocs,sceneId:globalThis.canvas?.scene?.id??game.scenes?.active?.id};
  const docs=await documentsFor(context);
  return {sources,helperActorIds,extraDocs,before:docs.map(doc=>snapshotDoc(doc))};
}
function changes(before,after) {
  const result=[];const prior=new Map((before?.values??[]).map(field=>[field.path,field]));
  for(const field of after.values){const old=prior.get(field.path)??{path:field.path,exists:false};if(!same(old,field))result.push({path:field.path,before:old,after:field});}
  return result;
}
export async function finalizeForeseeJournal(message) {
  const context=message.getFlag(MODULE_ID,'rollContext'),foresee=context?.foresee;
  if(!foresee?.before||message.getFlag(MODULE_ID,'foreseen'))return;
  const docs=await documentsFor({...context,...foresee}),journal=[];
  for(const doc of docs){const before=foresee.before.find(entry=>entry.uuid===doc.uuid),after=snapshotDoc(doc,before),fields=changes(before,after);if(fields.length)journal.push({uuid:doc.uuid,fields});}
  await message.update({[`flags.${MODULE_ID}.foreseeJournal`]:journal,[`flags.${MODULE_ID}.rollContext`]:{...clone(context),foresee:{sources:foresee.sources,helperActorIds:foresee.helperActorIds,extraDocs:foresee.extraDocs,ready:true}}});
}
export async function recordForeseeOperation(message,payload,callback) {
  const context=message.getFlag(MODULE_ID,'rollContext');
  if(!context?.foresee?.ready||message.getFlag(MODULE_ID,'foreseen'))return callback();
  const priorJournal=clone(message.getFlag(MODULE_ID,'foreseeJournal')??[]);
  const scope={...context,...context.foresee,journal:priorJournal};
  const before=(await documentsFor(scope,payload)).map(doc=>snapshotDoc(doc));
  let result,error;
  try{result=await callback();}catch(caught){error=caught;}
  const entries=[];
  for(const doc of await documentsFor(scope,payload)){const old=before.find(entry=>entry.uuid===doc.uuid),after=snapshotDoc(doc,old),fields=changes(old,after);if(fields.length)entries.push({uuid:doc.uuid,fields});}
  if(entries.length)await message.update({[`flags.${MODULE_ID}.foreseeJournal`]:[...priorJournal,...entries]});
  if(error)throw error;
  return result;
}
function baseIdentity(value) {
  if(value&&typeof value==='object')return value.litmQolId?`single:${value.litmQolId}`:value.litmQolMonstrosityId?`trace:${value.litmQolMonstrosityId}`:value.litmQolDominionId?`decree:${value.litmQolDominionId}`:value.litmQolLegacyId?`tag:${value.litmQolLegacyId}`:value.id?`id:${value.id}`:value.relationshipTag!==undefined?`relationship:${value.relationshipTag}:${value.companion??''}`:`name:${value.name}:${Boolean(value.isStatus)}:${value.positive!==false}`;
  return JSON.stringify(value);
}
function keyed(values){const count=new Map();return values.map(value=>{const base=baseIdentity(value),number=count.get(base)??0;count.set(base,number+1);return{key:`${base}#${number}`,base,value};});}
function reverseArray(before,after,current,path){
  if([...before,...after,...current].some(value=>!value||typeof value!=='object'))return conflict();
  let result=clone(current);const a=keyed(before),b=keyed(after),keys=new Set([...a,...b].map(entry=>entry.key));
  for(const key of keys){const old=a.find(entry=>entry.key===key),next=b.find(entry=>entry.key===key),now=keyed(result).find(entry=>entry.key===key);
    if(!old&&next){if(!now)continue;const baseCount=list=>list.filter(entry=>entry.base===next.base).length;if(baseCount(keyed(result))!==baseCount(b))conflict();if(!same(clean(now.value),next.value))conflict();result.splice(keyed(result).findIndex(entry=>entry.key===key),1);}
    else if(old&&!next){if(now){if(!same(clean(now.value),old.value))conflict();continue;}const index=Math.min(a.findIndex(entry=>entry.key===key),result.length);result.splice(index,0,clone(old.value));}
    else if(old&&next&&!same(old.value,next.value)){if(!now)conflict();const index=keyed(result).findIndex(entry=>entry.key===key);result[index]=reverseValue(old.value,next.value,result[index],path);}
  }return result;
}
function reverseValue(before,after,current,path){
  if(same(before,after))return current;
  if(['system.improve','system.abandon','system.milestone',`flags.${MODULE_ID}.fumblingImproveOverflow`].includes(path)&&typeof before==='number'&&typeof after==='number'&&typeof current==='number')return Math.max(0,current-(after-before));
  if(same(current,before))return current;
  if(same(clean(current),after))return before;
  if(Array.isArray(before)||Array.isArray(after)){const value=reverseArray(Array.isArray(before)?before:[],Array.isArray(after)?after:[],Array.isArray(current)?current:[],path);return before===MISSING&&!value.length?MISSING:value;}
  if((before&&typeof before==='object')||(after&&typeof after==='object')){
    const result=current&&typeof current==='object'?clone(current):{};
    const keys=new Set([...Object.keys(before===MISSING?{}:before??{}),...Object.keys(after===MISSING?{}:after??{})]);
    for(const key of keys){if(['selected','toBurn'].includes(key))continue;const a=before!==MISSING&&before&&key in before?before[key]:MISSING,b=after!==MISSING&&after&&key in after?after[key]:MISSING,c=key in result?result[key]:MISSING;const value=reverseValue(a,b,c,`${path}.${key}`);if(value===MISSING)delete result[key];else result[key]=value;}
    return before===MISSING&&!Object.keys(result).length?MISSING:result;
  }
  return conflict();
}
function updatesFor(path,current,next,updates){
  if(same(current,next))return;
  if(next===MISSING){const parts=path.split('.'),key=parts.pop();updates[`${parts.join('.')}.-=${key}`]=null;return;}
  if(next&&typeof next==='object'&&!Array.isArray(next)){
    const old=current&&typeof current==='object'&&!Array.isArray(current)?current:{};
    for(const key of new Set([...Object.keys(old),...Object.keys(next)]))updatesFor(`${path}.${key}`,key in old?old[key]:MISSING,key in next?next[key]:MISSING,updates);
  }else updates[path]=next;
}
async function reversalPlans(message){
  const journal=message.getFlag(MODULE_ID,'foreseeJournal')??[],plans=new Map();
  const allowed = new Set([...systemFields.filter(field => field !== 'selected').map(field => `system.${field}`), ...flagFields.map(field => `flags.${MODULE_ID}.${field}`)]);
  for (const entry of journal) if (!Array.isArray(entry.fields) || entry.fields.some(field => !allowed.has(field.path))) throw new Error("This card’s undo data is invalid. Ask the Narrator to check it.");
  for(const entry of [...journal].reverse()){
    const doc=await fromUuid(entry.uuid);if(!doc)conflict();if(doc.getFlag(MODULE_ID,'foreseeReversals')?.includes(message.uuid))continue;
    let plan=plans.get(doc.uuid);if(!plan){plan={doc,values:new Map()};plans.set(doc.uuid,plan);}
    for(const field of entry.fields){const current=plan.values.has(field.path)?plan.values.get(field.path):(read(doc,field.path)===undefined?MISSING:clone(read(doc,field.path)));
      const before=field.before.exists?field.before.value:field.path.startsWith("system.")&&Array.isArray(field.after.value)?[]:MISSING,after=field.after.exists?field.after.value:MISSING;
      plan.values.set(field.path,reverseValue(before,after,current,field.path));}
  }
  return [...plans.values()].map(plan=>{const updates={};for(const[path,value]of plan.values)updatesFor(path,read(plan.doc,path)===undefined?MISSING:clone(read(plan.doc,path)),value,updates);const receipts=clone(plan.doc.getFlag(MODULE_ID,'foreseeReversals')??[]);receipts.push(message.uuid);updates[`flags.${MODULE_ID}.foreseeReversals`]=receipts;return{doc:plan.doc,updates};});
}
function totalFor(message){const root=document.createElement('div');root.innerHTML=message.content;const text=root.querySelector('.dice-total')?.textContent.trim();return text?Number(text):message.getFlag(MODULE_ID,'rollContext')?.roll?.total;}
export function foreseeCandidates(message){
  const context=message.getFlag(MODULE_ID,'rollContext');
  if(message.getFlag(MODULE_ID,'foreseen')||!context?.foresee?.ready||!['quick','detailed','reaction'].includes(context.rollType)||!Number.isFinite(totalFor(message))||totalFor(message)>9)return[];
  return(context.foresee.sources??[]).map(source=>{const actor=globalThis.fromUuidSync?.(source.actorUuid)??game.actors.get(source.actorId),theme=actor?.uuid===source.actorUuid&&actor.items.get(source.itemId);return has(theme)&&(!specialUsed(theme,KEY)||theme.getFlag(MODULE_ID,'specialImprovementMessages')?.[KEY]===message.uuid)?{actor,theme}:null;}).filter(Boolean);
}
export async function applyForeseeOutcome(payload,user){
  const message=await fromUuid(payload.messageUuid);
  if(!message||!(user?.isGM||(message.author?.id??message.user?.id)===user?.id))throw new Error('Only the roller or Narrator can use Foresee the Outcome.');
  if(message.getFlag(MODULE_ID,'foreseen'))return true;
  const choice=foreseeCandidates(message).find(choice=>choice.theme.uuid===payload.themeUuid);
  if(!choice||!(user.isGM||choice.actor.testUserPermission(user,'OWNER'))||!(game.user.isGM||choice.actor.isOwner))throw new Error('Foresee the Outcome is not available for this action.');
  await reversalPlans(message);
  await choice.theme.update({[`flags.${MODULE_ID}.${SPECIAL_USES}.${KEY}`]:true,[`flags.${MODULE_ID}.specialImprovementMessages.${KEY}`]:message.uuid});
  for(const plan of await reversalPlans(message))await plan.doc.update(plan.updates);
  await restoreForetoldForPrediction(message,user);
  await message.update({[`flags.${MODULE_ID}.foreseen`]:{themeUuid:choice.theme.uuid},[`flags.${MODULE_ID}.singleUseCleanupError`]:false});
  return true;
}
export function renderForeseeActions(message,root,use=operation){
  root.querySelectorAll('.litm-qol-foresee-action,.litm-qol-foresee-note').forEach(element=>element.remove());
  if(message.getFlag(MODULE_ID,'foreseen')){
    const p=document.createElement('p');p.className='litm-qol-foresee-note';p.textContent='Foresee the Outcome: this action was only a prediction. Disregard it and take a different action.';(root.querySelector('.roll-card')??root).prepend(p);
    for(const button of root.querySelectorAll('button'))button.disabled=true;
    for(const entry of root.querySelectorAll('[data-spend-undo]'))entry.setAttribute('aria-disabled','true');
    if(!root.dataset.litmQolForeseenBound){root.dataset.litmQolForeseenBound='true';root.addEventListener('click',event=>{if(event.target.closest('button,[data-spend-option],[data-spend-undo],[data-push-your-luck]')){event.preventDefault();event.stopImmediatePropagation();}},true);}return;
  }
  if(!(game.user.isGM||message.isAuthor))return;
  for(const{actor,theme}of foreseeCandidates(message)){
    if(!(game.user.isGM||actor.isOwner))continue;const button=document.createElement('button');button.type='button';button.className='litm-qol-foresee-action';button.textContent='Foresee the Outcome — Disregard Action';
    button.addEventListener('click',async()=>{if(button.disabled)return;button.disabled=true;try{await use({messageUuid:message.uuid,themeUuid:theme.uuid});}catch(error){ui.notifications.error(error.message);}finally{renderForeseeActions(message,root,use);}});(root.querySelector('.roll-card')??root).append(button);
  }
}
