import assert from "node:assert/strict";
import {createRequire} from "node:module";
import path from "node:path";
const require=createRequire(path.join(process.env.GEODAM_TEST_RUNTIME||process.cwd(),"package.json"));
const {chromium}=require("playwright");
const browser=await chromium.launch({headless:true,...(process.env.GEODAM_BROWSER_CHANNEL?{channel:process.env.GEODAM_BROWSER_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:1365,height:900},locale:"fr-FR"});
 await page.goto((process.argv[2]||"http://127.0.0.1:8792")+"/?demo=1");
 const diagram=page.locator(".dam-diagram");
 await diagram.waitFor();
 assert.equal(await diagram.locator(".fall").count(),0);
 assert.equal(await diagram.getAttribute("role"),"img");
 assert.match(await diagram.locator("desc").textContent(),/irrigation/);
 assert.doesNotMatch(await diagram.textContent(),/turbine|alternateur|hydroélectrique/i);
 assert.ok(await diagram.locator(".dam-flow").count()>=2);
 await page.screenshot({path:".test-output/hydro-home.png",fullPage:true});
 await diagram.screenshot({path:".test-output/hydro-desktop.png"});
 await page.emulateMedia({reducedMotion:"reduce"});
 assert.equal(await diagram.locator(".dam-flow").first().evaluate(el=>getComputedStyle(el).animationName),"none");

 console.log("Dam illustration verified: reservoir, controlled release, irrigation/water supply, no generating equipment and reduced motion.");
}finally{await browser.close();}
