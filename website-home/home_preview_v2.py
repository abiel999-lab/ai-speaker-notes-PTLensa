
from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path
from urllib.parse import urlsplit,unquote
from jinja2 import Environment,FileSystemLoader,StrictUndefined
from app.domain.models import Language
import mimetypes

e=Environment(
    loader=FileSystemLoader('/app/app/templates'),
    autoescape=True,
    undefined=StrictUndefined
)
e.globals['speaker_note_languages']=tuple(Language)
page=e.get_template('home.html').render(
    authenticated=False,
    free_preview_slides=5,
    free_weekly_presentations=5,
    openai_configured=True,
    version='UI preview'
).encode()

class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  p=unquote(urlsplit(self.path).path)
  if p=='/':
   data=page
   kind='text/html; charset=utf-8'
  elif p=='/api/health':
   data=b'{"ok":true,"preview":true}'
   kind='application/json'
  elif p=='/api/v1/auth/me':
   data=b'{"authenticated":false}'
   kind='application/json'
  elif p.startswith('/static/'):
   root=Path('/app/app/static').resolve()
   target=(root/p[8:]).resolve()
   if not target.is_relative_to(root) or not target.is_file():
    self.send_error(404)
    return
   data=target.read_bytes()
   kind=mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
  else:
   self.send_error(404)
   return
  self.send_response(200)
  self.send_header('Content-Type',kind)
  self.send_header('Cache-Control','no-store')
  self.send_header('Content-Length',str(len(data)))
  self.end_headers()
  self.wfile.write(data)

HTTPServer(('0.0.0.0',8000),Handler).serve_forever()
