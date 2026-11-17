import os,tempfile,unittest,json
from pathlib import Path
from unittest.mock import patch
os.environ['TRANSLATION_STORAGE']=tempfile.mkdtemp()
import production_app as m
from fastapi.testclient import TestClient

class AccessTests(unittest.TestCase):
 def setUp(self):
  self.client=TestClient(m.app,base_url=m.ORIGIN)
  self.owner='00000000-0000-0000-0000-000000000001'
  self.plan='pro'
  self.billing=patch.object(m,'billing',side_effect=lambda *a,**kw:{'account':{'plan':self.plan}}).start()
 def tearDown(self):patch.stopall()
 def login(self,owner=None):
  token,who=m.SESSIONS.issue(owner or self.owner,subject=owner or self.owner,terms_version='translation-v1')
  self.client.cookies.set(m.COOKIE,token);return who
 def test_guest_cannot_upload_read_or_download(self):
  r=self.client.get('/',follow_redirects=False);self.assertEqual(r.status_code,303);self.assertTrue(r.headers['location'].startswith('https://notepreso.com/auth/translation/connect'))
  for method,url in [('get','/api/jobs'),('get','/api/jobs/'+self.owner+'/result'),('post','/api/jobs')]:self.assertEqual(getattr(self.client,method)(url).status_code,401)
 def test_free_has_no_workspace_upload_or_download(self):
  self.plan='free';who=self.login()
  r=self.client.get('/',follow_redirects=False);self.assertEqual(r.status_code,303);self.assertEqual(r.headers['location'],'https://notepreso.com/pricing')
  self.assertEqual(self.client.get('/api/jobs').status_code,403)
  self.assertEqual(self.client.post('/api/jobs',content=b'bad',headers={'Origin':m.ORIGIN,'X-CSRF-Token':who.csrf}).status_code,403)
  self.assertEqual(self.client.get('/api/jobs/'+self.owner+'/result').status_code,403)
 def test_pro_workspace_and_history(self):
  self.login();self.assertIn('id="form"',self.client.get('/').text)
  self.assertEqual(self.client.get('/api/jobs').json(),{'jobs':[]})
 def test_pro_revocation_is_immediate(self):
  self.login();self.assertEqual(self.client.get('/api/jobs').status_code,200)
  self.plan='free';self.assertEqual(self.client.get('/api/jobs').status_code,403)
 def test_billing_outage_fails_closed(self):
  self.login();self.billing.side_effect=m.BillingUnavailable()
  self.assertEqual(self.client.get('/api/jobs').status_code,503)
  self.assertEqual(self.client.get('/').status_code,503)
 def test_csrf_and_ownership(self):
  self.login();self.assertEqual(self.client.post('/api/jobs',headers={'Origin':m.ORIGIN}).status_code,403)
  self.assertEqual(self.client.get('/api/jobs/'+self.owner).status_code,404)
 def test_language_catalog_and_guide(self):
  self.assertEqual(self.client.get('/how-to').status_code,200)
  self.login()
  langs=self.client.get('/api/languages').json()['languages']
  self.assertGreaterEqual(len(langs)-1,60);self.assertEqual(len(langs),len(set(langs)))
  self.assertIn('Chinese (Traditional)',langs)
  self.assertEqual(self.client.get('/how-to').status_code,200)
 def test_language_validation(self):
  who=self.login()
  r=self.client.post('/api/jobs',params={'filename':'test.pptx','job_id':self.owner,'target':'invalid'},headers={'Origin':m.ORIGIN,'X-CSRF-Token':who.csrf})
  self.assertEqual(r.status_code,400)

if __name__=='__main__':unittest.main()
