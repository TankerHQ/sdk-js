import asyncio
import json
import subprocess

import websockets


async def on_message(websocket, json_message):
    message = json.loads(json_message)
    working_dir = message["working_dir"]
    env = message["env"]
    cmd = message["cmd"]
    await run_cmd(websocket, cmd, env=env, working_dir=working_dir)


async def run_cmd(websocket, cmd, *, env, working_dir):
    print(working_dir, ">", cmd)
    process = subprocess.Popen(
        cmd, shell=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        cwd=working_dir,
        env=env
    )
    while True:
        returncode = process.poll()
        if returncode is not None:
            print("[%i]" % returncode, flush=True)
            message = {"exit": returncode}
            await websocket.send(json.dumps(message))
            return
        else:
            line = process.stdout.readline()
            message = {"line": line.decode(errors="replace")}
            await websocket.send(json.dumps(message))


async def socket_handler(websocket, path):
    async for message in websocket:
        await on_message(websocket, message)


def main():
    loop = asyncio.get_event_loop()
    loop.run_until_complete(
        websockets.serve(socket_handler, '127.0.0.1', 1234))
    loop.run_forever()


if __name__ == "__main__":
    main()
