#!/bin/bash
cd ~/Desktop/projects/freemealsonwheels-web/tools/blender && scp -q kitchen.py pi-windows:C:/fmow/ || exit 1
ssh pi-windows "cd /d C:\\fmow && set BAKE_SAMPLES=${1:-256}&& \"C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe\" -b --factory-startup -P kitchen.py -- C:\\fmow\\out bake C:\\fmow\\logo-heart.png > bakelog.txt 2>&1 & powershell -NoProfile -Command \"Select-String -Path bakelog.txt -Pattern 'Error','Traceback','BAKE_REPORT','EXPORTED','line [0-9]' | Select -Last 25 | % Line\""
