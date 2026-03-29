Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
Set-Location $repoRoot

function Write-Step([string]$message) {
  Write-Host "[Kin-Sell] $message" -ForegroundColor Cyan
}

function Load-DotEnv([string]$path) {
  if (-not (Test-Path $path)) {
    throw "Fichier .env introuvable: $path"
  }

  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) {
      return
    }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"')
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

function Is-PortListening([int]$port) {
  try {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop | Select-Object -First 1
    return $null -ne $listener
  }
  catch {
    return $false
  }
}

function Get-PgPasswordFromDatabaseUrl([string]$databaseUrl) {
  try {
    $uri = [System.Uri]$databaseUrl
    if (-not $uri.UserInfo) {
      return $null
    }

    $parts = $uri.UserInfo.Split(":", 2)
    if ($parts.Count -lt 2) {
      return $null
    }

    return [System.Uri]::UnescapeDataString($parts[1])
  }
  catch {
    return $null
  }
}

function Start-PostgresIfNeeded() {
  $pgBin = "D:\apk\bin"
  $pgData = "D:\apk\data"
  $pgCtl = Join-Path $pgBin "pg_ctl.exe"
  $pgIsReady = Join-Path $pgBin "pg_isready.exe"

  if (-not (Test-Path $pgCtl)) {
    throw "pg_ctl introuvable: $pgCtl"
  }

  if (-not (Test-Path $pgData)) {
    throw "Data directory PostgreSQL introuvable: $pgData"
  }

  if (Is-PortListening 5432) {
    Write-Step "PostgreSQL deja actif sur le port 5432."
    return
  }

  Write-Step "Demarrage PostgreSQL local..."
  & $pgCtl -D $pgData -l (Join-Path $pgData "kinsell-start.log") start | Out-Null

  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    $ready = & $pgIsReady -h localhost -p 5432
    if ($LASTEXITCODE -eq 0) {
      Write-Step "PostgreSQL est pret."
      return
    }
  }

  throw "PostgreSQL ne repond pas sur localhost:5432 apres demarrage."
}

function Ensure-Database() {
  $pgBin = "D:\apk\bin"
  $psql = Join-Path $pgBin "psql.exe"
  $createdb = Join-Path $pgBin "createdb.exe"

  if (-not (Test-Path $psql)) {
    throw "psql introuvable: $psql"
  }

  $dbExists = & $psql -h localhost -p 5432 -U postgres -d postgres -t -c "select 1 from pg_database where datname='kinsell';"
  if (-not $dbExists.Trim()) {
    Write-Step "Creation de la base kinsell..."
    & $createdb -h localhost -p 5432 -U postgres kinsell
  }
  else {
    Write-Step "Base kinsell deja presente."
  }
}

function Run-PrismaMigrations() {
  if (-not (Is-PortListening 4000)) {
    Write-Step "Generation Prisma Client..."
    npm run generate -w packages/db | Out-Host
  }
  else {
    Write-Step "API deja active: generation Prisma ignoree (evite verrou DLL Windows)."
  }

  Write-Step "Application des migrations Prisma..."
  Set-Location (Join-Path $repoRoot "packages\db")
  npx prisma migrate deploy | Out-Host
  Set-Location $repoRoot
}

function Start-AppIfNeeded([int]$port, [string]$name, [string]$command) {
  if (Is-PortListening $port) {
    Write-Step "$name deja actif sur le port $port."
    return
  }

  Write-Step "Demarrage $name..."
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$repoRoot'; $command"
  ) | Out-Null
}

try {
  Write-Step "Chargement des variables d'environnement..."
  Load-DotEnv (Join-Path $repoRoot ".env")

  if (-not $env:DATABASE_URL) {
    throw "DATABASE_URL absent dans .env"
  }

  if (-not $env:PGPASSWORD) {
    $pgPassword = Get-PgPasswordFromDatabaseUrl $env:DATABASE_URL
    if (-not $pgPassword) {
      throw "Impossible d'extraire le mot de passe PostgreSQL depuis DATABASE_URL."
    }
    $env:PGPASSWORD = $pgPassword
  }

  Start-PostgresIfNeeded
  Ensure-Database
  Run-PrismaMigrations

  Start-AppIfNeeded -port 4000 -name "API" -command "npm run dev -w apps/api"
  Start-AppIfNeeded -port 5173 -name "Web" -command "npm run dev -w apps/web"

  Write-Host ""
  Write-Host "[Kin-Sell] Environnement local pret." -ForegroundColor Green
  Write-Host "[Kin-Sell] API  : http://localhost:4000" -ForegroundColor Green
  Write-Host "[Kin-Sell] Web  : http://localhost:5173" -ForegroundColor Green
}
catch {
  Write-Error $_
  exit 1
}
