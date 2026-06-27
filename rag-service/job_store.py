import os
import json
import redis
import time

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

def create_job(job_id: str, filename: str, user_id: str):
    job_data = {
        "job_id": job_id,
        "filename": filename,
        "user_id": user_id,
        "status": "queued",
        "progress": 0,
        "created_at": time.time(),
        "error_message": "",
        "session_id": "",
        "session_secret": ""
    }
    redis_client.hset(f"job:{job_id}", mapping=job_data)
    # Set expiration for jobs after 24 hours
    redis_client.expire(f"job:{job_id}", 86400)
    return job_data

def update_job_status(job_id: str, status: str, progress: int = None, error_message: str = None, session_id: str = None, session_secret: str = None):
    updates = {"status": status}
    if progress is not None:
        updates["progress"] = progress
    if error_message is not None:
        updates["error_message"] = error_message
    if session_id is not None:
        updates["session_id"] = session_id
    if session_secret is not None:
        updates["session_secret"] = session_secret
    
    redis_client.hset(f"job:{job_id}", mapping=updates)

def get_job(job_id: str):
    job = redis_client.hgetall(f"job:{job_id}")
    if not job:
        return None
    # Convert progress to int
    if "progress" in job:
        job["progress"] = int(job["progress"])
    return job
