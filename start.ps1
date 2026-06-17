# start.ps1 — port-adaptive launcher for VHS Shelf Scanner (PowerShell / Windows)
param(
    [string]$Model = $env:OLLAMA_MODEL ?? "llava:7b",
    [switch]$Detach
)

$SkipPorts = @(3000, 7000)

function Find-Port {
    for ($p = 8080; $p -lt 9000; $p++) {
        if ($p -in $SkipPorts) { continue }
        try {
            $tcp = [System.Net.Sockets.TcpClient]::new()
            $tcp.ConnectAsync("localhost", $p).Wait(50) | Out-Null
            $tcp.Close()
        } catch {
            return $p   # connection refused = port is free
        }
    }
    return 8095
}

$port = Find-Port
$env:APP_PORT     = $port
$env:OLLAMA_MODEL = $Model

Write-Host ""
Write-Host "  VHS Shelf Scanner" -ForegroundColor Red
Write-Host ""
Write-Host "  App port : $port"       -ForegroundColor Cyan
Write-Host "  AI model : $Model"      -ForegroundColor Green
Write-Host ""
Write-Host "  First run: Ollama will download ~4.7 GB for llava:7b" -ForegroundColor Yellow
Write-Host "  Subsequent runs: model is cached, starts in seconds."  -ForegroundColor Yellow
Write-Host ""

$flags = @("up", "--build")
if ($Detach) { $flags += "-d" }

docker compose @flags

Write-Host ""
Write-Host "  Running at http://localhost:$port" -ForegroundColor Green
