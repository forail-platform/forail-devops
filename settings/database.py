import os

DATABASES = {
    'default': {
        'ATOMIC_REQUESTS': True,
        'ENGINE': 'forail.main.db.profiled_pg',
        'NAME': os.environ.get('DATABASE_NAME', os.environ.get('POSTGRES_DB', 'forail')),
        'USER': os.environ.get('DATABASE_USER', os.environ.get('POSTGRES_USER', 'forail')),
        'PASSWORD': os.environ.get('DATABASE_PASSWORD', os.environ.get('POSTGRES_PASSWORD', '')),
        'HOST': os.environ.get('DATABASE_HOST', os.environ.get('POSTGRES_HOST', 'postgres')),
        'PORT': os.environ.get('DATABASE_PORT', os.environ.get('POSTGRES_PORT', '5432')),
    }
}
