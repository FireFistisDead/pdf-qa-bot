def _extract_pdf_text_worker(
    pdf_path: str,
    max_pages: int,
    max_chars: int,
    out_queue,
):
    """
    Lightweight PDF parser worker used by multiprocessing spawn.

    Keep this module free of FastAPI, LangChain, Torch, and Transformers imports.
    On Windows, spawn imports the target function's module in the child process;
    pointing at main.py would load the full RAG stack before parsing starts.
    """
    try:
        from pypdf import PdfReader

        reader = PdfReader(pdf_path, strict=False)

        if getattr(reader, "is_encrypted", False):
            try:
                reader.decrypt("")
            except Exception:
                out_queue.put({"ok": False, "error": "Unable to read this PDF. It may be encrypted."})
                return

        pages = getattr(reader, "pages", [])
        page_count = len(pages)
        if page_count == 0:
            out_queue.put({"ok": False, "error": "No readable pages were found in the PDF."})
            return
        if page_count > max_pages:
            out_queue.put(
                {
                    "ok": False,
                    "error": f"PDF has too many pages ({page_count}). Max allowed is {max_pages}.",
                    "page_count": page_count,
                }
            )
            return

        extracted = []
        used = 0
        for idx, page in enumerate(pages):
            if idx >= max_pages:
                break
            text = page.extract_text() or ""
            if not text.strip():
                continue

            remaining = max_chars - used
            if remaining <= 0:
                break
            if len(text) > remaining:
                text = text[:remaining]
            used += len(text)
            extracted.append({"page": idx, "text": text})

        if not extracted:
            out_queue.put({"ok": False, "error": "No readable text was found in the PDF."})
            return

        out_queue.put(
            {
                "ok": True,
                "page_count": page_count,
                "extracted": extracted,
                "extracted_chars": used,
            }
        )
    except Exception as exc:
        out_queue.put({"ok": False, "error": "Unable to read this PDF. It may be corrupted.", "details": str(exc)})
