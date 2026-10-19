#!/bin/bash
# usage: kb.sh <mode> [samples] [shots]
cd ~/Desktop/projects/freemealsonwheels-web/tools/blender && scp -q kitchen.py pi-windows:C:/fmow/ || exit 1
ssh pi-windows "cd /d C:\\fmow && \"C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe\" -b --factory-startup -P kitchen.py -- C:\\fmow\\out $1 C:\\fmow\\logo-heart.png ${2:-64} ${3:-overview,kitchen,handout,street} > log.txt 2>&1 & type log.txt | findstr /i \"error traceback Saved line\" "
