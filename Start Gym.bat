@echo off
rem Double-click to open Gym on this laptop.
rem (The phone uses the online copy, https://fronk001.github.io/gym/;
rem both show the same workouts once signed in.)
title Gym
cd /d "%~dp0"

rem A copy left running from last time would still hold the port: stop it.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8530 " ^| findstr LISTENING') do taskkill /pid %%p /f >nul 2>nul

py tools\serve.py . 8530 --open
