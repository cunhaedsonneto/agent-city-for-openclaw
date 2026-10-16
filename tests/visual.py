from playwright.sync_api import sync_playwright
import json, os
ROOT=os.path.dirname(os.path.dirname(__file__))
OUT=os.path.join(ROOT,'evidence')
os.makedirs(OUT,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    results=[]
    for mode,url in [('live','http://127.0.0.1:4176/'),('demo','http://127.0.0.1:4177/agent-city-for-openclaw/')]:
      for device,width,height in [('desktop',1440,900),('mobile',390,844),('narrow',320,720)]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        errors=[]; requests=[]; api_calls=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda req:api_calls.append(req.url) if '/api/' in req.url else None)
        page.on('response',lambda r:requests.append((r.status,r.url)) if r.status>=400 else None)
        page.goto(url,wait_until='domcontentloaded',timeout=30000)
        page.wait_for_selector('#groups .agent', timeout=20000)
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT,f'{mode}-{device}.png'),full_page=True)
        info=page.evaluate('''() => {
          const model = document.querySelector('#groups .agent.working .model');
          const modelName = model?.querySelector('.model-name');
          const modelStatus = model?.querySelector('.model-status');
          const task = document.querySelector('#groups .agent.working .ds');
          return {width:document.documentElement.scrollWidth,innerWidth:window.innerWidth,
            cards:document.querySelectorAll('#groups .agent').length,
            flows:document.querySelectorAll('#flow .flow-card').length,
            briefLinks:document.querySelectorAll('#groups .brief-link').length,
            labelModels:document.querySelectorAll('#labels .tag .m').length,
            labelStatuses:document.querySelectorAll('#labels .tag .model-status').length,
            modelFontPx:modelName?parseFloat(getComputedStyle(modelName).fontSize):0,
            modelComplete:modelName?modelName.scrollWidth<=modelName.clientWidth+1:false,
            modelStatus:modelStatus?.textContent||null,
            modelFirstLine:model?model.getBoundingClientRect().top<=model.parentElement.querySelector('.nm').getBoundingClientRect().top+1:false,
            taskClamp:task?getComputedStyle(task).webkitLineClamp:null};
        }''')
        assert info['width'] <= width and info['innerWidth'] == width, info
        assert info['modelFontPx'] >= 13 and info['modelComplete'] and info['modelFirstLine'], info
        assert info['modelStatus'] in ('efetivo','previsto','configurado','indisponível'), info
        assert info['taskClamp'] == '2', info
        assert info['labelModels'] >= info['cards'] and info['labelStatuses'] >= info['cards'], info
        assert not errors and not requests, (errors,requests)
        if mode == 'demo':
          assert len(api_calls) == 0 and info['flows'] >= 2, info
        results.append({'mode':mode,'device':device,'layout':info,'errors':errors[:4],'httpErrors':[(s,u.split('/')[-1]) for s,u in requests[:4]],'apiRequests':len(api_calls)})
        page.close()
    browser.close()
with open(os.path.join(OUT,'visual-results.json'),'w',encoding='utf-8') as file:
    json.dump(results,file,ensure_ascii=False,indent=2)
print(json.dumps(results,ensure_ascii=False))
