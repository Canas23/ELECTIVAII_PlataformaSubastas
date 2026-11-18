$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== Subastaya - inicio local ===" -ForegroundColor Cyan

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js no está instalado. Instala Node.js 22.13+ y vuelve a ejecutar este script."
}

$nodeVersion = node -p "process.versions.node"
Write-Host "Node.js: $nodeVersion"

function Ensure-Env($path, $example) {
    if (-not (Test-Path $path)) {
        Copy-Item $example $path
        Write-Host "Creado $path desde $example" -ForegroundColor Green
    }
}

Ensure-Env "$root\.env" "$root\.env.example"
Ensure-Env "$root\frontend\.env" "$root\frontend\.env.example"

$backendEnv = Get-Content "$root\.env" -Raw
if ($backendEnv -match 'JWT_SECRET=\s*$') {
    (Get-Content "$root\.env") -replace '^JWT_SECRET=.*$', 'JWT_SECRET=local-development-jwt-secret-1234567890' | Set-Content "$root\.env"
}
if ($backendEnv -match 'PAYMENT_WEBHOOK_SECRET=\s*$') {
    (Get-Content "$root\.env") -replace '^PAYMENT_WEBHOOK_SECRET=.*$', 'PAYMENT_WEBHOOK_SECRET=local-development-webhook-secret-1234567890' | Set-Content "$root\.env"
}

if (-not (Test-Path "$root\node_modules")) {
    Write-Host "Instalando dependencias del backend..." -ForegroundColor Yellow
    npm ci
}

if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "Instalando dependencias del frontend..." -ForegroundColor Yellow
    Push-Location "$root\frontend"
    npm ci
    Pop-Location
}

Write-Host "Iniciando backend en http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; npm run dev"

Write-Host "Iniciando frontend con Vite ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "Backend:  http://localhost:3000/api/health" -ForegroundColor Cyan
Write-Host "Swagger:  http://localhost:3000/docs" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Se abrieron dos terminales. Mantén ambas abiertas." -ForegroundColor Yellow
