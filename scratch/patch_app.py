import re

file_path = "frontend/src/App.js"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add checkJobStatusApi import
content = content.replace(
    'import { extractApiErrorMessage, uploadPdfApi, getSessionsApi } from "./services/api";',
    'import { extractApiErrorMessage, uploadPdfApi, getSessionsApi, checkJobStatusApi } from "./services/api";'
)

# Add uploadProgress state
state_search = r"  const \[uploading, setUploading\] = useState\(false\);"
state_replace = r"""  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");"""
content = re.sub(state_search, state_replace, content)

# Modify handleUpload
upload_old = r"""    try \{
      const currentPdfForUpload = pdfs\.find\(p => p\.id === selectedPdf\);
      const data = await uploadPdfApi\(
        file,
        currentPdfForUpload\?\.session_id,
        currentPdfForUpload\?\.session_secret,
      \);
      // Use a local blob URL for the in-browser viewer. The server deletes the
      // uploaded file immediately after the RAG service indexes it, so no
      // server-side URL exists. The blob URL is valid for the lifetime of this
      // browser tab and requires no authentication.
      const url = URL\.createObjectURL\(file\);
      const pdfId = data\.document\?\.document_id \|\| data\.session_id;

      if \(data\.session_id && data\.session_secret\) \{
        upsertKnownSession\(data\.session_id, data\.session_secret\);
      \}

    setPdfs\(\(prev\) => \{
  const updated = \[
    \.\.\.prev,
    \{
      id: pdfId,
      name: file\.name,
      document_id: data\.document\?\.document_id \|\| null,
      url,
      chat: \[\],
      session_id: data\.session_id,
      session_secret: data\.session_secret \|\| null,
    \},
  \];
 
  if \(prev\.length === 0\) \{
    setSelectedPdf\(pdfId\);
  \} else \{
    // Switch to the newly uploaded pdf immediately
    setSelectedPdf\(pdfId\);
  \}
  return updated;
\}\);
      toast\.success\("PDF uploaded successfully!", \{
        id: loadingToast,
      \}\);
    \} catch \(e\) \{"""

upload_new = """    try {
      setUploadProgress(0);
      setUploadStatusText("Uploading...");
      const currentPdfForUpload = pdfs.find(p => p.id === selectedPdf);
      const initialData = await uploadPdfApi(
        file,
        currentPdfForUpload?.session_id,
        currentPdfForUpload?.session_secret,
      );

      const url = URL.createObjectURL(file);
      const jobId = initialData.jobId;
      
      let data = initialData;
      
      if (jobId) {
        // Poll for status
        let isDone = false;
        while (!isDone) {
          await new Promise(r => setTimeout(r, 1000));
          const statusRes = await checkJobStatusApi(jobId);
          setUploadProgress(statusRes.progress || 0);
          
          if (statusRes.status === "completed") {
            isDone = true;
            data = statusRes; // Contains session_id and session_secret
          } else if (statusRes.status === "failed") {
            throw new Error(statusRes.error_message || "Processing failed");
          } else {
             setUploadStatusText(`Processing: ${statusRes.progress || 0}%`);
          }
        }
      }

      const pdfId = data.document?.document_id || data.session_id;

      if (data.session_id && data.session_secret) {
        upsertKnownSession(data.session_id, data.session_secret);
      }

      setPdfs((prev) => {
        const updated = [
          ...prev,
          {
            id: pdfId,
            name: file.name,
            document_id: data.document?.document_id || null,
            url,
            chat: [],
            session_id: data.session_id,
            session_secret: data.session_secret || null,
          },
        ];
       
        if (prev.length === 0) {
          setSelectedPdf(pdfId);
        } else {
          setSelectedPdf(pdfId);
        }
        return updated;
      });
      toast.success("PDF uploaded successfully!", {
        id: loadingToast,
      });
    } catch (e) {"""

content = re.sub(upload_old, upload_new, content)

# Modify UploadCard component to accept uploadProgress and uploadStatusText
# I will pass them from App.js to UploadCard
upload_card_call = r'<UploadCard\s+uploading={uploading}\s+darkMode={darkMode}\s+onUpload={handleUpload}\s+/>'
upload_card_call_new = '<UploadCard uploading={uploading} uploadProgress={uploadProgress} uploadStatusText={uploadStatusText} darkMode={darkMode} onUpload={handleUpload} />'
content = re.sub(upload_card_call, upload_card_call_new, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched App.js successfully.")
