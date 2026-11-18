import os
os.environ['SUPPORT_MAIL_TRANSPORT']='ssh'
from fastapi.testclient import TestClient
from app.contact_sidecar import app
class Mail:
 def __init__(self):self.sent=[];self.fail=False
 def send(self,payload):
  if self.fail:raise RuntimeError('fixture outage')
  self.sent.append(payload)
mail=Mail()
with TestClient(app,base_url='https://notepreso.com') as c:
 app.state.support_mailer=mail
 r=c.get('/support');assert r.status_code==200 and 'value="feedback"' in r.text
 data={'request_type':'feedback','name':'QA Fixture','email':'qa@example.test','message':'Translator feature feedback fixture only, no delivery.','transaction_id':'','website':''}
 r=c.post('/support',data=data,headers={'Origin':'https://notepreso.com'});assert r.status_code==200 and 'SUP-' in r.text;assert len(mail.sent)==1 and mail.sent[0].request_label=='Feedback / feature request'
 r=c.post('/support',data=data,headers={'Origin':'https://evil.example'});assert r.status_code==403 and len(mail.sent)==1
 bad=dict(data,request_type='unrecognized');r=c.post('/support',data=bad,headers={'Origin':'https://notepreso.com'});assert r.status_code==400 and len(mail.sent)==1
 mail.fail=True;r=c.post('/support',data=data,headers={'Origin':'https://notepreso.com'});assert r.status_code==502 and 'could not send' in r.text
print('PASS feedback category, reference, origin rejection, invalid category, SMTP outage; actual emails=0')
