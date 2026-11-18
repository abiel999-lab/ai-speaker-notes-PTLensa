from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse,parse_qs
import json,base64,hmac,hashlib,time
import app.api.translation_routes as m
key='ab'*32;p=Path('/tmp/shared-identity-test.json');p.write_text(json.dumps({'secret':key}));m.SECRET_FILE=p
who=SimpleNamespace(owner_key='00000000-0000-4000-8000-000000000002',display_name='Notes Account B',username='b',email_verified=True,email='b@example.test');m.request_identity=lambda req:who
req=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(keycloak_issuer='https://login.notepreso.com/realms/aispeaker'))))
r=m.presentation_connect(req,'s'*43);u=urlparse(r.headers['location']);assert u.netloc=='presentation.notepreso.com' and not u.query
encoded,signature=parse_qs(u.fragment)['ticket'][0].split('.');assert hmac.compare_digest(signature,hmac.new(bytes.fromhex(key),('presentation-login-v1.'+encoded).encode(),hashlib.sha256).hexdigest());v=json.loads(base64.urlsafe_b64decode(encoded+'='*(-len(encoded)%4)));assert v['sub']==who.owner_key and v['aud']=='https://presentation.notepreso.com' and v['name']=='Notes Account B' and time.time()<v['exp']<=time.time()+61
m.request_identity=lambda req:None;assert m.presentation_connect(req,'s'*43).headers['location'].startswith('/auth/login?return_to=')
try:m.presentation_connect(req,'bad');raise AssertionError()
except m.HTTPException as e:assert e.status_code==400
print('PASS Notes authority signs current subject/profile, fragment-only ticket, expiry and login-required/state rejection')
