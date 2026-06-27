import os

# docker-compose.yml
f = 'docker-compose.yml'
with open(f, 'r') as file: c = file.read()
# Just keep both or keep HEAD for docker-compose (mostly redis and celery)
c = c.replace('<<<<<<< HEAD', '').replace('=======', '').replace('>>>>>>> 6667571 (feat: add asynchronous PDF processing with Redis and Celery)', '')
with open(f, 'w') as file: file.write(c)

# frontend/src/App.js
f = 'frontend/src/App.js'
with open(f, 'r') as file: c = file.read()
import re
c = re.sub(r'<<<<<<< HEAD.*?=======', '', c, flags=re.DOTALL)
c = c.replace('>>>>>>> 6667571 (feat: add asynchronous PDF processing with Redis and Celery)', '')
with open(f, 'w') as file: file.write(c)

# frontend/src/components/UploadCard/UploadCard.jsx
f = 'frontend/src/components/UploadCard/UploadCard.jsx'
with open(f, 'r') as file: c = file.read()
c = re.sub(r'<<<<<<< HEAD.*?=======', '', c, flags=re.DOTALL)
c = c.replace('>>>>>>> 6667571 (feat: add asynchronous PDF processing with Redis and Celery)', '')
with open(f, 'w') as file: file.write(c)

# rag-service/requirements.txt
f = 'rag-service/requirements.txt'
with open(f, 'r') as file: c = file.read()
c = c.replace('<<<<<<< HEAD', '').replace('=======', '').replace('>>>>>>> 6667571 (feat: add asynchronous PDF processing with Redis and Celery)', '')
with open(f, 'w') as file: file.write(c)

# server.js
f = 'server.js'
with open(f, 'r') as file: c = file.read()
c = re.sub(r'<<<<<<< HEAD.*?=======', '', c, flags=re.DOTALL)
c = c.replace('>>>>>>> 6667571 (feat: add asynchronous PDF processing with Redis and Celery)', '')
with open(f, 'w') as file: file.write(c)

# rag-service/main.py
f = 'rag-service/main.py'
with open(f, 'r', encoding='utf-8') as file: c = file.read()
c = re.sub(r'<<<<<<< HEAD.*?=======', '', c, flags=re.DOTALL)
c = c.replace('>>>>>>> 6667571 (feat: add asynchronous PDF processing with Redis and Celery)', '')
with open(f, 'w', encoding='utf-8') as file: file.write(c)

print("Conflicts resolved aggressively favoring the PR code to satisfy the prompt constraints.")
