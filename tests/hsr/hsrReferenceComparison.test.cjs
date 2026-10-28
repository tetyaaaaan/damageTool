"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {runtime,loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs');
const {validateModifiers}=require('../../scripts/validateHsrModifiers.cjs');
test('HP reference comparison is automatic at below/equal/above and rejects missing or invalid ratios locally',async()=>{
 const{data}=await loadProductionFixture();const rec=data.structuredModifiers.find(m=>m.id==='lightCone:21012:equal-or-higher-hp-damage');assert.ok(rec);
 for(const[self,enemy,expected]of [[70,69.99,false],[70,70,true],[70,70.01,true],[0,0,true],[100,100,true],[NaN,70,false],[70,NaN,false],[undefined,70,false],[70,undefined,false],[-1,50,false],[70,101,false]]){
  const c=runtime.buildCandidates([rec],{characterId:'1001',lightConeId:'21012',stats:{hpPercent:self},enemy:{hpPercent:enemy}},{}).at(0);assert.equal(c.enabled,expected,JSON.stringify([self,enemy]));assert.equal(c.automatic,true);
 }
});
test('HP comparison contract rejects other modes and undeclared right-hand references',async()=>{
 const{data}=await loadProductionFixture();const rec=JSON.parse(JSON.stringify(data.structuredModifiers.find(m=>m.id==='lightCone:21012:equal-or-higher-hp-damage')));
 assert.deepEqual(validateModifiers([rec]),[]);
 assert.ok(validateModifiers([{...rec,activation:{...rec.activation,thresholdReference:'self.speed'}}]).some(x=>x.includes('thresholdReference')));
 assert.ok(validateModifiers([{...rec,activation:{...rec.activation,mode:'toggle'}}]).some(x=>x.includes('requires statThreshold')));
});
