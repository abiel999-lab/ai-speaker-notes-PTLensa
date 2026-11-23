import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import JSZip from 'jszip';
import { createJournalDeck } from '../../server-dist/server/journal-service.js';
import { designDeckArt } from '../../server-dist/server/deck-art-direction.js';

const source=await fs.readFile('/qa/vector-math.pdf');
const image=(await sharp({create:{width:128,height:72,channels:3,background:'#556197'}}).jpeg().toBuffer()).toString('base64');
let designCalls=0,imageCalls=0;
const artDirection=(doc,scene,directory)=>designDeckArt(doc,scene,{
  jobId:'journal-art-fixture',directory,assetDirectory:path.join(directory,'art'),
  key:'fixture-only',model:'gpt-6-luna',effort:'xhigh',
  fetchDesign:async(_url,init)=>{
    designCalls++;
    const payload=JSON.parse(init.body);
    assert.equal(payload.reasoning.effort,'xhigh');
    assert.ok(JSON.parse(payload.input).titles.length);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({
      palette:'ink',motif:'grid',coverImagePrompt:'Widescreen editorial illustration for the research journal',
    })}]}]});
  },
  fetchImage:async()=>{
    imageCalls++;
    return Response.json({data:[{b64_json:image}]});
  },
});
const opts={standardHeadings:true,includeSpeakerNotes:true,motion:'keynote'};
const inspection=await createJournalDeck(source,'vector-math.pdf',{...opts,inspectOnly:true,artDirection});
assert.ok(inspection.manifest.pages);
assert.equal(designCalls,0);
for(const journalRole of ['full-copy','reference']){
  const result=await createJournalDeck(source,'vector-math.pdf',{...opts,journalRole,artDirection});
  assert.deepEqual(result.manifest.deckArt,{direction:'ai',palette:'ink',generatedCover:true});
  assert.equal(result.manifest.appendix.length,inspection.manifest.pages);
  assert.ok(result.manifest.verification);
  const pptx=await JSZip.loadAsync(result.bytes);
  const cover=await pptx.file('ppt/slides/slide1.xml').async('string');
  assert.match(cover,/252B54/i);
  assert.match(cover,/<p:pic>/);
  assert.match(cover,/<p:transition\b/);
  for(const page of result.manifest.appendix){
    const slide=await pptx.file('ppt/slides/slide'+page.slide+'.xml').async('string');
    assert.doesNotMatch(slide,/AI-generated decorative cover artwork/);
  }
}
const preserved=await createJournalDeck(source,'vector-math.pdf',{...opts,sourcePagesOnly:true,artDirection});
assert.equal(preserved.manifest.pages,inspection.manifest.pages);
assert.equal(designCalls,2);
assert.equal(imageCalls,2);
console.log(JSON.stringify({fullCopyTheme:true,referenceTheme:true,originalPagesVerified:true,coverArt:true,nativeMotion:true,inspectWithoutProvider:true,sourcePagesWithoutProvider:true,paidCalls:0}));
