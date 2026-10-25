# Publica o servidor de salas do EVA 3 na Cloudflare.
# O site é publicado sozinho pelo Netlify a cada push no GitHub; rode este script só quando mudar a pasta server/.
# Rode com dois cliques em publicar.cmd (ou: powershell -ExecutionPolicy Bypass -File publicar.ps1).
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

function Passo($n, $texto) { Write-Host ''; Write-Host "=== $n. $texto ===" -ForegroundColor Cyan }
function Checar($oque) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Falhou: $oque. Veja a mensagem acima." -ForegroundColor Red
        Read-Host 'Enter para sair'
        exit 1
    }
}

Passo 1 'Instalando dependências do servidor'
npm install --prefix server --no-audit --no-fund; Checar 'npm install do servidor'

Push-Location server
Passo 2 'Cloudflare: conferindo login'
$quem = npx wrangler whoami 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $quem -match 'not authenticated') {
    npx wrangler login; Checar 'login na Cloudflare'
}

Passo 3 'Publicando o servidor de salas'
npx wrangler deploy; Checar 'publicar o servidor'
Pop-Location

Write-Host ''
Write-Host 'Pronto! Servidor de salas publicado. Copie o endereço *.workers.dev acima para VITE_SERVER_URL no Netlify (trocando https por wss).' -ForegroundColor Green
Read-Host 'Enter para fechar'
