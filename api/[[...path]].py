from api.wsgi_adapter import handle
from flask_mp3_site.app import app as flask_app

def handler(event, context):
    return handle(event, context, flask_app)
