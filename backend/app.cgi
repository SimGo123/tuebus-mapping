#!.venv/bin/python

import cgitb
cgitb.enable()

import sys
import os

try:
    folder = os.path.dirname(__file__)
    sys.path.insert(0, folder)

    from server import app

    application = app

    from wsgiref.handlers import CGIHandler
    CGIHandler().run(application)

except Exception as e:
    import traceback

    print("Content-Type: text/html\n")
    print("<h1>CGI ERROR</h1>")
    print(e)
    print("<pre>")
    traceback.print_exc()
    print("</pre>")
