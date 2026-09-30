"""Browser smoke check for the five-person chapter demo."""
from pathlib import Path
import time
from playwright.sync_api import sync_playwright


def wait_result(page, selector, timeout=60000):
    deadline = time.monotonic() + timeout / 1000
    while time.monotonic() < deadline:
        if page.locator(selector).is_visible():
            return
        for button in page.locator(".ub-button.ready").all():
            if button.is_visible() and button.is_enabled():
                button.click()
        page.wait_for_timeout(150)
    raise AssertionError(f"Timed out waiting for {selector}")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 950})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:8765/rpg/", wait_until="domcontentloaded")
        assert page.locator(".hero-card").count() == 50
        assert page.locator(".team-slot img").count() == 5
        page.screenshot(path=str(Path(__file__).with_name("chapter-roster.png")), full_page=True)
        page.locator("#startChapter").click()
        assert page.locator("#battleScreen").is_visible()
        assert page.locator(".battle-unit.ally").count() == 5
        page.screenshot(path=str(Path(__file__).with_name("chapter-battle.png")), full_page=True)
        for stage in range(1, 5):
            wait_result(page, "#resultScreen:not(.hidden)", timeout=45000)
            assert page.locator("#rewardChoices .reward-choice").count() == 3
            page.locator("#rewardChoices .reward-choice").first.click()
            page.locator("#continueButton").click()
            assert page.locator("#mapScreen").is_visible()
            page.locator("#enterStage").click()
            if stage == 2:
                page.locator("#campModal:not(.hidden)").wait_for()
                page.locator("#campHeal").click()
        wait_result(page, "#clearScreen:not(.hidden)", timeout=60000)
        assert "星灯" in page.locator("#clearScreen h1").inner_text()
        assert not errors, errors
        browser.close()


if __name__ == "__main__":
    main()
