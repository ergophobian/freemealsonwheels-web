#!/bin/bash
# ppl.sh <script.py> <outdir-win> <args...>   env passthrough via ENVS="A=1 B=2"
S=$1; [ -f "$S" ] && S=$(cd $(dirname $S); pwd)/$(basename $S); shift; O=$1; shift
cd ~/Desktop/projects/freemealsonwheels-web/tools/blender && scp -q people.py pi-windows:C:/fmow/ || exit 1
[ -f "$S" ] && scp -q "$S" pi-windows:C:/fmow/
SETS=""; for kv in $ENVS; do SETS="$SETS set $kv&&"; done
ssh pi-windows "cd /d C:\\fmow && $SETS \"C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe\" -b -P $(basename $S) -- $O C:\\fmow\\UAL1_Standard.glb $* > plog.txt 2>&1 & powershell -NoProfile -Command \"Select-String -Path plog.txt -Pattern 'Error','Traceback','_OK','_FAIL','line [0-9]','DBG' | Select -Last 40 | % Line\""
