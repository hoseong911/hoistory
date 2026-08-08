const p=require('puppeteer-core');(async()=>{
const b=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox']});
const pg=await b.newPage();
const msgs=[]; const failed=[];
pg.on('console',m=>msgs.push(m.type()+': '+m.text()));
pg.on('requestfailed',r=>failed.push(r.url().split('/').pop()+' ('+(r.failure()?.errorText||'')+')'));
await pg.goto('file:///C:/Users/ho091/hoistory/lms/admin.html',{waitUntil:'networkidle0'}).catch(()=>{});
await new Promise(r=>setTimeout(r,600));
// admin.js 로드 여부: DOM에 script src 존재 + 파일 접근
const jsTag=await pg.evaluate(()=>!!document.querySelector('script[src*="admin.js"]'));
console.log('admin.js script tag present:', jsTag);
console.log('failed requests:', failed.filter(f=>/admin\.js|admin\.css/.test(f)));  // 로컬 파일 404면 문제
console.log('all failed (앞 8):', failed.slice(0,8));
console.log('console msgs (앞 8):'); msgs.slice(0,8).forEach(m=>console.log('  '+m));
await b.close();})();
