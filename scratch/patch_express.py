import re

file_path = "server.js"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update /upload success response
upload_return_old = r"""    return res\.json\(\{
      message: "PDF uploaded & processed successfully!",
      session_id: response\.data\.session_id,
      session_secret: response\.data\.session_secret,
      document: response\.data\.document,
      documents: response\.data\.documents \|\| \[\],
    \}\);"""
upload_return_new = """    return res.json({
      message: "PDF uploaded and queued for processing successfully!",
      jobId: response.data.jobId,
      status: response.data.status
    });"""
content = re.sub(upload_return_old, upload_return_new, content)

# 2. Update /process-from-url success response
url_return_old = r"""    return res\.json\(\{
      message: "PDF processed and indexed successfully\.",
      session_id: ragResponse\.data\.session_id,
      session_secret: ragResponse\.data\.session_secret,
      document: ragResponse\.data\.document,
      documents: ragResponse\.data\.documents \|\| \[\],
    \}\);"""
url_return_new = """    return res.json({
      message: "PDF from URL queued for processing successfully!",
      jobId: ragResponse.data.jobId,
      status: ragResponse.data.status
    });"""
content = re.sub(url_return_old, url_return_new, content)

# 3. Add /upload/:jobId/status
status_endpoint = """
app.get("/upload/:jobId/status", authenticateUser, async (req, res) => {
  try {
    const response = await axios.get(`${RAG_SERVICE_URL}/process-pdf/${req.params.jobId}/status`, {
      headers: ragAuthHeaders(req)
    });
    return res.json(response.data);
  } catch (err) {
    const statusCode = err.response?.status || 500;
    const details = err.response?.data || err.message;
    return res.status(statusCode).json({ error: "Failed to fetch job status", details });
  }
});
"""

# Insert status_endpoint before /ask
content = content.replace('app.post("/ask",', status_endpoint + '\napp.post("/ask",')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched server.js successfully.")
