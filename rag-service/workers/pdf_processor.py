import os
import uuid
import threading
from collections import OrderedDict

# Import celery app
from celery_app import celery_app
from job_store import update_job_status, get_job

# Import RAG service dependencies from main.py
import main as rag_main

@celery_app.task(bind=True, name="workers.pdf_processor.process_pdf_task")
def process_pdf_task(self, job_id: str, temp_path: str, filename: str, user_id: str, requested_session_id: str = None, requested_session_secret: str = None):
    try:
        update_job_status(job_id, status="processing", progress=5)
        
        # 1. Extraction
        rag_main.logger.info(f"Worker extracting text for job {job_id}")
        docs = rag_main.extract_pdf_documents_sandboxed(temp_path, filename)
        if not docs:
            update_job_status(job_id, status="failed", error_message="No readable pages were found in the PDF.")
            return

        update_job_status(job_id, status="processing", progress=30)
        
        # 2. Chunking
        document_id = str(uuid.uuid4())
        all_chunks = []
        seen_content = set()
        for doc in docs:
            page_number = doc.metadata.get("page", 0)
            page_text = doc.page_content or ""
            for chunk_doc in rag_main.semantic_chunk(page_text, filename, page_number, document_id):
                content = chunk_doc.page_content.strip()
                if content and content not in seen_content:
                    seen_content.add(content)
                    all_chunks.append(chunk_doc)
        
        chunks = all_chunks
        if not chunks:
            update_job_status(job_id, status="failed", error_message="No text chunks generated from the PDF.")
            return
            
        update_job_status(job_id, status="processing", progress=60)
        
        # Session setup
        processing_session_id = requested_session_id or str(uuid.uuid4())
        created_at = rag_main.now_ts()
        new_session_secret = requested_session_secret or rag_main.generate_session_secret()
        
        now = created_at
        uploaded_document = {
            "document_id": document_id,
            "filename": filename,
            "uploaded_at": now,
            "chunk_count": len(chunks),
        }
        
        for chunk in chunks:
            chunk.metadata["uploaded_at"] = now
            chunk.metadata["user_id"] = user_id
            
        # 3. Embeddings
        update_job_status(job_id, status="processing", progress=85)
        embeddings = rag_main.get_embedding_model()
        new_vectorstore = rag_main.FAISS.from_documents(chunks, embeddings)
        
        # 4. Persistence
        update_job_status(job_id, status="processing", progress=95)
        
        with rag_main.sessions_lock:
            # Add to memory so we can persist
            if processing_session_id not in rag_main.sessions:
                rag_main.sessions[processing_session_id] = {
                    "vectorstore": None,
                    "lock": threading.Lock(),
                    "documents": [],
                    "session_secret": new_session_secret,
                    "session_dir": None,
                    "created_at": created_at,
                    "last_accessed": created_at,
                    "retrieval_cache": OrderedDict(),
                    "chat": [],
                    "user_id": user_id,
                }
            
            session = rag_main.sessions[processing_session_id]
            if session["vectorstore"] is None:
                session["vectorstore"] = new_vectorstore
            else:
                session["vectorstore"].merge_from(new_vectorstore)
                
            session["documents"].append(uploaded_document)
            session["last_accessed"] = now
            
            session_dir = rag_main.persist_vectorstore(processing_session_id, session["vectorstore"])
            session["session_dir"] = session_dir
            rag_main.persist_session_registry_entry(processing_session_id, session)

        update_job_status(job_id, status="completed", progress=100, session_id=processing_session_id, session_secret=new_session_secret)
        
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
    except Exception as e:
        rag_main.logger.exception(f"Worker failed for job {job_id}")
        update_job_status(job_id, status="failed", error_message=str(e))
        if os.path.exists(temp_path):
            os.remove(temp_path)
