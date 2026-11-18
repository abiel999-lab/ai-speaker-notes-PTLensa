import runpy
p=runpy.run_path('/app/app/core/support_widget.py');extend=p['extend_csp'];eligible=p['eligible']
empty=extend('');assert "script-src 'self' https://live.cekat.ai" in empty
existing="default-src 'self'; script-src 'self' 'nonce-fixture' https://cdn.paddle.com; connect-src 'self' https://api.paddle.com"
after=extend(existing)
for token in ["'nonce-fixture'",'https://cdn.paddle.com','connect-src \'self\' https://api.paddle.com']:assert token in after
assert "script-src 'self' https://live.cekat.ai" in extend("default-src 'self'")
for path in ['/login','/auth/callback','/api/v1/jobs','/admin']:assert not eligible('notepreso.com',path,'text/html')
assert eligible('notepreso.com','/support','text/html')
print('PASS CSP empty baseline keeps self scripts; default inheritance; existing nonce/Paddle preserved; auth/admin/API excluded')
exec(compile(open('/tmp/feedback-qa.py').read(),'/tmp/feedback-qa.py','exec'))
