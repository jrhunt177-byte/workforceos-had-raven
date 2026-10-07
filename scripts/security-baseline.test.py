import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('baseline',Path(__file__).with_name('security-baseline.py'))
baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)
class BaselineTests(unittest.TestCase):
 def test_real_env_file(self):self.assertEqual(baseline.inspect('app/.env.production',b'X=1')[0]['rule'],'credential-file')
 def test_template_name_allowed(self):self.assertEqual(baseline.inspect('.env.example',b'KEY=replace-me'),[])
 def test_templates_still_scanned(self):self.assertTrue(baseline.inspect('.env.example',b'TOKEN='+b'gh' + b'p_' + b'A'*36))
 def test_private_key(self):self.assertTrue(baseline.inspect('private.txt',b'-----BEGIN '+b'PRIVATE KEY-----'))
 def test_no_raw_secret_output(self):
  secret=b'gh'+b'p_'+b'A'*36
  result=baseline.inspect('x.txt',b'\n'+secret)
  self.assertEqual(result[0]['line'],2);self.assertNotIn(secret.decode(),str(result))
 def test_normal_source(self):self.assertEqual(baseline.inspect('app.js',b'const key = process.env.API_KEY;'),[])
if __name__=='__main__':unittest.main()
