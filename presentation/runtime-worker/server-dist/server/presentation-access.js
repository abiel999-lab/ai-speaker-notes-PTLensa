import{accountFor}from'./platform-generation.js';
export function registerPresentationAccess(app,cfg,getAccount=accountFor){
 app.addHook('preHandler',async(req,reply)=>{
  if(!cfg.oidc||!req.user)return;
  const path=req.url.split('?')[0],workspace=path==='/app'||path.startsWith('/app/');
  const protectedAPI=path.startsWith('/api/')&&!['/api/health','/api/session','/api/platform/account'].includes(path)&&!path.startsWith('/api/auth/')&&!path.startsWith('/api/internal/admin/');
  if(!workspace&&!protectedAPI)return;
  let value;try{value=await getAccount(req.user,cfg);}catch(e){
   if(workspace&&e.message==='SIGN_IN_REFRESH_REQUIRED')return reply.header('Cache-Control','no-store').redirect('/api/auth/login');
   if(workspace&&e.message==='NOTEPRESO_ACCOUNT_REQUIRED')return reply.header('Cache-Control','no-store').redirect('https://notepreso.com/app');
   throw e;
  }
  if(value?.account?.plan==='pro')return;
  reply.header('Cache-Control','no-store');
  if(workspace)return reply.redirect('https://notepreso.com/pricing?reason=presentation-pro');
  return reply.code(403).send({error:'PRESENTATION_REQUIRES_PRO',pricingUrl:'https://notepreso.com/pricing'});
 });
}
