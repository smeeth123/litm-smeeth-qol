import { SPECIAL_USES, specialUsed, configureMagicalTraceTracker } from "./circumstance-improvements.mjs";
import { invokedThemeSources } from "./personality-improvements.mjs";
import { giveImprovementStatus, promptImprovementStatus } from "./prodigious-improvements.mjs";
import { importSystemModule } from "./system-imports.mjs";
const MODULE_ID = "litm-smeeth-qol", SYSTEM_ID = "mist-engine-fvtt", TRACE_ID = "litmQolMonstrosityId";
const clone = value => foundry.utils.deepClone(value);
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
const special = (theme,name) => theme?.type==='themebook'&&!theme.system.options?.isStoryTheme&&theme.system.specialImprovements?.find(entry=>entry.active&&normalize(entry.name)===normalize(name));
const mayUse = (message,user) => user?.isGM||(message.author?.id??message.user?.id)===user?.id;
const cards = new Map();
var operation;
export function configureMonstrosityOperations(callback){operation=callback;}
export function extendMonstrositySchema(){
  if(game.system.id!=='mist-engine-fvtt')return;
  for(const Model of new Set([...Object.values(CONFIG.Actor.dataModels),CONFIG.Item?.dataModels?.['scene-data']].filter(Boolean))){const entry=Model.schema.fields.floatingTagsAndStatuses?.element;if(entry&&!entry.fields[TRACE_ID])entry.extendFields({[TRACE_ID]:new foundry.data.fields.StringField({required:false,blank:true,initial:''})});}
}
Hooks.once('init',extendMonstrositySchema);Hooks.once('setup',extendMonstrositySchema);
export async function handleMagicalTraceTracker(theme,key,used){
  if(key!=='magical-trace')return false;
  await operation({kind:'trace',themeUuid:theme.uuid,used});return true;
}
configureMagicalTraceTracker(handleMagicalTraceTracker);
async function applyTrace(payload,user){
  const theme=await fromUuid(payload.themeUuid),actor=theme?.parent,key='magical-trace';
  if(!user||!special(theme,'Magical Trace')||!(user.isGM||actor?.testUserPermission(user,'OWNER'))||!(game.user.isGM||actor?.isOwner))throw new Error('Only the Hero’s owner or Narrator can use Magical Trace.');
  const path=`flags.${MODULE_ID}.${SPECIAL_USES}.${key}`;
  if(payload.used===false){await theme.update({[path]:false});return true;}
  if(specialUsed(theme,key))return true;
  let pending=theme.getFlag(MODULE_ID,'magicalTracePending');
  if(!pending){pending={id:foundry.utils.randomID()};await theme.update({[`flags.${MODULE_ID}.magicalTracePending`]:pending});}
  const receipt=`${theme.uuid}:${pending.id}`,receipts=clone(actor.getFlag(MODULE_ID,'magicalTraceEffects')??[]);
  if(!receipts.includes(receipt)){
    const previous=theme.getFlag(MODULE_ID,'magicalTraceTag');
    const tags=clone(actor.system.floatingTagsAndStatuses??[]).filter(tag=>!previous?.id||tag[TRACE_ID]!==previous.id);
    tags.push({[TRACE_ID]:pending.id,name:'magical trace',isStatus:false,positive:true,value:0,markings:Array(6).fill(false),selected:false,burned:false,toBurn:false});receipts.push(receipt);
    await actor.update({'system.floatingTagsAndStatuses':tags,[`flags.${MODULE_ID}.magicalTraceEffects`]:receipts});
  }
  await theme.update({[path]:true,[`flags.${MODULE_ID}.magicalTraceTag`]:pending,[`flags.${MODULE_ID}.-=magicalTracePending`]:null});return true;
}
export function captureMonstrosityThemes(app,applied){
  if(!['quick','detailed','reaction'].includes(app.rollType))return[];
  const invoked=invokedThemeSources(app,applied),actors=new Map();
  const add=actor=>{if(actor)actors.set(actor.uuid,actor)};
  if(app._litmQolGroupRoll)for(const id of app._litmQolGroupRoll.actorIds??[])add(game.actors.get(id));else add(app.actor);
  for(const source of invoked)add(source.actorUuid===app.actor?.uuid?app.actor:game.actors.get(source.actorId));
  const result=[];
  for(const actor of actors.values())for(const theme of actor.items??[]){
    const used=invoked.some(source=>source.actorUuid===actor.uuid&&source.itemId===theme.id),invulnerable=special(theme,'Invulnerability');
    const display=used&&special(theme,'Display of Force')&&!specialUsed(theme,'display-of-force');
    if(display||invulnerable?.litmQolLegacyTag)result.push({actorUuid:actor.uuid,actorId:actor.id,itemId:theme.id,display:Boolean(display),protectionTagId:invulnerable?.litmQolLegacyTag??null});
  }return result;
}
function resultState(message){
  const state=message.getFlag(SYSTEM_ID,'detailedSpend');if(state)return{outcome:state.consequenceResult,consequences:state.consequenceResult<1||Boolean(state.pushYourLuck)};
  const root=document.createElement('div');root.innerHTML=message.content;const outcome=root.querySelector('.consequence-result-negative')?-1:root.querySelector('.consequence-result-neutral')?0:root.querySelector('.consequence-result-positive')?1:null;
  return{outcome,consequences:outcome===-1||outcome===0};
}
function sourceFor(message,entry,actor){
  const theme=actor?.items.get(entry.itemId);
  return entry.display&&special(theme,'Display of Force')&&(!specialUsed(theme,'display-of-force')||theme.getFlag(MODULE_ID,'specialImprovementMessages')?.['display-of-force']===message.uuid)?{actor,theme}:null;
}
export function displayForceCandidates(message){
  const state=resultState(message);if(message.getFlag(MODULE_ID,'displayOfForce')||message.getFlag(MODULE_ID,'foreseen')||state.outcome!==1||state.consequences)return[];
  return(message.getFlag(MODULE_ID,'rollContext')?.monstrosityThemes??[]).map(entry=>{const actor=globalThis.fromUuidSync?.(entry.actorUuid)??game.actors.get(entry.actorId);return actor?.uuid===entry.actorUuid?sourceFor(message,entry,actor):null}).filter(Boolean);
}
async function applyDisplay(payload,user){
  const message=await fromUuid(payload.messageUuid);
  if(!message||!mayUse(message,user))throw new Error('Only the roller or Narrator can use Display of Force.');
  if(message.getFlag(MODULE_ID,'displayOfForce'))return true;
  const state=resultState(message);if(state.outcome!==1||state.consequences)throw new Error('Display of Force requires Success without Consequences.');
  let choice;
  for(const entry of message.getFlag(MODULE_ID,'rollContext')?.monstrosityThemes??[]){const actor=await fromUuid(entry.actorUuid),source=sourceFor(message,entry,actor);if(source?.theme.uuid===payload.themeUuid){choice=source;break}}
  if(!choice||!(user.isGM||choice.actor.testUserPermission(user,'OWNER'))||!(game.user.isGM||choice.actor.isOwner))throw new Error('Display of Force is no longer available to this Hero.');
  return giveImprovementStatus(message,choice.theme,payload,user,{keyName:'display-of-force',pendingFlag:'displayForceDestinations',receiptFlag:'displayForceResults',resultFlag:'displayOfForce',tier:3,recipientTypes:['litm-npc']});
}
export async function applyMonstrosityOperation(payload,user){
  if(payload.kind==='trace')return applyTrace(payload,user);
  if(payload.kind==='display')return applyDisplay(payload,user);
  throw new Error('Unknown Monstrosity action.');
}
export async function applySurgeConsequences(message,context){
  for(const entry of context?.help?.adversity??[]){
    if(entry.feature!=='surge-of-power')continue;
    const actor=await fromUuid(entry.actorUuid),receipt=`${context.id}:${entry.itemId}`,receipts=clone(actor?.getFlag(MODULE_ID,'surgeStatusRolls')??[]);
    if(!actor||!(game.user.isGM||actor.isOwner))throw new Error('The Hero’s owner or Narrator is required to finish Surge of Power.');
    if(receipts.includes(receipt))continue;
    const{FloatingTagAndStatusAdapter}=await importSystemModule('lib/floating-tag-and-status-adapter.mjs');
    const tags=FloatingTagAndStatusAdapter.withStatusStacked(clone(actor.system.floatingTagsAndStatuses??[]),{name:'exhausted',isStatus:true,positive:false,value:2,markings:[false,true,false,false,false,false],selected:false,burned:false,toBurn:false});receipts.push(receipt);
    await actor.update({'system.floatingTagsAndStatuses':tags,[`flags.${MODULE_ID}.surgeStatusRolls`]:receipts});
  }
}
export function renderMonstrosityActions(message,root,use){
  root.querySelectorAll('.litm-qol-monstrosity-action,.litm-qol-monstrosity-note').forEach(element=>element.remove());
  if(message.getFlag(MODULE_ID,'foreseen')){cards.delete(message.uuid);return;}
  const note=text=>{const p=document.createElement('p');p.className='litm-qol-monstrosity-note';p.textContent=text;(root.querySelector('.roll-card')??root).append(p)};
  const result=message.getFlag(MODULE_ID,'displayOfForce');if(result)note(`Display of Force: gave ${result.name}-3 to ${result.destinationName}.`);
  const context=message.getFlag(MODULE_ID,'rollContext'),state=resultState(message);let tracked=false;
  if(state.consequences)for(const entry of context?.monstrosityThemes??[]){
    if(!entry.protectionTagId)continue;tracked=true;
    const actor=globalThis.fromUuidSync?.(entry.actorUuid)??game.actors.get(entry.actorId),theme=actor?.uuid===entry.actorUuid&&actor.items.get(entry.itemId),improvement=special(theme,'Invulnerability');
    const tag=improvement?.litmQolLegacyTag===entry.protectionTagId&&theme.system.powertags.find(tag=>tag.litmQolLegacyId===entry.protectionTagId&&!tag.burned&&!tag.planned&&!tag.expired&&tag.name?.trim());
    if(tag)note(`${context.group?`${actor.name} — `:''}Invulnerability (${tag.name}): ignore Consequences this protection applies to.`);
  }
  if(context?.help?.adversity?.some(entry=>entry.feature==='surge-of-power'))note('Surge of Power: gain exhausted-2 after resolving the roll. This status cannot be lessened.');
  if(mayUse(message,game.user))for(const{actor,theme}of displayForceCandidates(message)){
    if(!(game.user.isGM||actor.isOwner))continue;tracked=true;
    const button=document.createElement('button');button.type='button';button.className='litm-qol-monstrosity-action';button.textContent='Display of Force — Create Status';
    button.addEventListener('click',async()=>{if(button.disabled)return;button.disabled=true;try{await promptImprovementStatus(message,theme,payload=>use({...payload,kind:'display'}),{title:'Display of Force',feature:'displayOfForce',pendingFlag:'displayForceDestinations',tier:3,recipientTypes:['litm-npc'],description:'Name a tier-3 status representing amazement, respect, or fear.'});}catch(error){ui.notifications.error(error.message)}finally{renderMonstrosityActions(message,root,use)}});(root.querySelector('.roll-card')??root).append(button);
  }
  if(tracked)cards.set(message.uuid,{root,refresh:()=>renderMonstrosityActions(message,root,use)});else cards.delete(message.uuid);
}
Hooks.on('updateItem',item=>{if(item.type!=='themebook')return;for(const[id,card]of cards){if(card.root.isConnected)card.refresh();else cards.delete(id)}});
