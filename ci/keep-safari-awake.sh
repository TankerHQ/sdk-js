#!/bin/bash

while true; do
  echo 'tell application "Safari" to activate' | osascript
  sleep 5;
  echo 'tell application "Finder" to activate' | osascript
  sleep 5;
done;
