"""Isolated localhost browser checks: lost ACK, foreground sync and reconnect."""
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
API_PORT, WEB_PORT = 3091, 8091
env = dict(os.environ, PORT=str(API_PORT), ROOM_STORE='memory', NODE_ENV='test',
           ALLOWED_ORIGINS=f'http://127.0.0.1:{WEB_PORT}')
processes = []

def start(command, cwd, environment=None):
    process = subprocess.Popen(command, cwd=cwd, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    processes.append(process)
    return process

try:
    start(['node', 'src/server.js'], ROOT / 'server-online', env)
    start(['python', '-m', 'http.server', str(WEB_PORT), '--bind', '127.0.0.1'], ROOT)
    for _ in range(100):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{API_PORT}/api/health', timeout=1).close()
            urllib.request.urlopen(f'http://127.0.0.1:{WEB_PORT}/online.html', timeout=1).close()
            break
        except Exception:
            time.sleep(.1)
    else:
        raise RuntimeError('Local test services did not start')

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel='msedge')
        context = browser.new_context()
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        proxy = {'drop_ack': True, 'lost_ack': False, 'server': None, 'route': None, 'connections': 0, 'blackhole': None}

        def websocket_route(route):
            upstream = route.connect_to_server()
            proxy['server'] = upstream
            proxy['route'] = route
            proxy['connections'] += 1
            connection = proxy['connections']
            def from_server(payload):
                if proxy['blackhole'] == connection:
                    return
                message = json.loads(payload)
                if message.get('type') == 'ack' and message.get('seq') and proxy['drop_ack']:
                    proxy['drop_ack'] = False
                    proxy['lost_ack'] = True
                    return
                route.send(payload)
            upstream.on_message(from_server)

        page.route_web_socket(f'ws://127.0.0.1:{API_PORT}/**', websocket_route)
        page.goto(f'http://127.0.0.1:{WEB_PORT}/online.html')
        page.locator('.advanced-settings summary').click()
        page.locator('#apiBase').fill(f'http://127.0.0.1:{API_PORT}')
        page.locator('#playerName').fill('稳定性验收')
        page.locator('#createBtn').click()
        page.locator('#lobbySection').wait_for(state='visible')
        for count in range(7):
            page.locator('#addBotBtn').click()
            page.wait_for_function('(count)=>document.querySelectorAll(".bot-badge").length===count', arg=count+1)
        page.locator('#lobbyReadyBtn').click()
        page.locator('#gameSection').wait_for(state='visible')
        page.locator('#shopList [data-buy]:not([disabled])').first.click()
        page.locator('#benchGrid .unit-slot:not(.empty)').first.wait_for()
        page.wait_for_function('!document.querySelector("#rerollBtn").disabled')
        assert proxy['lost_ack'], 'The test did not drop an action ACK'
        assert page.locator('#benchGrid .unit-slot:not(.empty)').count() == 1

        # A server-initiated restart closure must reconnect without losing the
        # seat or resetting the board. No session credentials are inspected.
        proxy['route'].close(code=1012, reason='test service restart')
        for _ in range(75):
            if proxy['connections'] >= 2:
                break
            page.wait_for_timeout(200)
        page.wait_for_function('!document.querySelector("#rerollBtn").disabled', timeout=15000)
        assert proxy['connections'] >= 2
        assert page.locator('#benchGrid .unit-slot:not(.empty)').count() == 1

        # Return-to-foreground triggers an authoritative sync before controls
        # are enabled, using the existing connection.
        page.evaluate('document.dispatchEvent(new Event("visibilitychange"))')
        page.wait_for_function('!document.querySelector("#rerollBtn").disabled')
        context.set_offline(True)
        page.wait_for_function('document.querySelector("#rerollBtn").disabled')
        context.set_offline(False)
        for _ in range(75):
            if proxy['connections'] >= 3:
                break
            page.wait_for_timeout(200)
        page.wait_for_function('!document.querySelector("#rerollBtn").disabled')
        assert proxy['connections'] >= 3

        # An apparently OPEN socket with no responses must be detected by the
        # application's own heartbeat, without relying on a close event.
        proxy['blackhole'] = proxy['connections']
        before = proxy['connections']
        for _ in range(200):
            if proxy['connections'] > before:
                break
            page.wait_for_timeout(200)
        assert proxy['connections'] > before, 'Heartbeat did not recover the blackholed connection'
        assert not errors, errors
        browser.close()
        print('PASS browser: lost ACK confirmed, 1012 reconnect preserves board, foreground sync, offline recovery and blackhole heartbeat; no page errors')
finally:
    for process in reversed(processes):
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
