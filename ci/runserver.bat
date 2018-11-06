rem We need a copy of the Web repositoy so that gitlab can reset
rem its own clone during CI
cd C:\Web
git fetch
git reset --hard origin/master
dmenv install
set PYTHONPATH=.
dmenv run python ci\pyback\server.py
pause
