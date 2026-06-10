import re

file_path = "frontend/src/components/UploadCard/UploadCard.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Update signature
content = content.replace(
    'const UploadCard = ({ darkMode, onUpload, uploading }) => {',
    'const UploadCard = ({ darkMode, onUpload, uploading, uploadProgress, uploadStatusText }) => {'
)

# Update the button text part
button_old = r"""                \{uploading \? \(
                  <>
                    <CircularProgress
                      size=\{20\}
                      sx=\{\{
                        color: "#fff",
                        mr: 1,
                      \}\}
                    />
                    Uploading\.\.\.
                  </>
                \) : hasSelectedFiles && files\.length > 1 \? \(
                  "Upload PDFs"
                \) : \(
                  "Upload PDF"
                \)\}"""

button_new = """                {uploading ? (
                  <>
                    <CircularProgress
                      variant={uploadProgress > 0 ? "determinate" : "indeterminate"}
                      value={uploadProgress > 0 ? uploadProgress : undefined}
                      size={20}
                      sx={{
                        color: "#fff",
                        mr: 1,
                      }}
                    />
                    {uploadStatusText || "Uploading..."}
                  </>
                ) : hasSelectedFiles && files.length > 1 ? (
                  "Upload PDFs"
                ) : (
                  "Upload PDF"
                )}"""

content = re.sub(button_old, button_new, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched UploadCard.jsx successfully.")
