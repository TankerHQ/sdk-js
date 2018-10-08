""" Use WebSocket to send 'start' and 'cwd' messages.

React to 'exit' and 'line' messages

"""
import asyncio
import json

import unidecode
import websockets


class ProcessFailed(Exception):
    pass


def sanitize_line(line):
    # Since we are going to print the line in an unkwown
    # stdout, (we don't control gitlab-runner) make sure to only have ASCII
    # chars:
    line = unidecode.unidecode(line)
    return line


def on_message(json_message):
    """React to the message. Returns whether we should stop.

    """
    message = json.loads(json_message)
    line = message.get("line")
    if line:
        line = sanitize_line(line)
        print(line, end="", flush=True)
        return False
    rc = message.get("exit")
    if rc is not None:
        if rc == 0:
            return True
        else:
            print("process exited with", rc)
            raise ProcessFailed(rc)


async def client_loop(url, cmd, working_dir, env):
    async with websockets.connect(url) as websocket:
        message = {
            "cmd": cmd,
            "working_dir": working_dir,
            "env": env
        }
        json_message = json.dumps(message)
        await websocket.send(json_message)
        while True:
            json_message = await websocket.recv()
            done = on_message(json_message)
            if done:
                return


def run_client(cmd, working_dir, env):
    loop = asyncio.get_event_loop()
    loop.run_until_complete(client_loop("ws://localhost:1234", cmd, working_dir, env))
