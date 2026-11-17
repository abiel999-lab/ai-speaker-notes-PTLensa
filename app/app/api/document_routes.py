from fastapi import APIRouter,Request,UploadFile,File,HTTPException
from app.api.routes import _require_api_access,_reject_cross_site_browser_request
from app.services.document_extract import extract_document,DocumentError,MAX_BYTES
router=APIRouter(prefix='/api/v1/documents')
@router.post('/extract')
async def extract(request:Request,file:UploadFile=File(...)):
 _reject_cross_site_browser_request(request);_require_api_access(request,mutate=True)
 try:
  raw=await file.read(MAX_BYTES+1)
  return extract_document(file.filename or '',raw)
 except DocumentError as e:raise HTTPException(422,str(e))from None
 finally:await file.close()
