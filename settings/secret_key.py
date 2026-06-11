import os

SECRET_KEY = os.environ.get('FORAIL_SECRET_KEY', os.environ.get('AWX_SECRET_KEY', ''))
