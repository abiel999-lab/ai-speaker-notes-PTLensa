"""Isolated, opt-in legacy conversion. Native PPTX translation never uses this."""
from pathlib import Path
import os,shutil,subprocess,tempfile
from translator import TranslationError,MAX_UPLOAD

def normalize_legacy(source,output):
 source=Path(source);output=Path(output)
 if source.stat().st_size>MAX_UPLOAD or source.read_bytes()[:8]!=bytes.fromhex('D0CF11E0A1B11AE1'):raise TranslationError('Not a supported binary PowerPoint file')
 executable=shutil.which('libreoffice') or shutil.which('soffice')
 if not executable:raise TranslationError('Legacy PPT conversion is unavailable here. Save as PPTX in PowerPoint first.')
 # Same per-job disposable profile pattern as the existing NotePreso normalizer.
 with tempfile.TemporaryDirectory(prefix='np-translation-convert-') as tmp:
  root=Path(tmp);(root/'out').mkdir();shutil.copyfile(source,root/'source.ppt')
  env={'PATH':os.environ.get('PATH',''),'HOME':tmp,'TMPDIR':tmp,'LANG':'C.UTF-8','SAL_USE_VCLPLUGIN':'svp'}
  p=subprocess.run([executable,'--headless','--nologo','--nodefault','--nolockcheck','--norestore','--nofirststartwizard','-env:UserInstallation='+ (root/'profile').as_uri(),'--convert-to','pptx:Impress MS PowerPoint 2007 XML','--outdir',str(root/'out'),str(root/'source.ppt')],env=env,capture_output=True,timeout=120)
  result=root/'out/source.pptx'
  if p.returncode or not result.is_file():raise TranslationError('Legacy PPT conversion failed; original file retained')
  shutil.copyfile(result,output)
 return 'Converted from binary PPT. Animation, transition and object fidelity require native PowerPoint review.'
