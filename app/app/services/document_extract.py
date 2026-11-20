"""Bounded local text extraction. Uploaded content remains data, never instructions."""
import io,zipfile,xml.etree.ElementTree as ET,hashlib,re
from pathlib import PurePath
MAX_BYTES=10*1024*1024
from app.domain.models import MAX_REFERENCE_TEXT
MAX_TEXT=MAX_REFERENCE_TEXT
class DocumentError(ValueError):pass
def extract_document(filename:str,data:bytes,*,compact_pdf_spacing:bool=False):
 suffix=PurePath(filename).suffix.lower()
 if not data or len(data)>MAX_BYTES:raise DocumentError('DOCUMENT_SIZE_LIMIT')
 if suffix not in {'.pdf','.docx','.txt','.md'}:raise DocumentError('DOCUMENT_TYPE')
 pages=[]
 if suffix in {'.txt','.md'}:
  try:value=data.decode('utf-8-sig')
  except UnicodeError:raise DocumentError('DOCUMENT_ENCODING')from None
  if '\x00'in value:raise DocumentError('DOCUMENT_ENCODING')
  pages=[value]
 elif suffix=='.pdf':
  if not data.startswith(b'%PDF-'):raise DocumentError('INVALID_PDF')
  import fitz
  try:
   with fitz.open(stream=data,filetype='pdf')as doc:
    if doc.needs_pass:raise DocumentError('PDF_PASSWORD_REQUIRED')
    if len(doc)>80:raise DocumentError('DOCUMENT_PAGE_LIMIT')
    for page in doc:
     value=page.get_text('text',sort=True)
     if compact_pdf_spacing:
      # Sorted PDF extraction pads columns with spaces. Reference text does not need visual padding.
      value=re.sub(r' {2,}', ' ', value)
      value=re.sub(r' +(?=\n|$)', '', value)
     if sum(map(len,pages))+len(value)>MAX_TEXT:raise DocumentError('DOCUMENT_TEXT_LIMIT')
     pages.append(value)
  except DocumentError:raise
  except Exception:raise DocumentError('INVALID_PDF')from None
 else:
  try:
   with zipfile.ZipFile(io.BytesIO(data))as z:
    entries=z.infolist()
    if len(entries)>1500 or sum(e.file_size for e in entries)>40*1024*1024:raise DocumentError('DOCUMENT_ARCHIVE_LIMIT')
    if any(e.flag_bits&1 or e.filename.startswith(('/','\\'))or'..'in e.filename.replace('\\','/').split('/')for e in entries):raise DocumentError('INVALID_DOCX')
    if any(n.endswith('vbaProject.bin')for n in z.namelist()):raise DocumentError('DOCUMENT_MACROS_NOT_ALLOWED')
    part=z.getinfo('word/document.xml')
    if part.file_size>4*1024*1024:raise DocumentError('DOCUMENT_ARCHIVE_LIMIT')
    xml=z.read(part)
    if b'<!DOCTYPE'in xml.upper()or b'<!ENTITY'in xml.upper():raise DocumentError('INVALID_DOCX')
    root=ET.fromstring(xml);ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    body=root.find('w:body',ns)
    if body is None:raise DocumentError('INVALID_DOCX')
    text=[]
    def para(p):return ''.join((n.text or '')if n.tag.endswith('}t')else '\t'if n.tag.endswith('}tab')else '\n'if n.tag.endswith(('}br','}cr'))else''for n in p.iter())
    for el in body:
     if el.tag.endswith('}p'):text.append(para(el))
     elif el.tag.endswith('}tbl'):
      for row in el.findall('w:tr',ns):text.append('\t'.join('\n'.join(para(p)for p in cell.findall('w:p',ns))for cell in row.findall('w:tc',ns)))
    pages=['\n\n'.join(text)]
  except DocumentError:raise
  except (zipfile.BadZipFile,KeyError,ET.ParseError,RuntimeError):raise DocumentError('INVALID_DOCX')from None
 text='\n\n'.join(pages).replace('\r\n','\n').replace('\r','\n')
 if len(text)>MAX_TEXT:raise DocumentError('DOCUMENT_TEXT_LIMIT')
 if not text.strip():raise DocumentError('DOCUMENT_HAS_NO_SELECTABLE_TEXT')
 # No silent truncation or paraphrasing. Owner reviews before generation.
 return {'text':text,'pages':len(pages),'characters':len(text),'sha256':hashlib.sha256(data).hexdigest(),'format':suffix[1:],'reviewRequired':True,'notice':'Review extracted text and table order before generating. Scanned images require OCR before upload'}
