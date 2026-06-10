import re

file_path = "server.test.js"
with open(file_path, "r") as f:
    content = f.read()

# Add a token variable and before hook to generate it
auth_setup = """
  let authToken = "";
  before(async () => {
    // Generate a valid token by signing up
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `test-${Date.now()}@example.com`, password: "ValidPassword123!" }),
    });
    const data = await res.json();
    authToken = data.token;
  });
"""

# Replace `before(() => { return new Promise...` block to include our setup
content = re.sub(
    r'  before\(\(\) => \{\n    return new Promise\(\(resolve\) => \{',
    r'  let authToken = "";\n  before(async () => {\n    await new Promise((resolve) => {\n      server = http.createServer(app);\n      server.listen(0, () => {\n        const address = server.address();\n        baseUrl = `http://127.0.0.1:${address.port}`;\n        resolve();\n      });\n    });\n    const res = await fetch(`${baseUrl}/api/auth/signup`, {\n      method: "POST",\n      headers: { "Content-Type": "application/json" },\n      body: JSON.stringify({ email: `test-${Date.now()}@example.com`, password: "ValidPassword123!" }),\n    });\n    const data = await res.json();\n    authToken = data.token;\n  });\n  //',
    content
)

# Add headers to all fetch calls (except auth ones)
# Find `headers: { "Content-Type": "application/json" },` and add Authorization
content = re.sub(
    r'headers: \{ "Content-Type": "application/json" \},',
    r'headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },',
    content
)

# For `body: formData,` where headers wasn't there
content = re.sub(
    r'      method: "POST",\n      body: createPdfUploadBody',
    r'      method: "POST",\n      headers: { "Authorization": `Bearer ${authToken}` },\n      body: createPdfUploadBody',
    content
)

content = re.sub(
    r'      method: "POST",\n      body: formData,',
    r'      method: "POST",\n      headers: { "Authorization": `Bearer ${authToken}` },\n      body: formData,',
    content
)

# For GET requests that return 404 (we can just leave them or add token)
content = re.sub(
    r'      method: "GET",\n    \}\);',
    r'      method: "GET",\n      headers: { "Authorization": `Bearer ${authToken}` },\n    });',
    content
)

with open(file_path, "w") as f:
    f.write(content)

print("Patched server.test.js successfully.")
