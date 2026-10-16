from playwright.sync_api import sync_playwright
from subprocess import Popen, PIPE
import os, time
ROOT=os.path.dirname(os.path.dirname(__file__))
proc=Popen(['node','tests/hostile-server.mjs'],cwd=ROOT,stdout=PIPE,stderr=PIPE,text=True)
try:
    assert proc.stdout.readline().strip()=='fixture ready'
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:4178/',wait_until='domcontentloaded')
        page.wait_for_selector('#flow .flow-card')
        text=page.locator('body').inner_text()
        for forbidden in ['SUPERSECRET','private.test','/Users/','cliente@','toolResult']:
            assert forbidden not in text, forbidden
        assert '[credencial omitida]' in text
        assert not errors, errors
        browser.close()
    print('DOM hostil: saneado, sem erro de console')
finally:
    proc.terminate()
    proc.wait(timeout=5)
