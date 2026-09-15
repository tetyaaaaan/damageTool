"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
 POLICY, REQUIRED_MILESTONES, taskDigest, scopeDigest, validateDeferral, buildWorkProgress
} = require("../../scripts/genshinWorkDisposition.cjs");
const raw = Buffer.from("persisted evidence");
const ref = {path:"reports/fixture-proof.json",sha256:crypto.createHash("sha256").update(raw).digest("hex")};
const context={targetGameVersion:"7.0",readArtifact:()=>raw};
function fixture() {
 const task={candidateId:"weapon:fixture",layer:"weaponEffectSpec",dataset:"weapons",terminalState:"blocked",
  task:{kind:"sourceProvider",status:"reopenOnTrigger",taskId:"source-reopen:fixture",autoProcessableNow:false},
  searchFrontier:{scopeMatched:true,exhausted:true,searchScope:"field/value",lastSearchedAt:"2026-08-28",
   providersExamined:["A","B"],reopenTrigger:"provider-owned version-bound field published"},
  certificate:{strictEligible:false},deferredLanes:[],autoProcessableNow:false};
 const decision={id:"defer:fixture",kind:"genshinEvidenceDeferral",policyId:POLICY,candidateId:task.candidateId,
  targetGameVersion:"7.0",queueTaskDigest:taskDigest(task),
  assessment:{actorId:"Sol",assessedAt:"2026-08-28T01:00:00Z",reason:"bounded field sources absent"},
  fieldFindings:[{field:"value",knownStatus:"localOnly",currentValue:12,historicalValue:null,missingEvidence:"independent7.0field"}],
  search:{scope:task.searchFrontier.searchScope,lastSearchedAt:task.searchFrontier.lastSearchedAt,
   providersExamined:task.searchFrontier.providersExamined,negativeResult:"Neither provider supplies exact target fields",
   unsearchedScope:[],reopenTrigger:task.searchFrontier.reopenTrigger,nextTask:"Revalidate exact field",artifactRefs:[ref]},
  safety:{impact:"effect not verified",action:"do not enable canonical",runtimeStatus:"notEnabled",artifactRefs:[ref]}};
 return {task,decision};
}
function boundedFixture() {
 const {task,decision}=fixture();
 task.searchFrontier={...task.searchFrontier,status:"deferred",exhausted:false};
 const remainingSearches=["provider-owned immutable target-version field manifest"];
 decision.search.unsearchedScope=remainingSearches;
 decision.queueTaskDigest=taskDigest(task);
 decision.assessment.boundedScope={candidateId:task.candidateId,taskId:task.task.taskId,
  remainingSearches,notExecutableReasons:["No executable source comparison or consumer/code task remains in this candidate task"],artifactRefs:[ref]};
 return {task,decision};
}
function exhaustedRemainderFixture() {
 const {task,decision}=fixture();
 task.searchFrontier={...task.searchFrontier,status:"searchExhausted",exhausted:true};
 const remainingSearches=["external provider manifest unavailable to this bounded review"];
 decision.search.unsearchedScope=remainingSearches;
 decision.queueTaskDigest=taskDigest(task);
 decision.assessment.boundedScope={candidateId:task.candidateId,taskId:task.task.taskId,
  remainingSearches,notExecutableReasons:["The remaining external source is unavailable and has no executable comparison task"],artifactRefs:[ref]};
 return {task,decision};
}
test("source frontier labels alone never close r2 work",()=>{
 const {task}=fixture(); const p=buildWorkProgress([task],{},context);
 assert.equal(p.summary.evidenceDeferred,0);assert.equal(p.goalComplete,false);
 assert.equal(p.records[0].work.status,"pending");
});
test("bound reviewed evidence deferral closes work but never verifies or promotes",()=>{
 const {task,decision}=fixture();
 const p=buildWorkProgress([task],{decisions:[decision]},context);
 assert.equal(p.summary.evidenceDeferred,1);assert.equal(p.candidateWorkComplete,true);
 assert.equal(p.goalComplete,false);assert.equal(p.records[0].evidence.strictEligible,false);
 assert.equal(p.records[0].work.verificationGranted,false);assert.equal(p.records[0].work.promotionGranted,false);
 assert.equal(task.task.status,"reopenOnTrigger");
 });
test("candidate-bound review can close a finite non-exhaustive source wait",()=>{
 const {task,decision}=boundedFixture();
 assert.equal(validateDeferral(decision,task,context).valid,true);
 const p=buildWorkProgress([task],{decisions:[decision]},context);
 assert.equal(p.summary.evidenceDeferred,1);assert.equal(p.candidateWorkComplete,true);
 assert.equal(p.goalComplete,false);assert.equal(p.records[0].evidence.status,"unverified");
 assert.equal(p.records[0].work.verificationGranted,false);assert.equal(p.records[0].work.promotionGranted,false);
});
test("exhausted frontier may retain an explicitly assessed external remainder",()=>{
 const {task,decision}=exhaustedRemainderFixture();
 assert.equal(validateDeferral(decision,task,context).valid,true);
 const p=buildWorkProgress([task],{decisions:[decision]},context);
 assert.equal(p.summary.evidenceDeferred,1);assert.equal(p.candidateWorkComplete,true);
 assert.equal(p.records[0].evidence.status,"unverified");
});
test("an exhausted frontier with an unassessed remainder stays open",()=>{
 const {task,decision}=exhaustedRemainderFixture();delete decision.assessment.boundedScope;
 assert.equal(validateDeferral(decision,task,context).valid,false);
});
test("non-exhaustive deferral needs an exact candidate/task-bound remaining-scope assessment",()=>{
 for(const mutate of [
  d=>delete d.assessment.boundedScope,
  d=>d.assessment.boundedScope.candidateId="other-candidate",
  d=>d.assessment.boundedScope.taskId="other-task",
  d=>d.assessment.boundedScope.remainingSearches=["different unsearched scope"],
  d=>d.search.unsearchedScope=[],
  d=>d.assessment.boundedScope.notExecutableReasons=[],
  d=>d.assessment.boundedScope.artifactRefs=[]
 ]){
  const {task,decision}=boundedFixture();mutate(decision);
  assert.equal(validateDeferral(decision,task,context).valid,false);
 }
});
test("bounded review cannot hide a concrete source, consumer, or code task",()=>{
 for(const change of [
  {task:{kind:"fieldComparison",status:"ready"}},
  {task:{kind:"sourceProvider",status:"ready"}},
  {deferredLanes:[{kind:"consumer"}]},
  {searchFrontier:{status:"searchRequired"}}
 ]){
  const {task,decision}=boundedFixture();Object.assign(task,change);decision.queueTaskDigest=taskDigest(task);
  assert.equal(validateDeferral(decision,task,context).valid,false);
 }
});
test("unknown field evidence remains unverified after bounded deferral",()=>{
 const {task,decision}=boundedFixture();decision.fieldFindings[0].knownStatus="unknown";
 const p=buildWorkProgress([task],{decisions:[decision]},context);
 assert.equal(p.records[0].evidence.status,"unverified");assert.equal(p.records[0].evidence.strictEligible,false);
});
test("deferral rejects missing safety, field, search metadata and tampered artifacts",()=>{
 for(const mutate of [d=>delete d.safety,d=>delete d.fieldFindings,d=>delete d.search.negativeResult,
  d=>d.search.artifactRefs[0]={...ref,sha256:"0".repeat(64)},d=>d.safety.artifactRefs=[]]){
 const {task,decision}=fixture();mutate(decision);assert.equal(validateDeferral(decision,task,context).valid,false);
 }
});
test("deferral rejects mutable queue and source-frontier coordination refs",()=>{
 const {task,decision}=fixture();
 for(const path of ["reports/genshin-evidence-task-queue.json","games/genshin/data/v2/source-search-frontiers.json"]){
  const tampered=JSON.parse(JSON.stringify(decision));
  tampered.search.artifactRefs=[{...ref,path}];
  tampered.safety.artifactRefs=[{...ref,path}];
  assert.equal(validateDeferral(tampered,task,context).valid,false,path);
  assert.ok(validateDeferral(tampered,task,context).errors.some((error)=>error.startsWith("mutableCoordinationArtifactRef:")),path);
 }
});
test("stale task, different version or observed reopen trigger invalidates deferral",()=>{
 const {task,decision}=fixture();
 assert.equal(validateDeferral(decision,{...task,mappingStatus:"changed"},context).valid,false);
 assert.equal(validateDeferral(decision,task,{...context,targetGameVersion:"7.1"}).valid,false);
 assert.equal(validateDeferral(decision,task,{...context,reopenedCandidateIds:[task.candidateId]}).valid,false);
});
test("concrete executable or deferred consumer task cannot be hidden",()=>{
 for(const change of [{autoProcessableNow:true},{deferredLanes:[{kind:"consumer"}]},{task:{kind:"fieldComparison",status:"ready"}}]){
 const {task,decision}=fixture();Object.assign(task,change);decision.queueTaskDigest=taskDigest(task);
 assert.equal(validateDeferral(decision,task,context).valid,false);
 }
});
test("duplicate and orphan decisions cannot silently complete work",()=>{
 const {task,decision}=fixture();
 assert.equal(buildWorkProgress([task],{decisions:[decision,decision]},context).candidateWorkComplete,false);
 assert.equal(buildWorkProgress([task],{decisions:[{...decision,candidateId:"absent"}]},context).errors.length>0,true);
});
test("work completion requires release acceptance as well as candidate disposition",()=>{
 const {task,decision}=fixture();
 const releaseAcceptance={kind:"genshinR2ReleaseAcceptance",policyId:POLICY,targetGameVersion:"7.0",
  scopeDigest:scopeDigest([task]),reviewerId:"Sol",reviewedAt:"2026-08-28T01:00:00Z",
  milestones:REQUIRED_MILESTONES.map(id=>({id,status:"passed",artifactRefs:[ref]}))};
 const registry={decisions:[decision],releaseAcceptance};
 assert.equal(buildWorkProgress([task],registry,context).goalComplete,true);
 releaseAcceptance.milestones.pop();assert.equal(buildWorkProgress([task],registry,context).goalComplete,false);
});
test("historical verification is not current completion, and empty inventory is not complete",()=>{
 const {task}=fixture();task.task={kind:"versionReverification",status:"awaitingEvidence"};
 const p=buildWorkProgress([task],{},context);
 assert.equal(p.records[0].evidence.status,"historicalVerifiedPendingRevalidation");assert.equal(p.summary.disposed,0);
 assert.equal(buildWorkProgress([],{},context).goalComplete,false);
});

test("completed current verified Spec is distinct from merely eligible or historical evidence",()=>{
 const {task}=fixture();task.terminalState="verifiedSpec";task.task={kind:"none",status:"complete"};
 const current=buildWorkProgress([task],{},context);
 assert.equal(current.records[0].evidence.status,"strictVerified");
 assert.equal(current.goalComplete,false);
 task.task={kind:"versionReverification",status:"awaitingEvidence"};
 assert.equal(buildWorkProgress([task],{},context).records[0].evidence.status,"historicalVerifiedPendingRevalidation");
});
test("duplicate candidates, escaping paths and malformed findings fail closed",()=>{
 const {task,decision}=fixture();
 assert.equal(buildWorkProgress([task,task],{},context).errors.includes("duplicateCandidateIds"),true);
 decision.search.artifactRefs=[{...ref,path:"../outside"}];
 assert.equal(validateDeferral(decision,task,context).valid,false);
 decision.fieldFindings={bad:true};assert.equal(validateDeferral(decision,task,context).valid,false);
 });
test("malformed release milestones fail closed without throwing",()=>{
 const {task}=fixture();
 const release={kind:"genshinR2ReleaseAcceptance",policyId:POLICY,targetGameVersion:"7.0",
  scopeDigest:scopeDigest([task]),reviewerId:"Sol",reviewedAt:"2026-08-28T01:00:00Z",milestones:{}};
 const result=buildWorkProgress([task],{releaseAcceptance:release},context);
 assert.equal(result.goalComplete,false);assert.equal(result.releaseAcceptance.valid,false);
 assert.ok(result.releaseAcceptance.errors.includes("milestonesMalformed"));
});
