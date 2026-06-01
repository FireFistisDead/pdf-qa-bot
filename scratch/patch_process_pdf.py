import re

file_path = "rag-service/main.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace process_pdf
old_process_pdf_regex = r'@app\.post\("/process-pdf"\)\ndef process_pdf\(.*?(?=\n@app\.post|\n@app\.get|\n@app\.put|\n@app\.delete|\Z)'

new_process_pdf = """@app.post("/process-pdf")
def process_pdf(
    request: Request,
    file: UploadFile = File(...),
    session_id: str | None = Form(None),
    original_filename: str | None = Form(None),
    session_secret: str | None = Form(None)
):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    filename = original_filename or file.filename or "uploaded.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF documents are supported.")
    requested_session_id = None
    if session_id:
        try:
            requested_session_id = normalize_session_id(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session ID format.")
    requested_session_secret = (session_secret or "").strip() or None

    logger.info("Queuing PDF processing filename=%s", filename)
    os.makedirs(str(UPLOADS_DIR), exist_ok=True)
    temp_filename = f"temp_{uuid.uuid4().hex}.pdf"
    temp_path = os.path.join(str(UPLOADS_DIR), temp_filename)

    magic = file.file.read(5)
    if magic[:4] != b"%PDF":
        raise HTTPException(status_code=415, detail="Invalid file type. Only real PDF documents are accepted.")
    file.file.seek(0)

    max_size = 20 * 1024 * 1024
    bytes_written = 0
    with open(temp_path, "wb") as f_out:
        while chunk := file.file.read(65536):
            bytes_written += len(chunk)
            if bytes_written > max_size:
                os.remove(temp_path)
                raise HTTPException(status_code=413, detail="Uploaded PDF exceeds the maximum size of 20MB.")
            f_out.write(chunk)

    if bytes_written == 0:
        os.remove(temp_path)
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty.")
    
    file.file.close()

    # Enqueue job
    import job_store
    job_id = str(uuid.uuid4())
    job_store.create_job(job_id, filename, user_id)
    
    from workers.pdf_processor import process_pdf_task
    process_pdf_task.delay(job_id, temp_path, filename, user_id, requested_session_id, requested_session_secret)
    
    return {"jobId": job_id, "status": "queued"}

@app.get("/process-pdf/{job_id}/status")
def get_job_status(job_id: str, request: Request):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    import job_store
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    return job

"""

content = re.sub(old_process_pdf_regex, new_process_pdf, content, flags=re.DOTALL)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched main.py successfully.")
