import re

file_path = "rag-service/main.py"
with open(file_path, "r") as f:
    content = f.read()

# 1. process_pdf
content = re.sub(
    r'@app\.post\("/process-pdf"\)\ndef process_pdf\(\n    file: UploadFile = File\(\.\.\.\),',
    '@app.post("/process-pdf")\ndef process_pdf(\n    request: Request,\n    file: UploadFile = File(...),',
    content
)

content = re.sub(
    r'    filename = original_filename or file.filename or "uploaded.pdf"',
    '    user_id = request.headers.get("X-User-Id")\n    if not user_id:\n        raise HTTPException(status_code=401, detail="Unauthorized")\n\n    filename = original_filename or file.filename or "uploaded.pdf"',
    content
)

content = re.sub(
    r'"chat": \[\],\n            }',
    '"chat": [],\n                "user_id": user_id,\n            }',
    content
)

content = re.sub(
    r'    for chunk in chunks:\n        chunk\.metadata\["uploaded_at"\] = now',
    '    for chunk in chunks:\n        chunk.metadata["uploaded_at"] = now\n        chunk.metadata["user_id"] = user_id',
    content
)

# 2. /ask
content = re.sub(
    r'@app\.post\("/ask"\)\nasync def ask_question\(\n    body: AskRequest\n\):',
    '@app.post("/ask")\nasync def ask_question(\n    request: Request,\n    body: AskRequest\n):',
    content
)

content = re.sub(
    r'    session_id = normalize_session_id\(body.session_id\)',
    '    user_id = request.headers.get("X-User-Id")\n    if not user_id:\n        raise HTTPException(status_code=401, detail="Unauthorized")\n\n    session_id = normalize_session_id(body.session_id)',
    content
)

# Add authorization check inside /ask
content = re.sub(
    r'            session = _peek_session_unlocked\(session_id\)\n            if not session:',
    '            session = _peek_session_unlocked(session_id)\n            if not session:\n                raise HTTPException(status_code=404, detail="Session not found")\n            if session.get("user_id") and session.get("user_id") != user_id:\n                raise HTTPException(status_code=403, detail="Forbidden")',
    content
)

# 3. /ask/stream
content = re.sub(
    r'@app\.post\("/ask/stream"\)\nasync def ask_question_stream\(\n    body: AskRequest\n\):',
    '@app.post("/ask/stream")\nasync def ask_question_stream(\n    request: Request,\n    body: AskRequest\n):',
    content
)

content = re.sub(
    r'    session_id = normalize_session_id\(body\.session_id\)\n    session_secret = \(body\.session_secret or ""\)\.strip\(\) or None',
    '    user_id = request.headers.get("X-User-Id")\n    if not user_id:\n        raise HTTPException(status_code=401, detail="Unauthorized")\n\n    session_id = normalize_session_id(body.session_id)\n    session_secret = (body.session_secret or "").strip() or None',
    content
)

content = re.sub(
    r'        with sessions_lock:\n            session = _peek_session_unlocked\(session_id\)\n            if not session:',
    '        with sessions_lock:\n            session = _peek_session_unlocked(session_id)\n            if not session:\n                raise HTTPException(status_code=404, detail="Session not found")\n            if session.get("user_id") and session.get("user_id") != user_id:\n                raise HTTPException(status_code=403, detail="Forbidden")',
    content
)

# 4. /summarize
content = re.sub(
    r'@app\.post\("/summarize"\)\nasync def summarize_pdf\(\n    body: SummarizeRequest\n\):',
    '@app.post("/summarize")\nasync def summarize_pdf(\n    request: Request,\n    body: SummarizeRequest\n):',
    content
)

content = re.sub(
    r'    session_id = normalize_session_id\(body\.session_id\)',
    '    user_id = request.headers.get("X-User-Id")\n    if not user_id:\n        raise HTTPException(status_code=401, detail="Unauthorized")\n\n    session_id = normalize_session_id(body.session_id)',
    content
)

content = re.sub(
    r'            if not session:',
    '            if not session:\n                raise HTTPException(status_code=404, detail="Session not found")\n            if session.get("user_id") and session.get("user_id") != user_id:\n                raise HTTPException(status_code=403, detail="Forbidden")',
    content
)

# 5. /knowledge-gaps
content = re.sub(
    r'@app\.post\("/knowledge-gaps"\)\nasync def map_knowledge_gaps\(\n    body: KnowledgeGapsRequest\n\):',
    '@app.post("/knowledge-gaps")\nasync def map_knowledge_gaps(\n    request: Request,\n    body: KnowledgeGapsRequest\n):',
    content
)

content = re.sub(
    r'    session_id = normalize_session_id\(body\.session_id\)',
    '    user_id = request.headers.get("X-User-Id")\n    if not user_id:\n        raise HTTPException(status_code=401, detail="Unauthorized")\n\n    session_id = normalize_session_id(body.session_id)',
    content
)


with open(file_path, "w") as f:
    f.write(content)

print("Patched main.py successfully.")
