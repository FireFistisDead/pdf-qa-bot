def _extract_pdf_text_worker(
    pdf_path: str,
    max_pages: int,
    max_chars: int,
    out_queue,
):
    """
    Lightweight PDF parser worker used by multiprocessing spawn.
    Switched to PyMuPDF (fitz) for vastly superior text extraction, 
    especially for difficult PDFs like Windows battery reports.
    """
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(pdf_path)

        if doc.needs_pass:
            if not doc.authenticate(""):
                out_queue.put({"ok": False, "error": "Unable to read this PDF. It may be encrypted."})
                return

        page_count = len(doc)
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
        
        for idx in range(min(page_count, max_pages)):
            page = doc[idx]
            text = page.get_text() or ""
            
            if not text.strip():
                continue

            remaining = max_chars - used
            if remaining <= 0:
                break
                
            if len(text) > remaining:
                text = text[:remaining]
                
            used += len(text)
            extracted.append({"page": idx, "text": text})

        doc.close()

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
