import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as S from "../public/js/shared.js";
const dams=JSON.parse(readFileSync(new URL("../public/data/dams.json",import.meta.url)));
test("spherical consensus crosses the antimeridian",()=>{
  const c=S.consensus([{la:0,lo:179.99,trust:1},{la:0,lo:-179.99,trust:1},{la:0,lo:180,trust:1}]);
  assert.ok(Math.abs(c.lo)>179.9);assert.ok(c.spread<2);assert.equal(c.ready,true);
});
test("consensus weights trust and rejects dispersed or competing groups",()=>{
  const c=S.consensus([{la:0,lo:0,trust:1},{la:0,lo:0.01,trust:0.1}]);
  assert.ok(c.lo<0.003);assert.equal(c.ready,false);
  const split=S.consensus([{la:0,lo:0},{la:0,lo:0.01},{la:20,lo:20},{la:20,lo:20.01}]);
  assert.equal(split.conflicted,true);assert.equal(split.ready,false);
  assert.equal(S.consensus([]),null);
});
test("invalid coordinates and fractional hint counts are rejected",()=>{
  const guesses=S.pickMapRounds(dams,"unit").map(i=>[dams[i].la,dams[i].lo,0]);
  assert.equal(S.mapScore(dams,"unit",guesses).score,25000);
  for(const invalid of [[91,0,0],[0,181,0],[0,0,0.5],[0,0,4]]){
    const bad=structuredClone(guesses);bad[0]=invalid;assert.equal(S.mapScore(dams,"unit",bad),null);
  }
});
test("mission scoring never awards bonuses to unsaved suggestions",()=>{
  const missing=JSON.parse(readFileSync(new URL("../public/data/missing.json",import.meta.url)));
  const rounds=S.pickMissionRounds(dams,missing,"mission-unit");
  const guesses=rounds.map(r=>r.src==="k"?[dams[r.i].la,dams[r.i].lo]:[0,0]);
  assert.equal(S.missionScore(dams,missing,"mission-unit",guesses).score,10000);
});
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const P=await import("../public/js/profile.js");
test("profile event replay does not award XP twice",()=>{
  const before=P.get().xp;P.award({id:"unit-game",xp:25,game:1});P.award({id:"unit-game",xp:25,game:1});
  assert.equal(P.get().xp,before+25);
});
test("profile import validates format, ignores untrusted keys and preserves previous state on failure",()=>{
  const exported=P.exportProfile(),before=P.get().xp;
  assert.throws(()=>P.importProfile('{"format":"other"}'));assert.equal(P.get().xp,before);
  P.importProfile(exported);assert.equal(P.get().xp,before);
  assert.throws(()=>P.validateProfile({xp:-1}));
  const v=P.validateProfile({xp:5,c:{"__proto__":5,valid:3},badges:["bad"],learned:{bad:{n:"x",km:-2}}});
  assert.equal(v.c.valid,3);assert.deepEqual(v.badges,[]);assert.deepEqual(v.learned,{});
});
test("accepted contributions grant a single reward",()=>{
  const before=P.get().xp;P.acceptContribution("unit-dam");P.acceptContribution("unit-dam");assert.equal(P.get().xp,before+25);
});
