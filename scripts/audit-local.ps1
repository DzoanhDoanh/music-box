param([string]$Url = 'http://127.0.0.1:5173/')
$ErrorActionPreference = 'Stop'
# Start pnpm preview first. Only audit an origin authorized for this project.
$env:CHROME_PATH = node --input-type=module -e "import { chromium } from '@playwright/test'; process.stdout.write(chromium.executablePath())"
if ($LASTEXITCODE -ne 0) { throw 'Không tìm thấy Chromium của Playwright.' }
pnpm exec lighthouse $Url --chrome-flags='--headless --disable-gpu' --only-categories=performance,accessibility,best-practices,seo --output=html --output=json --output-path=docs/lighthouse-local --quiet
if ($LASTEXITCODE -ne 0) { throw 'Lighthouse chưa hoàn tất.' }
