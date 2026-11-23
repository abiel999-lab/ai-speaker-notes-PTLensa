import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import JSZip from 'jszip';
import { buildFullCopyScene, parseFullCopySource } from '../../server-dist/core/full-copy.js';
import { exportPptx } from '../../server-dist/core/export.js';
import { designDeckArt } from '../../server-dist/server/deck-art-direction.js';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'deck-art-'));
try {
  const doc=parseFullCopySource('# Monitoring river quality\n\n## Sampling results\n\nFirst sample: 14 liters per second.');
  const scene=buildFullCopyScene(doc,[]);
  const base64=(await sharp({create:{width:128,height:72,channels:3,background:'#249292'}}).jpeg().toBuffer()).toString('base64');
  let designCalls=0,imageCalls=0;
  const settings={
    jobId:'sample-job',directory:root,assetDirectory:path.join(root,'assets'),key:'fixture-only',
    model:'gpt-6.1-terra',effort:'xhigh',
    fetchDesign:async(url,request)=>{
      designCalls++;
      assert.match(url,/\/responses$/);
      const input=JSON.parse(request.body);
      assert.equal(input.reasoning.effort,'xhigh');
      assert.ok(JSON.parse(input.input).titles.includes('Monitoring river quality'));
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({
        palette:'forest',motif:'grid',coverImagePrompt:'Wide editorial illustration of a river monitoring landscape',
      })}]}]});
    },
    fetchImage:async(url,request)=>{
      imageCalls++;
      assert.match(url,/\/images\/generations$/);
      assert.equal(JSON.parse(request.body).model,'gpt-image-2.5-sunburst');
      return Response.json({data:[{b64_json:base64}]});
    },
  };
  const { scene:result, summary }=await designDeckArt(doc,scene,settings);
  assert.deepEqual(summary,{direction:'ai',palette:'forest',generatedCover:true});
  assert.notEqual(scene.slides[1].background,result.slides[1].background);
  const artwork=result.slides[0].objects.find(object=>object.backgroundImage);
  assert.ok(artwork);
  const {bytes,report}=await exportPptx(doc,result,{[artwork.asset]:path.join(settings.assetDirectory,artwork.asset+'.jpg')},'keynote');
  assert.ok(report.passed && report.exportVerified);
  const pptx=await JSZip.loadAsync(bytes);
  assert.match(await pptx.file('ppt/slides/slide1.xml').async('string'),/<p:transition\b/);
  assert.ok(pptx.file(/^ppt\/media\//).length);
  await designDeckArt(doc,scene,settings);
  assert.equal(designCalls,1);
  assert.equal(imageCalls,1);
  const fallback=await designDeckArt(doc,scene,{...settings,jobId:'fallback',directory:path.join(root,'fallback'),key:undefined});
  assert.equal(fallback.summary.direction,'fallback');
  assert.equal(fallback.summary.generatedCover,false);
  console.log('Art direction, generated cover, native transition, fidelity and retry reuse verified');
} finally {
  await fs.rm(root,{recursive:true,force:true});
}
