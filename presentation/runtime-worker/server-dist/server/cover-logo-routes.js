import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID,createHash}from'node:crypto';import sharp from 'sharp';import{z}from'zod';
import {cleanAuthor,MAX_COVER_LOGOS} from '../core/cover-branding.js';
const uuid=v=>z.string().uuid().safeParse(v).success;
export async function snapshotCoverBranding(repo,cfg,project,settings){
    if(settings.creationMode!=='creative')return undefined;
    const account=await repo.userById(project.ownerId);const author=cleanAuthor(account?.displayName);
    const ids=settings.coverLogos||[];if(ids.length>MAX_COVER_LOGOS||new Set(ids).size!==ids.length||ids.some(id=>!uuid(id)))throw Error('COVER_LOGO_LIMIT');
    const logos=[];
    for(const id of ids){const bytes=await fs.readFile(path.join(cfg.root,'assets',project.id,id+'.png'));
        const img=sharp(bytes,{limitInputPixels:16000000});const meta=await img.metadata();
        if(meta.format!=='png'||!meta.width||!meta.height)throw Error('COVER_LOGO_INVALID');
        const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let total=0,alpha=0;
        for(let i=0;i<data.length;i+=info.channels){const a=data[i+3]/255;if(a<.05)continue;total+=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)*a;alpha+=a;}
        logos.push({id,width:meta.width,height:meta.height,sha256:createHash('sha256').update(bytes).digest('hex'),backing:alpha&&total/alpha>190?'#182B43':'#FFFFFF'});
    }
    return {author,logos};
}
export function registerCoverLogoRoutes(app,repo,cfg,auth){
    app.post('/api/projects/:id/cover-logo',{preHandler:auth,config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
        const project=await repo.getProject(req.params.id,req.user.id);if(!project)return reply.code(404).send({error:'PROJECT_NOT_FOUND'});
        const body=z.object({base64:z.string().min(1).max(2800000)}).strict().parse(req.body);const bytes=Buffer.from(body.base64,'base64');
        const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
        if((!png&&!jpg)||bytes.length>2097152)return reply.code(400).send({error:'COVER_LOGO_TYPE'});
        let image,meta;
        try{image=sharp(bytes,{limitInputPixels:16000000});meta=await image.metadata();if(!meta.width||!meta.height||meta.pages>1)throw Error('type');}
        catch{return reply.code(400).send({error:'COVER_LOGO_TYPE'});}
        const dir=path.join(cfg.root,'assets',project.id);await fs.mkdir(dir,{recursive:true});
        let output;try{
            const {data,info}=await image.rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
            let left=info.width,top=info.height,right=-1,bottom=-1;
            for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*info.channels+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
            if(right<left||bottom<top)throw Error('Empty logo');
            // Remove transparent outer padding only; preserve every visible pixel and internal transparency.
            output=await sharp(data,{raw:info}).extract({left,top,width:right-left+1,height:bottom-top+1}).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();
        }
        catch{return reply.code(400).send({error:'COVER_LOGO_TYPE'});}
        const assetId=randomUUID();await fs.writeFile(path.join(dir,assetId+'.png'),output,{flag:'wx',mode:0o600});
        return {assetId};
    });
    app.get('/api/projects/:id/cover-logos',{preHandler:auth},async(req,reply)=>{
        const p=await repo.getProject(req.params.id,req.user.id);if(!p)return reply.code(404).send({error:'PROJECT_NOT_FOUND'});
        let files=[];try{files=await fs.readdir(path.join(cfg.root,'assets',p.id));}catch(e){if(e.code!=='ENOENT')throw e;}
        return {logos:files.filter(f=>f.endsWith('.png')&&uuid(f.slice(0,-4))).sort().slice(0,100).map(f=>({id:f.slice(0,-4)}))};
    });
    app.get('/api/projects/:id/cover-logo/:assetId',{preHandler:auth},async(req,reply)=>{
        const p=await repo.getProject(req.params.id,req.user.id);if(!p||!uuid(req.params.assetId))return reply.code(404).send({error:'COVER_LOGO_NOT_FOUND'});
        try{const bytes=await fs.readFile(path.join(cfg.root,'assets',p.id,req.params.assetId+'.png'));return reply.header('Cache-Control','private, no-store').type('image/png').send(bytes);}
        catch(e){if(e.code!=='ENOENT')throw e;return reply.code(404).send({error:'COVER_LOGO_NOT_FOUND'});}
    });
}
