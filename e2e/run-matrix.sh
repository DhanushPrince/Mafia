#!/bin/bash
# usage: run-matrix.sh target "narrator Ns" "gm Ns" [tag]
cd /workspace/Mafia-test
T=$1; NN=$2; GG=$3; TAG=${4:-run}
L=/workspace/shots/counts/logs
for n in $NN; do
  timeout 900 env COUNTS=$n GM_COUNTS= node e2e/player-counts.e2e.mjs $T > $L/$TAG-$T-nar-$n.log 2>&1; echo "exit=$?" >> $L/$TAG-$T-nar-$n.log
  cp /tmp/player-counts-$T.json $L/$TAG-$T-nar-$n.json 2>/dev/null
  echo "$T nar $n: $(grep -m1 "N=$n " $L/$TAG-$T-nar-$n.log) $(tail -1 $L/$TAG-$T-nar-$n.log)"
done
for n in $GG; do
  timeout 600 env COUNTS= GM_COUNTS=$n node e2e/player-counts.e2e.mjs $T > $L/$TAG-$T-gm-$n.log 2>&1; echo "exit=$?" >> $L/$TAG-$T-gm-$n.log
  cp /tmp/player-counts-$T.json $L/$TAG-$T-gm-$n.json 2>/dev/null
  echo "$T gm $n: $(grep -A3 "human-gm N=$n" $L/$TAG-$T-gm-$n.log | tr '\n' ' ')"
done
