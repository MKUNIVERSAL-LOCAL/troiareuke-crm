@echo off
chcp 65001 > nul
title 트로이아르케 CRM - Codex + Claude 협업
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0automation\ai-collab\Start-AICollab.ps1"
echo.
pause
