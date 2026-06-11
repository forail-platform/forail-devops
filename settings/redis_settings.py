import os

_redis_host = os.environ.get('REDIS_HOST', 'redis')
_redis_port = os.environ.get('REDIS_PORT', '6379')

BROKER_URL = f'redis://{_redis_host}:{_redis_port}/0'

CACHES = {
    'default': {
        'BACKEND': 'forail.main.cache.AWXRedisCache',
        'LOCATION': f'redis://{_redis_host}:{_redis_port}/1',
    }
}

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [f'redis://{_redis_host}:{_redis_port}/0'],
            'capacity': 10000,
            'group_expiry': 157784760,
        },
    }
}
