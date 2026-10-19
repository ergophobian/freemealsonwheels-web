#!/bin/bash
# cmp.sh <clip> <person> <tag> [frames]   renders a person beside the UAL mannequin on Windows, pulls a sheet to $OUT
OUT=${OUT:-${TMPDIR:-/tmp}/fmow-cmp}; HERE=$(cd $(dirname $0); pwd)
F=${4:-0,6,12,18}
ENVS="CMP=$1 FRAMES=$F $ENVS" $HERE/ppl.sh people.py C:\\fmow\\cmp_$3 $2
mkdir -p $OUT/cmp_$3; scp -q "pi-windows:C:/fmow/cmp_$3/cmp-*.png" $OUT/cmp_$3/
python3 $HERE/sheet.py $OUT/cmp_$3 front,side,sideref $F $OUT/cmp_$3/sheet.png && echo $OUT/cmp_$3/sheet.png
