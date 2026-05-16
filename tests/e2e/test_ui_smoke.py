"""Selenium smoke tests against a running Letsgo stack (Docker or local).

Environment:
  BASE_URL      e.g. http://localhost:3000  (default)
  SKIP_E2E      set to 1 to skip entire module
"""

from __future__ import annotations

import os
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager


@pytest.fixture(scope="module")
def driver():
    if os.environ.get("SKIP_E2E", "").strip() == "1":
        pytest.skip("SKIP_E2E=1")

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1280,900")
    if bin_path := os.environ.get("CHROME_BIN", "").strip():
        opts.binary_location = bin_path
    svc = Service(ChromeDriverManager().install())
    d = webdriver.Chrome(service=svc, options=opts)
    d.implicitly_wait(5)
    yield d
    d.quit()


@pytest.fixture(scope="module")
def base_url():
    return os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")


def test_login_page_loads(driver, base_url):
    driver.get(f"{base_url}/login")
    wait = WebDriverWait(driver, 20)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='password']")))
    assert "letsgo" in driver.title.lower() or "login" in driver.page_source.lower()


def test_register_link_or_form(driver, base_url):
    driver.get(f"{base_url}/register")
    wait = WebDriverWait(driver, 20)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email'], input[name='email']")))
