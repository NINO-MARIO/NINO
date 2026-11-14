import os,json,re,hashlib
ex=('.js','.css','.html','.json','.md')
hj=sorted(os.path.join(d,f).replace('./','') for d,ds,fs in os.walk('.') for f in fs if f.endswith(ex) and not re.match(r'^\./(skills|icons|ai|tools|android|\.github)',os.path.join(d,f)) and f not in('home.json','data-trash.json','make-manifests.py','offline-files.json'))
json.dump(hj,open('home.json','w',encoding='utf8'))
sk=sorted(os.path.join(d,f) for d,_,fs in os.walk('skills') for f in fs if f!='manifest.json')
json.dump(sk,open('skills/manifest.json','w',encoding='utf8'),ensure_ascii=False)
ver=re.search(r"NINO_VERSION\s*=\s*'([^']+)'",open('version.js',encoding='utf8').read()).group(1)
fl=[{'path':p,'bytes':os.path.getsize(p),'sha':hashlib.sha256(open(p,'rb').read()).hexdigest()[:16]} for p in hj]
json.dump({'name':'NINO','version':ver,'readOnly':True,'note':'อ่านอย่างเดียว ไม่มีคีย์/โทเคนในไฟล์เหล่านี้ · sha = sha256 16 ตัวแรก · สร้างโดย tools-make-manifests.py','files':fl},open('ai/manifest.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
print(ver,len(hj),'files')
# every file of the outlaw game, so the service worker can precache the whole game for offline play (offline-files.json itself excluded)
gl=sorted(os.path.join(d,f).replace('./','') for d,ds,fs in os.walk('games/outlaw') for f in fs if f!='offline-files.json')
json.dump(gl,open('games/outlaw/offline-files.json','w',encoding='utf8'),ensure_ascii=False,indent=0)
print(len(gl),'game files')
